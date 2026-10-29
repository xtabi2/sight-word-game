let request = 0;
let boundSynth = null;
const waiters = new Set();

// Known female English voices, best first, across iOS, macOS, Chrome, Android, and Edge.
export const FEMALE_VOICE_PREFERENCES = [
  "Samantha",
  "Karen",
  "Moira",
  "Tessa",
  "Google US English",
  "Google UK English Female",
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
  "English United States",
];

function voiceName(voice) {
  return String(voice?.name || "");
}

function isEnglish(voice) {
  const lang = String(voice?.lang || "").toLowerCase().replaceAll("_", "-");
  return lang.startsWith("en");
}

function isMaleVoice(voice) {
  const blob = `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
  if (blob.includes("female")) return false;
  return /\bmale\b/.test(blob);
}

function nameHas(voice, preference) {
  const name = voiceName(voice);
  const escaped = preference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i");
  return pattern.test(name);
}

function voiceScore(voice) {
  const name = voiceName(voice).toLowerCase();
  const lang = String(voice?.lang || "").toLowerCase().replaceAll("_", "-");
  let score = 0;
  if (lang === "en-us") score += 3;
  if (name.includes("natural") || name.includes("enhanced") || name.includes("premium")) score += 2;
  return score;
}

function looksExplicitlyFemale(voice) {
  const blob = `${voice?.name || ""} ${voice?.voiceURI || ""}`.toLowerCase();
  if (/\bmale\b/.test(blob.replaceAll("female", ""))) return false;
  return blob.includes("female") || blob.includes("sfg");
}

export function pickFemaleVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const taggedEnglish = voices.filter((voice) => isEnglish(voice));
  const untagged = voices.filter((voice) => !String(voice?.lang || "").trim());
  const pool = (taggedEnglish.length ? taggedEnglish : untagged).filter((voice) => !isMaleVoice(voice));
  if (!pool.length) return null;

  for (const preference of FEMALE_VOICE_PREFERENCES) {
    const matches = pool.filter((voice) => nameHas(voice, preference));
    if (!matches.length) continue;
    matches.sort((left, right) => voiceScore(right) - voiceScore(left));
    return matches[0];
  }

  return pool.find((voice) => looksExplicitlyFemale(voice)) ?? null;
}

function installVoiceListener(synth) {
  if (!synth || boundSynth === synth) return;
  boundSynth = synth;
  const flush = () => {
    let voices = [];
    try {
      voices = synth.getVoices() || [];
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
    run(voices || []);
  };

  let ready = [];
  try {
    ready = synth.getVoices() || [];
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
    ready = synth.getVoices() || [];
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
      latest = synth.getVoices() || [];
    } catch {
      latest = [];
    }
    deliver(latest);
  }, 400);
}

function prepare(text, voices) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  try {
    const voice = pickFemaleVoice(voices);
    if (voice) utterance.voice = voice;
  } catch {
    // An empty or unusual voice list should still leave the words speakable.
  }
  return utterance;
}

export function speakWord(word, onDone) {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
  const mine = ++request;
  synth.cancel();
  withVoices(mine, (voices) => {
    if (mine !== request) return;
    const utterance = prepare(word, voices);
    let finished = false;
    const finish = () => {
      if (finished || mine !== request) return;
      finished = true;
      onDone?.();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.resume();
    synth.speak(utterance);
  });
  return true;
}

export function speakSequence(parts, hooks = {}) {
  const synth = typeof window === "undefined" ? undefined : window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
  const mine = ++request;
  synth.cancel();
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
      const utterance = prepare(parts[index], voices);
      const advance = () => {
        if (mine !== request) return;
        index += 1;
        step();
      };
      utterance.onend = advance;
      utterance.onerror = advance;
      synth.resume();
      synth.speak(utterance);
    };
    step();
  });
  return true;
}

export function stopSpeaking() {
  request += 1;
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
}
