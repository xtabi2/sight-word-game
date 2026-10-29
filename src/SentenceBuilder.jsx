import { useEffect, useState } from "react";
import { formatSentence, gradeSentence } from "./grade-sentence.js";
import { setsFor } from "./sentence-sets.js";
import { speakWord, stopSpeaking } from "./speech.js";
import { ButtonFace, Icon } from "./icons.jsx";

function mix(words, tries = 0) {
  const copy = [...words];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  if (tries < 6 && gradeSentence(copy).ok) return mix(words, tries + 1);
  return copy;
}

export default function SentenceBuilder({ deck, onBack }) {
  const sets = setsFor(deck.words.map((word) => word.text));
  const [setIndex, setSetIndex] = useState(0);
  const [bank, setBank] = useState([]);
  const [built, setBuilt] = useState([]);
  const [note, setNote] = useState(null);
  const current = sets[setIndex] ?? null;

  function showSet(index) {
    const next = sets[index];
    if (!next) return;
    setSetIndex(index);
    setBank(mix(next.words));
    setBuilt([]);
    setNote(null);
    stopSpeaking();
  }

  useEffect(() => {
    if (sets.length) showSet(0);
    return () => stopSpeaking();
  }, [deck.id]);

  if (!current) {
    return (
      <main className="app">
        <h1>{deck.label}</h1>
        <p className="sub">Try another deck</p>
        <button type="button" className="big alt" onClick={onBack}>
          <ButtonFace icon="back">Back</ButtonFace>
        </button>
      </main>
    );
  }

  function addWord(word) {
    setBank((items) => items.filter((item) => item !== word));
    setBuilt((items) => [...items, word]);
    setNote(null);
  }

  function removeWord(word, index) {
    setBuilt((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setBank((items) => [...items, word]);
    setNote(null);
  }

  function moveWord(from, to) {
    if (from === to) return;
    setBuilt((items) => {
      const next = [...items];
      const [word] = next.splice(from, 1);
      next.splice(to, 0, word);
      return next;
    });
    setNote(null);
  }

  function onChipDown(event, index) {
    if (event.button !== undefined && event.button !== 0) return;
    const origin = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const word = built[index];
    let moved = false;
    let target = index;
    origin.setPointerCapture?.(event.pointerId);

    const move = (pointer) => {
      if (Math.abs(pointer.clientX - startX) + Math.abs(pointer.clientY - startY) > 12) moved = true;
      const chips = document.querySelectorAll("[data-built]");
      let best = target;
      let bestDist = Infinity;
      chips.forEach((chip) => {
        const rect = chip.getBoundingClientRect();
        const dist = Math.abs(pointer.clientX - (rect.left + rect.width / 2))
          + Math.abs(pointer.clientY - (rect.top + rect.height / 2));
        if (dist < bestDist) {
          bestDist = dist;
          best = Number(chip.dataset.built);
        }
      });
      if (!Number.isNaN(best)) target = best;
    };
    const up = () => {
      origin.removeEventListener("pointermove", move);
      origin.removeEventListener("pointerup", up);
      if (!moved) removeWord(word, index);
      else if (target !== index) moveWord(index, target);
    };
    origin.addEventListener("pointermove", move);
    origin.addEventListener("pointerup", up);
  }

  function clearAll() {
    setBank(mix(current.words));
    setBuilt([]);
    setNote(null);
    stopSpeaking();
  }

  function nextSet() {
    showSet((setIndex + 1) % sets.length);
  }

  function check() {
    setNote(gradeSentence(built));
  }

  function readAloud() {
    if (!built.length) return;
    speakWord(formatSentence(built));
  }

  return (
    <main className="app play">
      <div className="top">
        <button type="button" className="big alt grades" onClick={onBack}>
          <ButtonFace icon="back">Back</ButtonFace>
        </button>
        <div className="progress">
          <span>{deck.label}</span>
        </div>
      </div>
      <div className="chips" aria-label="Words">
        {bank.map((word) => (
          <button key={word} type="button" className="chip" onClick={() => addWord(word)}>
            <Icon name="add" />
            <span>{word}</span>
          </button>
        ))}
      </div>
      <p className="line" aria-live="polite">
        {formatSentence(built)}
      </p>
      <div className="well">
        {built.map((word, index) => (
          <button
            key={`${word}-${index}`}
            type="button"
            className="chip"
            data-built={index}
            onPointerDown={(event) => onChipDown(event, index)}
          >
            {word}
          </button>
        ))}
      </div>
      {note && <p className={note.ok ? "note ok" : "note"}>{note.message}</p>}
      <button type="button" className="big speak" onClick={readAloud} disabled={!built.length}>
        <ButtonFace icon="speaker">Read it to me</ButtonFace>
      </button>
      <div className="nav">
        <button type="button" className="big" onClick={check} disabled={!built.length}>
          <ButtonFace icon="check">Check</ButtonFace>
        </button>
        <button type="button" className="big alt" onClick={clearAll}>
          <ButtonFace icon="clear">Clear</ButtonFace>
        </button>
      </div>
      <button type="button" className="big" onClick={nextSet}>
        <ButtonFace icon="shuffle">New words</ButtonFace>
      </button>
    </main>
  );
}
