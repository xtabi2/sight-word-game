import { useEffect, useRef, useState } from "react";
import { speakWord, stopSpeaking } from "./speech.js";
import { ButtonFace } from "./icons.jsx";

const SWIPE_PX = 48;

function CardWord({ word }) {
  const { text, underline } = word;
  if (!underline) return text;
  const [start, end] = underline;
  return (
    <>
      {text.slice(0, start)}
      <span className="tricky">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

export default function FlashCards({ deck, onBack }) {
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const drag = useRef(null);
  const speakWatch = useRef(0);
  const word = deck.words[index];

  useEffect(() => {
    stopSpeaking();
    setSpeaking(false);
    window.clearTimeout(speakWatch.current);
    return () => {
      window.clearTimeout(speakWatch.current);
      stopSpeaking();
    };
  }, [deck.id, index]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.repeat) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deck, index]);

  function go(step) {
    setIndex((current) => {
      const next = current + step;
      if (next < 0 || next >= deck.words.length) return current;
      return next;
    });
  }

  function readAloud() {
    window.clearTimeout(speakWatch.current);
    const started = speakWord(word.text, () => {
      window.clearTimeout(speakWatch.current);
      setSpeaking(false);
    });
    if (!started) return;
    setSpeaking(true);
    speakWatch.current = window.setTimeout(() => setSpeaking(false), 5000);
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerUp(event) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = null;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    go(dx < 0 ? 1 : -1);
  }

  const atStart = index === 0;
  const atEnd = index === deck.words.length - 1;

  return (
    <main
      className="app play"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div className="top">
        <button type="button" className="big alt grades" onClick={onBack}>
          <ButtonFace icon="back">Back</ButtonFace>
        </button>
        <div className="progress">
          <span>{deck.label}</span>
          <span>
            {index + 1} of {deck.words.length}
          </span>
        </div>
      </div>
      <div className="card" aria-live="polite">
        <span className="word">
          <CardWord word={word} />
        </span>
      </div>
      <button type="button" className={`big speak${speaking ? " speaking" : ""}`} onClick={readAloud}>
        <ButtonFace icon="speaker">Read it to me</ButtonFace>
      </button>
      <div className="nav">
        <button type="button" className="big" onClick={() => go(-1)} disabled={atStart}>
          <ButtonFace icon="back">Previous</ButtonFace>
        </button>
        <button type="button" className="big" onClick={() => go(1)} disabled={atEnd}>
          <ButtonFace icon="next">Next</ButtonFace>
        </button>
      </div>
    </main>
  );
}
