import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui";
import { studyDay } from "./study";
import type { Attempt, Lesson, Mode, Question } from "./types";

export function OrderDiagram({ step = 0, preview = false }: { step?: number; preview?: boolean }) {
  const symbols = preview ? ["A", "", "C", "D"] : step < 2 ? ["", "", "", ""] : ["T", "P", "M", "R"];
  return <figure className="order-diagram" aria-label={symbols.map(s => s || "casilla vacía").join(", ")}>
    <div className="diagram-tiles" aria-hidden="true">{symbols.map((symbol, index) =>
      <span key={index} className={`diagram-tile ${symbol === "P" || (preview && !symbol) ? "tile-highlight" : ""}`}>{symbol || "·"}</span>,
    )}</div>
    <figcaption>{preview ? "Una casilla por letra" : step === 0 ? "Dibuja cuatro casillas" : step === 1 ? "Orden provisional: T–M–R" : "P queda entre T y M"}</figcaption>
  </figure>;
}

const vennPrefix = "Sectores del diagrama.";

export function questionText(prompt: string) {
  return prompt.startsWith(vennPrefix) ? prompt.slice(prompt.indexOf("\n") + 1) : prompt;
}

export function QuestionVisual({ prompt }: { prompt: string }) {
  if (!prompt.startsWith(vennPrefix)) return null;
  const alt = prompt.slice(0, prompt.indexOf("\n"));
  return <div className="venn-diagram" role="img" aria-label={alt}>
    <div aria-hidden="true" className="venn-circle venn-a" />
    <div aria-hidden="true" className="venn-circle venn-b" />
    <div aria-hidden="true" className="venn-circle venn-c" />
    {["A", "B", "C", "1", "2", "3", "4", "5", "6", "7"].map(label =>
      <span aria-hidden="true" key={label} data-venn-label={label}>{label}</span>,
    )}
  </div>;
}

export function AnswerOptions({ options, selection, answer, revealed, lang, onSelect }: {
  options: string[]; selection: number | null; answer: number; revealed: boolean;
  lang?: string; onSelect: (index: number) => void;
}) {
  const group = useId();
  return <div className="answers">{options.map((option, index) => (
    <label className="answer" key={option} data-correct={revealed && index === answer}
      data-wrong={revealed && selection === index && index !== answer}>
      <input type="radio" name={group} required checked={selection === index} onChange={() => onSelect(index)} />
      <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
      <span lang={lang}>{option}</span>
    </label>
  ))}</div>;
}

export function QuestionCard({ question, mode, area, flagged, previous, onFlag, onAttempt }: {
  question: Question; mode: Exclude<Mode, "exam">; area: Lesson["area"]; flagged: boolean;
  previous?: Attempt;
  onFlag: () => void; onAttempt: (attempt: Attempt) => void;
}) {
  const [selection, setSelection] = useState<number | null>(previous?.selection ?? null);
  const [hinted, setHinted] = useState(false);
  const [guessed, setGuessed] = useState(false);
  const [submitted, setSubmitted] = useState(previous?.selection !== undefined);
  const prompt = useRef<HTMLLegendElement>(null);
  const time = useRef({ activeSince: 0, elapsed: 0, visible: false });
  const answered = useRef(previous?.selection !== undefined);
  const focusOnFeedback = useRef(false);
  const nextFeedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (submitted && focusOnFeedback.current) {
      nextFeedback.current?.focus();
      focusOnFeedback.current = false;
    }
  }, [submitted]);
  useEffect(() => {
    if (!prompt.current || mode === "live" || submitted) return;
    const tracker = time.current;
    function updateClock() {
      const now = performance.now();
      if (tracker.visible && document.visibilityState === "visible") {
        if (!tracker.activeSince) tracker.activeSince = now;
      } else if (tracker.activeSince) {
        tracker.elapsed += now - tracker.activeSince;
        tracker.activeSince = 0;
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      tracker.visible = entry.isIntersecting;
      updateClock();
    }, { threshold: 0.25 });
    observer.observe(prompt.current);
    document.addEventListener("visibilitychange", updateClock);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateClock);
      tracker.visible = false;
      updateClock();
    };
  }, [mode, submitted]);
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (selection === null || answered.current) return;
    answered.current = true;
    focusOnFeedback.current = true;
    const at = Date.now();
    const tracker = time.current;
    const elapsed = tracker.elapsed + (tracker.activeSince ? performance.now() - tracker.activeSince : 0);
    onAttempt({
      id: crypto.randomUUID(), at, day: studyDay(new Date(at)), item: question.id, skill: question.skill,
      correct: selection === question.answer, help: hinted || guessed, selection,
      seconds: mode === "live" ? 0 : Math.max(1, Math.min(300, Math.round(elapsed / 1000))),
      mode,
    });
    setSubmitted(true);
  }
  function retry() {
    answered.current = false;
    time.current = { activeSince: 0, elapsed: 0, visible: false };
    setSelection(null);
    setHinted(false);
    setGuessed(false);
    setSubmitted(false);
    requestAnimationFrame(() => prompt.current?.focus());
  }
  return <form className="exercise" onSubmit={submit}>
    <fieldset disabled={submitted}>
      <legend ref={prompt} tabIndex={-1} className="exercise-prompt" lang={area === "en" ? "en" : undefined}>{questionText(question.prompt)}</legend>
      <QuestionVisual prompt={question.prompt} />
      <AnswerOptions options={question.options} answer={question.answer} selection={selection} revealed={submitted}
        lang={area === "en" ? "en" : undefined} onSelect={setSelection} />
    </fieldset>
    <div className="feedback-region" aria-live="polite">
      {submitted && <div tabIndex={-1} ref={nextFeedback} className={`feedback ${selection === question.answer ? "correct" : "wrong"}`}>
        <strong>{selection === question.answer ? "Correcto" : `Respuesta correcta: ${String.fromCharCode(65 + question.answer)}`}</strong>
        <p>{question.explanation}</p>
      </div>}
    </div>
    {!submitted && <>
      {hinted && <p className="hint">{question.hint}</p>}
      <div className="row question-actions">
        <button className="button primary" disabled={selection === null}>Comprobar</button>
        {!hinted && <button type="button" className="button secondary" onClick={() => setHinted(true)}>Ver pista</button>}
        <label className="check-label"><input type="checkbox" checked={guessed} onChange={event => setGuessed(event.target.checked)} /> Estoy adivinando</label>
      </div>
    </>}
    {submitted && mode !== "review" && <button type="button" className="button secondary retry-question" onClick={retry}>Volver a intentar</button>}
    <button type="button" className="flag-button" aria-pressed={flagged} onClick={onFlag}><Icon name="flag" size={15} />{flagged ? "Duda guardada" : "Guardar duda"}</button>
  </form>;
}
