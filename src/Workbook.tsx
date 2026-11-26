import { useEffect, useId, useRef, useState } from "react";
import { AreaTag, duration, Icon, lessonHref, miniHref } from "./ui";
import { lessonById, miniQuestionCount } from "./content";
import { guidedSections } from "./content/guides";
import { AnswerOptions, OrderDiagram, QuestionCard, QuestionVisual, questionText } from "./QuestionCard";
import { questions, studyDay } from "./study";
import type { Attempt, ClassRecord, InteractiveExample, Lesson, Question, StudyState } from "./types";

const interleavedAgenda = [
  ["Diagnóstico", 5, "Elige un ejercicio guiado. Pídele que diga qué diferencia tendría que identificar."],
  ["Explicación y práctica guiada", 25, "Lean la regla y resuelvan el ejemplo. Usa los dos ejercicios para practicar el mismo método."],
  ["Miniexamen", 20, "Deja que responda las preguntas y entregue por su cuenta."],
  ["Corrección", 10, "Revisen las respuestas. Vuelvan al bloque que explica cada error."],
] as const;

function Agenda() {
  return <ol className="class-agenda">{interleavedAgenda.map(([name, time, note]) =>
    <li key={name}><span className="agenda-time">{time} min</span><div><strong>{name}</strong><p>{note}</p></div></li>,
  )}</ol>;
}

function WorkedExampleSteps({ example, area }: { example: InteractiveExample; area: Lesson["area"] }) {
  const headingId = useId();
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<number, { selection: number; revealed: boolean }>>({});
  const prompt = useRef<HTMLLegendElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const step = example.steps[index];
  const language = area === "en" ? "en" : undefined;
  const response = responses[index];
  const revealed = response?.revealed ?? false;
  const correct = response?.selection === step.answer;

  function move(next: number) {
    setIndex(next);
    requestAnimationFrame(() => prompt.current?.focus());
  }

  function check(event: React.FormEvent) {
    event.preventDefault();
    if (!response || revealed) return;
    setResponses({ ...responses, [index]: { ...response, revealed: true } });
    requestAnimationFrame(() => feedback.current?.focus());
  }

  function restart() {
    setResponses({});
    move(0);
  }

  return <div className="worked-example">
    <h4 id={headingId}>Ejemplo resuelto</h4>
    <p lang={example.lang}>{questionText(example.prompt)}</p>
    {example.visual === "order-slots" ? <OrderDiagram step={index + Number(revealed)} /> : <QuestionVisual prompt={example.prompt} />}
    <form className="exercise example-steps" aria-labelledby={headingId} onSubmit={check}>
      <p className="muted">Paso {index + 1} de {example.steps.length}</p>
      <fieldset disabled={revealed}>
        <legend className="exercise-prompt" ref={prompt} tabIndex={-1} lang={language}>{step.prompt}</legend>
        <AnswerOptions options={step.options} answer={step.answer} selection={response?.selection ?? null}
          revealed={revealed} lang={language} onSelect={selection => setResponses({ ...responses, [index]: { selection, revealed: false } })} />
      </fieldset>
      {revealed && <div className={`feedback ${correct ? "correct" : "wrong"}`} ref={feedback} tabIndex={-1}>
        <strong>{correct ? "Correcto" : `Respuesta correcta: ${String.fromCharCode(65 + step.answer)}`}</strong>
        <p>{step.explanation}</p>
      </div>}
      <div className="row">
        {index > 0 && <button className="button secondary" type="button" onClick={() => move(index - 1)}>Paso anterior</button>}
        {!revealed && <button className="button primary" type="submit">Comprobar paso</button>}
        {revealed && index < example.steps.length - 1 &&
          <button className="button primary" type="button" onClick={() => move(index + 1)}>Siguiente paso</button>}
        {(revealed || index > 0) && <button className="button quiet" type="button" onClick={restart}>Reiniciar ejemplo</button>}
      </div>
    </form>
  </div>;
}

export default function Workbook({ lesson, target, state, onAttempt, onFlag, onClass, onPin, announce }: {
  lesson: Lesson; target?: string; state: StudyState; onAttempt: (attempt: Attempt) => void; onFlag: (id: string) => void;
  onClass: (record: ClassRecord) => void; onPin: (id: string) => void; announce: (message: string) => void;
}) {
  const [minutes, setMinutes] = useState(state.settings.minutes);
  const classModeKey = "marie-cetys:class:" + lesson.id;
  const [classMode, setClassMode] = useState(() => {
    try { return sessionStorage.getItem(classModeKey) === studyDay(); } catch { return false; }
  });
  const [complete, setComplete] = useState(true);
  const guided = guidedSections(lesson);
  const targetId = target && lesson.id + ":" + target;
  const bankQuestion = targetId && questions(lesson).find(item => item.id === targetId);
  const latestAnswers = new Map(state.attempts
    .filter(attempt => attempt.skill === lesson.id && attempt.selection !== undefined && attempt.selection >= 0 && ["live", "practice"].includes(attempt.mode))
    .map(attempt => [attempt.item, attempt]));
  const done = state.classes.some(c => c.skill === lesson.id && c.complete);
  useEffect(() => {
    if (!targetId) return;
    const frame = requestAnimationFrame(() => jumpTo("pregunta-marcada"));
    return () => cancelAnimationFrame(frame);
  }, [targetId]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(lessonHref(lesson.id), location.href).href);
      announce("Enlace copiado.");
    } catch { announce("Copia el enlace desde la barra del navegador."); }
  }
  function logClass(event: React.FormEvent) {
    event.preventDefault();
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 180) return;
    const at = Date.now();
    onClass({ id: crypto.randomUUID(), at, day: studyDay(new Date(at)), skill: lesson.id, minutes, complete });
    updateClassMode(false);
  }
  function updateClassMode(enabled: boolean) {
    setClassMode(enabled);
    try {
      if (enabled) sessionStorage.setItem(classModeKey, studyDay());
      else sessionStorage.removeItem(classModeKey);
    } catch { /* the current lesson still works in memory */ }
  }
  function jumpTo(id: string) {
    const target = document.getElementById(id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView();
  }
  function exerciseCard(question: Question) {
    return <QuestionCard question={question} area={lesson.area} mode={classMode ? "live" : "practice"}
      previous={latestAnswers.get(question.id)} flagged={state.flagged.includes(question.id)}
      onFlag={() => onFlag(question.id)} onAttempt={onAttempt} />;
  }
  const rules = <>
    {guided.map(({ id, title, points, example, question, followUpQuestion }) => <section className="lesson-rule" key={id}
        aria-labelledby={`regla-${id}`} id={question.id === targetId ? "pregunta-marcada" : undefined} tabIndex={-1}>
        <h3 id={`regla-${id}`}>{title}</h3>
        <ul className="lesson-steps">{points.map(point => <li key={point}>{point}</li>)}</ul>
        <WorkedExampleSteps example={example} area={lesson.area} />
        <div className="lesson-guided-practice">
          <h4>Ejercicio guiado</h4>
          {exerciseCard(question)}
        </div>
        <details className="question-details guided-follow-up" id={followUpQuestion.id === targetId ? "pregunta-marcada" : undefined}
          open={followUpQuestion.id === targetId || undefined} tabIndex={-1}>
          <summary>Practicar otra vez</summary>
          {exerciseCard(followUpQuestion)}
        </details>
      </section>)}
    {lesson.prerequisiteIds.some(id => lessonById.has(id)) && <p className="muted">Temas previos: {lesson.prerequisiteIds.map(id => lessonById.get(id)).filter(Boolean).map((entry, index) =>
      <span key={entry!.id}>{index > 0 && ", "}<a href={lessonHref(entry!.id)}>{entry!.title}</a></span>,
    )}</p>}
  </>;
  return <>
    <header className="lesson-header">
      <a className="back-link" href="#/temario">Temario</a>
      <AreaTag area={lesson.area} />
      <h1>{lesson.title}</h1>
      <p>{lesson.objective}</p>
      <div className="row">
        <button className="button primary" onClick={() => jumpTo("explicacion")}>Ir a la práctica guiada</button>
        <button className="button secondary" onClick={copyLink}><Icon name="link" size={16}/> Copiar enlace</button>
        <button className="button secondary" onClick={() => onPin(state.pinned === lesson.id ? "" : lesson.id)}>
          {state.pinned === lesson.id ? "Quitar de Clase de hoy" : "Fijar como clase de hoy"}
        </button>
        <button className="button quiet class-guide-shortcut" onClick={() => jumpTo("guia-clase")}>Ir a la guía de clase</button>
      </div>
    </header>
    <div className="workbook-grid">
      <div className="workbook-flow">
        <section className="worksheet" id="explicacion" tabIndex={-1} aria-labelledby="workbook-explanation">
          <h2 id="workbook-explanation">Explicación</h2>
          {rules}
        </section>
        <section className="worksheet mini-sheet" aria-labelledby="mini-title">
          <h2 id="mini-title">Miniexamen</h2>
          <p>Resuelve {miniQuestionCount} preguntas. Al entregar, el sitio guarda tu tiempo y tus aciertos.</p>
          <a className="button primary" href={miniHref(lesson.id)}>Hacer miniexamen</a>
        </section>
        {bankQuestion && <section className="worksheet" id="pregunta-marcada" tabIndex={-1} aria-labelledby="bank-question-title">
          <h2 id="bank-question-title">Pregunta del banco</h2>
          {exerciseCard(bankQuestion)}
        </section>}
        <p className="source-note">{lesson.source}</p>
      </div>
      <aside className="lesson-rail" id="guia-clase" tabIndex={-1} aria-label="Guía de clase">
        <section className="rail-panel">
          <h2>Guía para la clase</h2>
          <p className="muted">Sesión modelo de 60 minutos.</p>
          <Agenda />
          <label className="check-label"><input type="checkbox" checked={classMode} onChange={event => updateClassMode(event.target.checked)} /> Estamos en clase</label>
          {classMode && <p className="muted">Las respuestas cuentan. Registra el tiempo total al final.</p>}
          <a className="button quiet" href={miniHref(lesson.id)}>Ir al miniexamen</a>
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
