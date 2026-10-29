import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_PITCH,
  FEMALE_VOICE_PREFERENCES,
  VOICE_WAIT_MS,
  pickFemaleVoice,
  planSpeech,
  speakSequence,
  speakWord,
  stopSpeaking,
} from "../src/speech.js";

const requiredNames = [
  "Samantha",
  "Karen",
  "Moira",
  "Tessa",
  "Google US English",
  "Microsoft Aria",
  "Jenny",
  "Zira",
];

test("preference list names the common female voices", () => {
  for (const name of requiredNames) {
    assert.ok(FEMALE_VOICE_PREFERENCES.includes(name), `${name} should be preferred`);
  }
  assert.equal(FEMALE_VOICE_PREFERENCES.includes("English United States"), false);
  const order = requiredNames.map((name) => FEMALE_VOICE_PREFERENCES.indexOf(name));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.ok(
    FEMALE_VOICE_PREFERENCES.indexOf("Google UK English Female")
      < FEMALE_VOICE_PREFERENCES.indexOf("Google US English"),
  );
});

test("picks Samantha ahead of the other preferred female voices", () => {
  const voices = [
    { name: "Microsoft Zira Desktop - English (United States)", lang: "en-US" },
    { name: "Microsoft Jenny Online (Natural) - English (United States)", lang: "en-US" },
    { name: "Google US English", lang: "en-US" },
    { name: "Tessa", lang: "en-ZA" },
    { name: "Moira", lang: "en-IE" },
    { name: "Karen", lang: "en-AU" },
    { name: "Samantha", lang: "en-US" },
    { name: "Alex", lang: "en-US" },
  ];
  const expected = [
    "Samantha",
    "Karen",
    "Moira",
    "Tessa",
    "Google US English",
    "Microsoft Jenny Online (Natural) - English (United States)",
    "Microsoft Zira Desktop - English (United States)",
  ];
  let remaining = voices;
  for (const name of expected) {
    assert.equal(pickFemaleVoice(remaining).name, name);
    remaining = remaining.filter((voice) => voice.name !== name);
  }
});

test("matches natural Microsoft voices and skips male names", () => {
  const aria = { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US" };
  const david = { name: "Microsoft David Desktop - English (United States)", lang: "en-US" };
  const male = { name: "Google UK English Male", lang: "en-GB" };
  const female = { name: "Google UK English Female", lang: "en-GB" };
  assert.equal(pickFemaleVoice([david, male, aria]), aria);
  assert.equal(pickFemaleVoice([male, female]), female);
  assert.equal(pickFemaleVoice([david, male, { name: "Daniel", lang: "en-GB" }]), null);
  assert.equal(pickFemaleVoice([male, { name: "Google US English", lang: "en-US" }]).name, "Google US English");
});

test("does not treat a longer name as a short female name", () => {
  assert.equal(pickFemaleVoice([{ name: "Maria", lang: "en-US" }]), null);
  assert.equal(pickFemaleVoice([{ name: "Katie", lang: "en-US" }]), null);
});

test("prefers an enhanced voice and an explicit female marker", () => {
  const plain = { name: "Samantha", lang: "en-US" };
  const enhanced = { name: "Samantha (Enhanced)", lang: "en-US" };
  assert.equal(pickFemaleVoice([plain, enhanced]), enhanced);

  const android = { name: "English (United States)", lang: "en-US", voiceURI: "en-us-x-sfg-local" };
  assert.equal(pickFemaleVoice([android, { name: "Daniel", lang: "en-GB" }]), android);
});

test("reads Samantha from an Apple voiceURI when the display name is localized", () => {
  const voice = {
    name: "Inglés (Estados Unidos)",
    lang: "en-US",
    voiceURI: "com.apple.voice.compact.en-US.Samantha",
  };
  const alex = {
    name: "Inglés (Estados Unidos)",
    lang: "en-US",
    voiceURI: "com.apple.voice.compact.en-US.Alex",
  };
  assert.equal(pickFemaleVoice([alex, voice]), voice);
  const plan = planSpeech("cat", [alex, voice]);
  assert.equal(plan.voice, voice);
  assert.equal(plan.pitch, 1);
  assert.equal(plan.lang, "en-US");
  assert.equal(plan.voiceURI, voice.voiceURI);
});

test("on Android, prefers an sfg voice over a male code with the same name", () => {
  const female = {
    name: "English United States",
    lang: "en_US",
    voiceURI: "en-us-x-sfg-local",
    localService: true,
  };
  const male = {
    name: "English United States",
    lang: "en_US",
    voiceURI: "en-us-x-iob-local",
    localService: true,
    default: true,
  };
  const network = {
    name: "English United States",
    lang: "en_US",
    voiceURI: "en-us-x-sfg-network",
    localService: false,
  };
  assert.equal(pickFemaleVoice([male, network, female]), female);
  const plan = planSpeech("pig", [male, network, female]);
  assert.equal(plan.female, true);
  assert.equal(plan.voice, female);
  assert.equal(plan.lang, "en_US");
  assert.equal(plan.voiceURI, "en-us-x-sfg-local");
  assert.equal(plan.pitch, 1);
  assert.equal(plan.rate, 0.85);
});

test("does not treat sfg#male as female", () => {
  const male = { name: "English United States", lang: "en-US", voiceURI: "en-us-x-sfg#male_1-local" };
  const female = { name: "English United States", lang: "en-US", voiceURI: "en-us-x-sfg#female_2-local" };
  assert.equal(pickFemaleVoice([male, female]), female);
  assert.equal(pickFemaleVoice([male]), null);
});

test("Android language slots are not female voices and use a higher pitch", () => {
  const voices = [
    { name: "English United States", lang: "en_US", voiceURI: "English United States", default: true, localService: true },
    { name: "English United Kingdom", lang: "en_GB", voiceURI: "English United Kingdom", localService: true },
  ];
  assert.equal(pickFemaleVoice(voices), null);
  const plan = planSpeech("cat", voices);
  assert.equal(plan.female, false);
  assert.equal(plan.voice, voices[0]);
  assert.equal(plan.lang, "en_US");
  assert.equal(plan.voiceURI, "English United States");
  assert.equal(plan.pitch, FALLBACK_PITCH);
  assert.ok(plan.pitch >= 1.3 && plan.pitch <= 1.5);
});

test("accepts an array-like voice list and ignores a non-English Samantha", () => {
  const samantha = { name: "Samantha", lang: "en-US" };
  const list = { 0: { name: "Alex", lang: "en-US" }, 1: samantha, length: 2 };
  assert.equal(pickFemaleVoice(list), samantha);
  assert.equal(pickFemaleVoice([{ name: "Samantha", lang: "fr-FR" }]), null);
  assert.equal(pickFemaleVoice([]), null);
  assert.equal(pickFemaleVoice(undefined), null);
  const untagged = { name: "Samantha" };
  assert.equal(pickFemaleVoice([untagged]), untagged);
  const empty = planSpeech("hi", []);
  assert.equal(empty.voice, null);
  assert.equal(empty.lang, "en-US");
  assert.equal(empty.pitch, FALLBACK_PITCH);
});

test("speakWord and speakSequence share one helper, including the first tap", async () => {
  const listeners = new Set();
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.pitch = 1;
      this.voice = null;
      this.voiceURI = "";
    }
  }
  let voices = [];
  const synth = {
    spoken: [],
    getVoices() {
      return voices;
    },
    addEventListener(type, fn) {
      if (type === "voiceschanged") listeners.add(fn);
    },
    removeEventListener() {},
    cancel() {},
    resume() {},
    speak(utterance) {
      this.spoken.push(utterance);
    },
  };
  const previousWindow = globalThis.window;
  const previousUtterance = globalThis.SpeechSynthesisUtterance;
  globalThis.window = { speechSynthesis: synth };
  globalThis.SpeechSynthesisUtterance = FakeUtterance;

  try {
    assert.equal(speakWord("cat"), true);
    assert.equal(synth.spoken.length, 0);

    voices = [
      { name: "Alex", lang: "en-US", voiceURI: "Alex" },
      { name: "Samantha", lang: "en-US", voiceURI: "com.apple.voice.compact.en-US.Samantha" },
    ];
    for (const listener of listeners) listener();

    assert.equal(synth.spoken.length, 1);
    assert.equal(synth.spoken[0].text, "cat");
    assert.equal(synth.spoken[0].voice.name, "Samantha");
    assert.equal(synth.spoken[0].lang, "en-US");
    assert.equal(synth.spoken[0].voiceURI, "com.apple.voice.compact.en-US.Samantha");
    assert.equal(synth.spoken[0].pitch, 1);
    assert.equal(synth.spoken[0].rate, 0.85);

    stopSpeaking();
    voices = [
      { name: "English United States", lang: "en_US", voiceURI: "en-us-x-iob-local", default: true },
      { name: "English United States", lang: "en_US", voiceURI: "en-us-x-sfg-network" },
    ];
    const starts = [];
    assert.equal(speakSequence(["one", "two"], { onStart: (index) => starts.push(index) }), true);
    assert.deepEqual(starts, [0]);
    assert.equal(synth.spoken.at(-1).text, "one");
    assert.equal(synth.spoken.at(-1).voice.voiceURI, "en-us-x-sfg-network");
    assert.equal(synth.spoken.at(-1).lang, "en_US");
    assert.equal(synth.spoken.at(-1).pitch, 1);
    synth.spoken.at(-1).onend();
    assert.deepEqual(starts, [0, 1]);
    assert.equal(synth.spoken.at(-1).text, "two");
    assert.equal(synth.spoken.at(-1).voice.voiceURI, "en-us-x-sfg-network");
    assert.equal(synth.spoken.at(-1).pitch, 1);

    stopSpeaking();
    voices = [
      { name: "English United States", lang: "en_US", voiceURI: "English United States", default: true },
    ];
    assert.equal(speakWord("dog"), true);
    assert.equal(synth.spoken.at(-1).text, "dog");
    assert.equal(synth.spoken.at(-1).lang, "en_US");
    assert.equal(synth.spoken.at(-1).pitch, FALLBACK_PITCH);
    assert.equal(synth.spoken.at(-1).voice.name, "English United States");

    stopSpeaking();
    voices = [];
    assert.equal(speakWord("pig"), true);
    await new Promise((resolve) => setTimeout(resolve, VOICE_WAIT_MS + 80));
    assert.equal(synth.spoken.at(-1).text, "pig");
    assert.equal(synth.spoken.at(-1).voice, null);
    assert.equal(synth.spoken.at(-1).pitch, FALLBACK_PITCH);
    assert.equal(synth.spoken.at(-1).lang, "en-US");
    stopSpeaking();
  } finally {
    stopSpeaking();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = previousUtterance;
  }
});
