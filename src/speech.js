let request = 0;
let boundSynth = null;
let bindId = 0;
const waiters = new Set();

const RATE = 0.85;
const NORMAL_PITCH = 1;
// Last resort when no female voice can be selected. Android Chrome usually
// cannot switch the system TTS voice, and a higher pitch is what changes the sound.
export const FALLBACK_PITCH = 1.4;
export const VOICE_WAIT_MS = 800;

// Known female English voices, best first. These are personal or product names,
// not language labels. "English United States" is a language slot on Android,
// and Chrome plays whatever voice is selected in system TTS settings.
export const FEMALE_VOICE_PREFERENCES = [
  "Samantha",
  "Karen",
  "Moira",
  "Tessa",
  "Google UK English Female",
  "Google US English",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Jenny",
  "Microsoft Zira",
  "Zira",
  "Allison",
  "Ava",
  "Nicky",
  "Zoe",
  "Victoria",
  "Fiona",
  "Kate",
  "Serena",
  "Veena",
  "Nora",
  "Shelley",
  "Kathy",
  "Microsoft Libby",
  "Microsoft Sonia",
  "Microsoft Michelle",
  "Microsoft Natasha",
  "Microsoft Ana",
  "Microsoft Hazel",
  "Microsoft Susan",
  "Microsoft Heera",
  "Microsoft Linda",
  "Samsung English Female",
];

// Google TTS codes. sfg without a male marker is the US female voice.
// iob / iog / iol / iom are the common US male codes. tpf is omitted because
// published lists disagree about its gender.
const MALE_VOICE_CODES = ["iob", "iog", "iol", "iom"];

function asVoiceArray(voices) {
  if (!voices) return [];
  if (Array.isArray(voices)) return voices;
  if (typeof voices.length === "number") {
    try {
      return Array.from(voices);
    } catch {
      return [];
    }
  }
  return [];
}

function identityText(voice) {
  return `${voice?.name || ""} ${voice?.voiceURI || ""}`
    .toLowerCase()
    .replace(/[_#.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textHas(text, phrase) {
  const needle = String(phrase || "")
    .toLowerCase()
    .replace(/[_#.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`, "i").test(` ${text} `);
}

function isEnglish(voice) {
  const lang = String(voice?.lang || "").toLowerCase().replaceAll("_", "-");
  return lang.startsWith("en");
}

export function describeVoice(voice) {
  const text = identityText(voice);
  const saysFemale = /\bfemale\b/.test(text) || /\bsiri female\b/.test(text);
  const saysMale = /\bmale\b/.test(text) || /\bsiri male\b/.test(text);
  const femaleCode = /\bsfg\b/.test(text);
  const maleCode = MALE_VOICE_CODES.some((code) => textHas(text, code));
  return {
    text,
    female: (saysFemale || femaleCode) && !saysMale,
    male: (saysMale || maleCode) && !saysFemale,
  };
}

function voiceScore(voice) {
  const lang = String(voice?.lang || "").toLowerCase().replaceAll("_", "-");
  const name = identityText(voice);
  let score = 0;
  if (lang === "en-us") score += 5;
  else if (lang.startsWith("en-us")) score += 4;
  else if (lang.startsWith("en")) score += 1;
  if (name.includes("natural") || name.includes("enhanced") || name.includes("premium")) score += 2;
  if (voice?.localService) score += 1;
  return score;
}

function best(voices) {
  if (!voices.length) return null;
  return [...voices].sort((left, right) => voiceScore(right) - voiceScore(left))[0];
}

export function pickFemaleVoice(voices) {
  const list = asVoiceArray(voices);
  if (!list.length) return null;
  const taggedEnglish = list.filter((voice) => isEnglish(voice));
  const untagged = list.filter((voice) => !String(voice?.lang || "").trim());
  const pool = (taggedEnglish.length ? taggedEnglish : untagged).filter((voice) => !describeVoice(voice).male);
  if (!pool.length) return null;

  for (const preference of FEMALE_VOICE_PREFERENCES) {
    const chosen = best(pool.filter((voice) => textHas(describeVoice(voice).text, preference)));
    if (chosen) return chosen;
  }

  return best(pool.filter((voice) => describeVoice(voice).female));
}

function pickEnglishFallback(voices) {
  const english = asVoiceArray(voices).filter((voice) => isEnglish(voice));
  if (!english.length) return null;
  const unmarked = english.filter((voice) => !describeVoice(voice).male);
  return best(unmarked.length ? unmarked : english);
}

export function planSpeech(text, voices) {
  const female = pickFemaleVoice(voices);
  const voice = female || pickEnglishFallback(voices);
  return {
    text,
    voice: voice || null,
    voiceURI: voice?.voiceURI || "",
    lang: voice?.lang || "en-US",
    rate: RATE,
    pitch: female ? NORMAL_PITCH : FALLBACK_PITCH,
    female: Boolean(female),
  };
}

function applyPlan(utterance, plan) {
  utterance.rate = plan.rate;
  utterance.pitch = plan.pitch;
  utterance.lang = plan.lang;
  if (!plan.voice) return utterance;
  try {
    utterance.voice = plan.voice;
  } catch {
    // A voice object from another document can throw. lang and pitch still apply.
  }
  // Set lang again after voice. Android Chrome ignores utterance.voice unless
  // lang is exactly voice.lang, including an underscore form such as en_US.
  if (plan.voice.lang) utterance.lang = plan.voice.lang;
  try {
    if (plan.voiceURI) utterance.voiceURI = plan.voiceURI;
  } catch {
    // voiceURI is not writable in every browser.
  }
  return utterance;
}

function installVoiceListener(synth) {
  if (!synth || boundSynth === synth) return;
  boundSynth = synth;
  const id = ++bindId;
  const flush = () => {
    if (id !== bindId) return;
    let voices = [];
    try {
      voices = asVoiceArray(synth.getVoices());
    } catch {
      voices = [];
    }
    if (!voices.length) return;
    for (const waiter of [...waiters]) {
      waiters.delete(waiter);
      waiter(voices);
    }
  };
  if (typeof synth.addEventListener === "function") {
    synth.addEventListener("voiceschanged", flush);
  }
  synth.onvoiceschanged = flush;
  try {
    synth.getVoices();
  } catch {
    // Some browsers only fill the list after voiceschanged.
  }
}

function withVoices(mine, run) {
  const synth = window.speechSynthesis;
  const deliver = (voices) => {
    if (mine !== request) return;
    run(asVoiceArray(voices));
  };

  let ready = [];
  try {
    ready = asVoiceArray(synth.getVoices());
  } catch {
    deliver([]);
    return;
  }
  if (ready.length) {
    deliver(ready);
    return;
  }

  installVoiceListener(synth);
  try {
    ready = asVoiceArray(synth.getVoices());
  } catch {
    ready = [];
  }
  if (ready.length) {
    deliver(ready);
    return;
  }

  let timer = 0;
  const waiter = (voices) => {
    clearTimeout(timer);
    deliver(voices);
  };
  waiters.add(waiter);
  timer = setTimeout(() => {
    if (!waiters.has(waiter)) return;
    waiters.delete(waiter);
    let latest = [];
    try {
      latest = asVoiceArray(synth.getVoices());
    } catch {
      latest = [];
    }
    deliver(latest);
  }, VOICE_WAIT_MS);
}

function speak(parts, hooks = {}) {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
  const mine = ++request;
  try {
    synth.cancel();
  } catch {
    // cancel can throw if speech was never started.
  }
  withVoices(mine, (voices) => {
    if (mine !== request) return;
    let index = 0;
    const step = () => {
      if (mine !== request) return;
      if (index >= parts.length) {
        hooks.onDone?.();
        return;
      }
      hooks.onStart?.(index);
      const utterance = applyPlan(new SpeechSynthesisUtterance(parts[index]), planSpeech(parts[index], voices));
      const advance = () => {
        if (mine !== request) return;
        index += 1;
        step();
      };
      utterance.onend = advance;
      utterance.onerror = advance;
      try {
        synth.resume();
      } catch {
        // resume is a no-op when nothing is paused.
      }
      synth.speak(utterance);
    };
    step();
  });
  return true;
}

export function speakWord(word, onDone) {
  return speak([word], { onDone });
}

export function speakSequence(parts, hooks = {}) {
  return speak(parts, hooks);
}

export function stopSpeaking() {
  request += 1;
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // Ignore a missing or locked speech engine.
  }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  installVoiceListener(window.speechSynthesis);
}
