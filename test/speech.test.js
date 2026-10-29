import assert from "node:assert/strict";
import test from "node:test";
import { FEMALE_VOICE_PREFERENCES, pickFemaleVoice, speakWord, stopSpeaking } from "../src/speech.js";

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
  const order = requiredNames.map((name) => FEMALE_VOICE_PREFERENCES.indexOf(name));
  const sorted = [...order].sort((left, right) => left - right);
  assert.deepEqual(order, sorted);
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
  const expected = ["Samantha", "Karen", "Moira", "Tessa", "Google US English", "Microsoft Jenny Online (Natural) - English (United States)", "Microsoft Zira Desktop - English (United States)"];
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

test("ignores a non-English voice and an empty list", () => {
  assert.equal(pickFemaleVoice([{ name: "Samantha", lang: "fr-FR" }]), null);
  assert.equal(pickFemaleVoice([]), null);
  assert.equal(pickFemaleVoice(undefined), null);
  const untagged = { name: "Samantha" };
  assert.equal(pickFemaleVoice([untagged]), untagged);
});

test("speakWord uses Samantha after voiceschanged, otherwise the default voice", async () => {
  const listeners = new Set();
  const utterances = [];
  class FakeUtterance {
    constructor(text) {
      this.text = text;
      this.lang = "";
      this.rate = 1;
      this.voice = null;
      utterances.push(this);
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
      { name: "Alex", lang: "en-US" },
      { name: "Samantha", lang: "en-US" },
    ];
    for (const listener of listeners) listener();

    assert.equal(synth.spoken.length, 1);
    assert.equal(synth.spoken[0].text, "cat");
    assert.equal(synth.spoken[0].voice.name, "Samantha");
    assert.equal(synth.spoken[0].lang, "en-US");
    assert.equal(synth.spoken[0].rate, 0.85);

    stopSpeaking();
    voices = [{ name: "Alex", lang: "en-US" }, { name: "Daniel", lang: "en-GB" }];
    assert.equal(speakWord("dog"), true);
    assert.equal(synth.spoken.at(-1).text, "dog");
    assert.equal(synth.spoken.at(-1).voice, null);

    stopSpeaking();
    voices = [];
    assert.equal(speakWord("pig"), true);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(synth.spoken.at(-1).text, "pig");
    assert.equal(synth.spoken.at(-1).voice, null);
    stopSpeaking();
  } finally {
    stopSpeaking();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = previousUtterance;
  }
});
