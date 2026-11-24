import { useEffect, useId, useRef, useState } from "react";
import { AreaTag, duration, Icon, lessonHref } from "./ui";
import { lessonById } from "./content";
import { nextQuestion, questions, studyDay } from "./study";
import type { Attempt, ClassRecord, Lesson, Mode, Question, StudyState } from "./types";

const classBlocks = [
  ["Diagnóstico", 5], ["Explicación", 10], ["Ejemplo guiado", 10],
  ["Ejercicios", 20], ["Corrección", 10], ["Pregunta de salida", 5],
] as const;

const orderAgenda = [
  "Empieza con el ejercicio 1. Pregunta si «antes» significa «justo antes». Usa cuatro casillas.",
  "Dibuja las posiciones. Distingue «antes», «inmediatamente antes» y «entre». Tacha una posición prohibida.",
  "Ordena T, M y R sin llenar las casillas. Pídele que ubique P. Luego resuelvan el ejercicio 3.",
  "Pídele que haga 2 y 4–7 por su cuenta. En el 7, añade una quinta casilla.",
  "Revisa 4, 5 y 7. Pídele que señale la pista que elimina una opción.",
  "Abre la pregunta de salida. Pídele que justifique el descarte más difícil.",
];
const defaultAgenda = [
  "Empieza con una pregunta básica. Pide que explique qué haría primero.",
  "Explica el método en pasos cortos. Usa un ejemplo concreto.",
  "Recorre el ejemplo. Deja que ella haga y explique el último paso.",
  "Resuelvan dos ejercicios juntos. Después, usa preguntas de examen para la práctica independiente.",
  "Revisen dos errores. Pide que diga qué cambiaría en su procedimiento.",
  "Pide que resuelva una variante nueva y que explique por qué funciona su método.",
];

export function Agenda({ lesson }: { lesson: Lesson }) {
  const notes = lesson.id === "hc-orden" ? orderAgenda : defaultAgenda;
  return <ol className="class-agenda">{classBlocks.map(([name, time], index) =>
    <li key={name}><span className="agenda-time">{time} min</span><div><strong>{name}</strong><p>{notes[index]}</p></div></li>,
  )}</ol>;
}

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

function GuidedExample({ lesson }: { lesson: Lesson }) {
  const total = lesson.example.steps.length;
  const key = "marie-cetys:example:" + lesson.id;
  const [step, setStep] = useState(() => {
    try { return Math.max(0, Math.min(total, Number(sessionStorage.getItem(key)) || 0)); } catch { return 0; }
  });
  function showStep(index: number) {
    setStep(index);
    try { sessionStorage.setItem(key, String(index)); } catch { /* continue without session storage */ }
  }
  return <div className="worked-example">
    <p className="exercise-prompt" lang={lesson.area === "en" ? "en" : undefined}>{questionText(lesson.example.prompt)}</p>
    <QuestionVisual prompt={lesson.example.prompt} />
    {lesson.id === "hc-orden" && <OrderDiagram step={step} />}
    <ol className="worked-steps" aria-live="polite">{lesson.example.steps.slice(0, step).map((line, index) => <li key={index}>{line}</li>)}</ol>
    <div className="row">
      {step < total && <button className="button primary" onClick={() => showStep(step + 1)}>{step ? "Ver el siguiente paso" : "Ver el primer paso"}</button>}
      {step > 0 && <button className="button quiet" onClick={() => showStep(0)}>Reiniciar ejemplo</button>}
    </div>
  </div>;
}

export function QuestionCard({ question, mode, area, flagged, previous, onFlag, onAttempt }: {
  question: Question; mode: Exclude<Mode, "exam">; area: Lesson["area"]; flagged: boolean;
  previous?: Attempt;
  onFlag: () => void; onAttempt: (attempt: Attempt) => void;
}) {
  const group = useId();
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
      <div className="answers">{question.options.map((option, index) => (
        <label className="answer" key={option} data-correct={submitted && index === question.answer} data-wrong={submitted && selection === index && index !== question.answer}>
          <input type="radio" name={group} required checked={selection === index} onChange={() => setSelection(index)} />
          <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
          <span lang={area === "en" ? "en" : undefined}>{option}</span>
        </label>
      ))}</div>
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

export function Workbook({ lesson, target, state, onAttempt, onFlag, onClass, onPin, announce }: {
  lesson: Lesson; target?: string; state: StudyState; onAttempt: (attempt: Attempt) => void; onFlag: (id: string) => void;
  onClass: (record: ClassRecord) => void; onPin: (id: string) => void; announce: (message: string) => void;
}) {
  const [minutes, setMinutes] = useState(state.settings.minutes);
  const [live, setLive] = useState(false);
  const [classMode, setClassMode] = useState(false);
  const [complete, setComplete] = useState(true);
  const [liveQuestions, setLiveQuestions] = useState<Question[]>([]);
  const all = questions(lesson);
  const targetQuestion = all.find(item => item.id === lesson.id + ":" + target);
  const exerciseList = live ? liveQuestions : all.filter(item => item.difficulty !== "challenge" || targetQuestion?.id === item.id);
  const latestAnswers = new Map(state.attempts
    .filter(attempt => attempt.skill === lesson.id && attempt.selection !== undefined && attempt.selection >= 0 && ["live", "practice"].includes(attempt.mode))
    .map(attempt => [attempt.item, attempt]));
  const done = state.classes.some(c => c.skill === lesson.id && c.complete);
  useEffect(() => {
    if (!targetQuestion) return;
    const frame = requestAnimationFrame(() => jumpTo("pregunta-marcada"));
    return () => cancelAnimationFrame(frame);
  }, [targetQuestion?.id]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(lessonHref(lesson.id), location.href).href);
      announce("Enlace copiado.");
    } catch { announce("Copia el enlace desde la barra del navegador."); }
  }
  function openLive() {
    const excluded = new Set<string>();
    const selection: Question[] = [];
    for (let i = 0; i < 3; i++) {
      const question = nextQuestion(lesson, state.attempts, excluded);
      if (!question) break;
      selection.push(question);
      excluded.add(question.id);
    }
    setLiveQuestions(selection);
    setLive(true);
    requestAnimationFrame(() => document.getElementById("ejercicios")?.scrollIntoView());
  }
  function logClass(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return;
    const at = Date.now();
    onClass({ id: crypto.randomUUID(), at, day: studyDay(new Date(at)), skill: lesson.id, minutes, complete });
  }
  function jumpTo(id: string) {
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView();
  }
  return <>
    <header className="lesson-header">
      <a className="back-link" href="#/temario">Temario</a>
      <AreaTag area={lesson.area} />
      <h1>{lesson.title}</h1>
      <p>{lesson.objective}</p>
      <div className="row">
        {lesson.id === "hc-orden" && <button className="button primary" onClick={() => jumpTo("ejercicios")}>Probar el primer ejercicio</button>}
        <button className="button secondary" onClick={copyLink}><Icon name="link" size={16}/> Copiar enlace</button>
        <button className="button secondary" onClick={() => onPin(state.pinned === lesson.id ? "" : lesson.id)}>
          {state.pinned === lesson.id ? "Quitar de Clase de hoy" : "Fijar como clase de hoy"}
        </button>
        <button className="button quiet class-guide-shortcut" onClick={() => jumpTo("guia-clase")}>Ir a la guía de clase</button>
      </div>
    </header>
    <div className="workbook-grid">
      <div className="workbook-flow">
        <section className="worksheet" id="explicacion">
          <h2>Explicación</h2>
          <ol className="lesson-steps">{lesson.explanation.map((step, index) => <li key={index}>{step}</li>)}</ol>
          {lesson.prerequisiteIds.some(id => lessonById.has(id)) && <p className="muted">Temas previos: {lesson.prerequisiteIds.map(id => lessonById.get(id)).filter(Boolean).map((entry, index) =>
            <span key={entry!.id}>{index > 0 && ", "}<a href={lessonHref(entry!.id)}>{entry!.title}</a></span>,
          )}</p>}
        </section>
        <section className="worksheet" id="ejemplo"><h2>Ejemplo guiado</h2><GuidedExample lesson={lesson} /></section>
        <section className="practice-stack" id="ejercicios" tabIndex={-1} aria-labelledby="workbook-exercises">
          <div className="section-title"><h2 id="workbook-exercises">{live ? "Variantes para la clase" : "Ejercicios"}</h2><span>{exerciseList.length} preguntas</span></div>
          {live && <button className="button secondary" onClick={() => setLive(false)}>Volver a ejercicios publicados</button>}
          {exerciseList.map((question, index) => (
            <details className="question-details" key={question.id + (live ? ":live" : "")}
              id={question.id === targetQuestion?.id ? "pregunta-marcada" : undefined} tabIndex={-1}
              open={question.id === targetQuestion?.id || (!targetQuestion && index === 0) || undefined}>
              <summary><span>Ejercicio {live ? index + 1 : all.findIndex(item => item.id === question.id) + 1}</span><span className="muted">{question.difficulty === "base" ? "Base" : question.difficulty === "exam" ? "Tipo examen" : "Reto"}</span></summary>
              <QuestionCard question={question} area={lesson.area} mode={live || classMode ? "live" : "practice"}
                previous={latestAnswers.get(question.id)}
                flagged={state.flagged.includes(question.id)} onFlag={() => onFlag(question.id)} onAttempt={onAttempt} />
            </details>
          ))}
          {lesson.id === "hc-orden" && !live && <ExitQuestion />}
        </section>
        <p className="source-note">{lesson.source}</p>
      </div>
      <aside className="lesson-rail" id="guia-clase" tabIndex={-1} aria-label="Guía de clase">
        <section className="rail-panel">
          <h2>Guía para la clase</h2>
          <p className="muted">Sesión modelo de 60 minutos.</p>
          <Agenda lesson={lesson} />
          <label className="check-label"><input type="checkbox" checked={classMode} onChange={event => setClassMode(event.target.checked)} /> Estamos en clase</label>
          {classMode && <p className="muted">Las respuestas cuentan. Registra el tiempo total al final.</p>}
          {!live && <button className="button secondary" onClick={openLive}>Abrir 3 ejercicios para la clase</button>}
          {lesson.id === "hc-orden" && !live && <button className="button quiet exit-link" onClick={() => jumpTo("salida")}>Ver pregunta de salida</button>}
        </section>
        <form className="rail-panel log-class" onSubmit={logClass}>
          <h2>Registrar clase</h2>
          <label>Minutos <input type="number" min="1" max="180" required value={minutes || ""} onChange={e => setMinutes(Number(e.target.value))} /></label>
          <label className="check-label"><input type="checkbox" checked={complete} onChange={e => setComplete(e.target.checked)} /> Terminé esta clase</label>
          <button className="button primary">Guardar sesión de {duration(minutes)}</button>
          {done && <p className="muted"><Icon name="check" size={14}/> Clase completa</p>}
        </form>
      </aside>
    </div>
  </>;
}

function ExitQuestion() {
  return <section className="worksheet exit-question" id="salida" tabIndex={-1}>
    <h2>Pregunta de salida</h2>
    <p>G va antes de K. H va entre G y K. J va inmediatamente antes de H.</p>
    <p>Elige un orden. Escribe una pista que descarte otra opción.</p>
    <ol type="A"><li>G–H–J–K</li><li>J–H–G–K</li><li>G–J–H–K</li><li>K–J–H–G</li></ol>
    <details><summary>Ver clave docente</summary><p><strong>C.</strong> El bloque J–H va entre G y K.</p></details>
  </section>;
}
