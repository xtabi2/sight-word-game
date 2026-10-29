import { useState } from "react";
import { grades } from "./words.js";
import { allClassWords, lessons } from "./class-words.js";
import FlashCards from "./FlashCards.jsx";
import SentenceBuilder from "./SentenceBuilder.jsx";
import StoryTime from "./StoryTime.jsx";
import { ButtonFace } from "./icons.jsx";

const gradeMark = { k: "K", 1: "1", 2: "2", 3: "3" };

export default function App() {
  const [screen, setScreen] = useState("home");
  const [mode, setMode] = useState("cards");
  const [deck, setDeck] = useState(null);

  function pickMode(next) {
    setMode(next);
    setDeck(null);
    setScreen("decks");
  }

  function openDeck(next) {
    setDeck(next);
    setScreen(mode);
  }

  function openGrade(grade) {
    openDeck({
      id: grade.id,
      label: grade.label,
      backTo: "decks",
      words: grade.words.map((text) => ({ text })),
    });
  }

  function openLesson(lesson) {
    openDeck({
      id: lesson.id,
      label: lesson.label,
      backTo: "class",
      words: lesson.words,
    });
  }

  function leaveDeck() {
    setScreen(deck?.backTo ?? "decks");
    setDeck(null);
  }

  if (screen === "stories") {
    return <StoryTime onBack={() => setScreen("home")} />;
  }

  if (screen === "cards" && deck) {
    return <FlashCards deck={deck} onBack={leaveDeck} />;
  }

  if (screen === "sentence" && deck) {
    return <SentenceBuilder deck={deck} onBack={leaveDeck} />;
  }

  if (screen === "class") {
    return (
      <main className="app">
        <div className="top">
          <button type="button" className="big alt grades" onClick={() => setScreen("decks")}>
            <ButtonFace icon="back">Back</ButtonFace>
          </button>
        </div>
        <h1>Class Words</h1>
        <div className="grid">
          {lessons.map((lesson, index) => (
            <button key={lesson.id} type="button" className="big" onClick={() => openLesson(lesson)}>
              <ButtonFace icon={`badge-${index + 1}`}>{lesson.label}</ButtonFace>
            </button>
          ))}
          <button
            type="button"
            className="big wide"
            onClick={() =>
              openDeck({
                id: "class-all",
                label: "All together",
                backTo: "class",
                words: allClassWords(),
              })
            }
          >
            <ButtonFace icon="together">All together</ButtonFace>
          </button>
        </div>
      </main>
    );
  }

  if (screen === "decks") {
    return (
      <main className="app">
        <div className="top">
          <button type="button" className="big alt grades" onClick={() => setScreen("home")}>
            <ButtonFace icon="home">Back</ButtonFace>
          </button>
        </div>
        <h1>{mode === "sentence" ? "Build a Sentence" : "Flash Cards"}</h1>
        <div className="grid">
          {grades.map((grade) => (
            <button key={grade.id} type="button" className="big" onClick={() => openGrade(grade)}>
              <ButtonFace icon={`badge-${gradeMark[grade.id] ?? grade.id}`}>{grade.label}</ButtonFace>
            </button>
          ))}
          <button type="button" className="big alt wide" onClick={() => setScreen("class")}>
            <ButtonFace icon="abc">Class Words</ButtonFace>
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <h1>Sight Words</h1>
      <div className="stack">
        <button type="button" className="big" onClick={() => pickMode("cards")}>
          <ButtonFace icon="cards">Flash Cards</ButtonFace>
        </button>
        <button type="button" className="big" onClick={() => pickMode("sentence")}>
          <ButtonFace icon="sentence">Build a Sentence</ButtonFace>
        </button>
        <button type="button" className="big" onClick={() => setScreen("stories")}>
          <ButtonFace icon="book">Story Time</ButtonFace>
        </button>
      </div>
    </main>
  );
}
