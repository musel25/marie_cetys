import { useEffect, useRef, useState } from "react";
import { miniFormCount, miniQuestions } from "./content/mini";
import { miniHistory, nextMiniForm, studyDay } from "./study";
import type { Lesson, MiniResult } from "./types";
import { AreaTag, elapsedTime, Icon, lessonHref } from "./ui";
import { QuestionVisual, questionText } from "./Workbook";

type MiniRun = {
  id: string;
  started: number;
  form: number;
  current: number;
  answers: (number | null)[];
  saved?: boolean;
};

function loadRun(key: string, count: number): MiniRun | null {
  try {
    const run = JSON.parse(sessionStorage.getItem(key) ?? "null") as MiniRun | null;
    if (run && typeof run.id === "string" && (run.saved === undefined || typeof run.saved === "boolean") &&
        Number.isSafeInteger(run.started) && run.started >= 0 &&
        Number.isInteger(run.form) && run.form >= 0 && run.form < count &&
        Array.isArray(run.answers) && run.answers.length === 5 && run.answers.every(answer =>
          answer === null || (Number.isInteger(answer) && answer >= 0 && answer < 4)) &&
        Number.isInteger(run.current) && run.current >= 0 && run.current < run.answers.length) return run;
  } catch { /* a new test can start without a saved draft */ }
  return null;
}

function differenceText(seconds: number) {
  if (seconds === 0) return "El mismo tiempo que la anterior";
  return elapsedTime(Math.abs(seconds)) + (seconds < 0 ? " menos que la anterior" : " más que la anterior");
}

export default function MiniExam({ lesson, results, onFinish }: {
  lesson: Lesson; results: MiniResult[]; onFinish: (result: MiniResult) => Promise<boolean>;
}) {
  const formCount = miniFormCount(lesson.id);
  const questionLanguage = lesson.area === "en" ? "en" : undefined;
  const key = "marie-cetys:mini:" + lesson.id;
  const [run, setRun] = useState(() => loadRun(key, formCount));
  const [now, setNow] = useState(Date.now);
  const [discard, setDiscard] = useState(false);
  const saving = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const restartButton = useRef<HTMLButtonElement>(null);
  const discardButton = useRef<HTMLButtonElement>(null);
  const history = miniHistory(results, lesson.id);
  const result = history.find(entry => entry.id === run?.id);
  const active = run !== null && !run.saved && !result;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active]);

  function update(next: MiniRun | null) {
    setRun(next);
    try {
      if (next) sessionStorage.setItem(key, JSON.stringify(next));
      else sessionStorage.removeItem(key);
    } catch { /* continue in memory if browser storage is unavailable */ }
  }

  function focusHeading() {
    requestAnimationFrame(() => heading.current?.focus());
  }

  function reset() {
    setDiscard(false);
    update(null);
    focusHeading();
  }

  function showDiscard(show: boolean) {
    setDiscard(show);
    requestAnimationFrame(() => (show ? discardButton.current : restartButton.current)?.focus());
  }

  function start() {
    const at = Date.now();
    setNow(at);
    update({ id: crypto.randomUUID(), started: at, form: nextMiniForm(results, lesson.id, formCount),
      current: 0, answers: Array(5).fill(null) });
    focusHeading();
  }

  function changeQuestion(index: number) {
    if (!run) return;
    update({ ...run, current: index });
    focusHeading();
  }

  async function finish() {
    if (!run || result || saving.current || run.answers.some(answer => answer === null)) return;
    const at = Date.now();
    const items = miniQuestions(lesson.id, run.form);
    const answers = run.answers.map(answer => answer!);
    saving.current = true;
    try {
      const saved = await onFinish({
        id: run.id, skill: lesson.id, at, day: studyDay(new Date(at)), form: run.form,
        seconds: Math.max(1, Math.floor((at - run.started) / 1000)),
        answers, correct: answers.filter((answer, index) => answer === items[index].answer).length,
      });
      if (saved) update({ ...run, saved: true });
      focusHeading();
    } finally { saving.current = false; }
  }

  const previous = result ? history[history.findIndex(entry => entry.id === result.id) + 1] : undefined;
  const question = run && miniQuestions(lesson.id, run.form)[run.current];
  const spent = run ? Math.max(0, Math.floor((now - run.started) / 1000)) : 0;
  return <>
    <header className="lesson-header">
      <a className="back-link" href={lessonHref(lesson.id)}>Volver a los ejercicios</a>
      <AreaTag area={lesson.area} />
      <h1>Miniexamen</h1>
      <p>{lesson.title}</p>
    </header>
    {!active && !result && <section className="worksheet mini-sheet">
      <h2 ref={heading} tabIndex={-1}>5 preguntas</h2>
      <p>El cronómetro va desde que empiezas hasta que entregas. Puedes volver a una pregunta para cambiar tu respuesta.</p>
      <p>Al terminar verás tu tiempo, tus aciertos y las soluciones.</p>
      {history[0] && <p className="mini-previous">Último intento · {history[0].correct} de 5 · {elapsedTime(history[0].seconds)}</p>}
      <button className="button primary" onClick={start}>Empezar miniexamen</button>
    </section>}
    {active && run && question && <section className="worksheet mini-sheet">
      <div className="section-title">
        <h2 ref={heading} tabIndex={-1}>Pregunta {run.current + 1} de 5</h2>
        <span className="timer" role="timer" aria-label="Tiempo transcurrido"><Icon name="clock" size={17}/><time dateTime={`PT${spent}S`}>{elapsedTime(spent)}</time></span>
      </div>
      <fieldset lang={questionLanguage}>
        <legend className="exercise-prompt">{questionText(question.prompt)}</legend>
        <QuestionVisual prompt={question.prompt} />
        <div className="answers">
          {question.options.map((option, index) => <label className="answer" key={option}>
            <input type="radio" name={question.id} checked={run.answers[run.current] === index}
              onChange={() => update({ ...run, answers: run.answers.map((answer, position) => position === run.current ? index : answer) })} />
            <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span>{option}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="row question-actions">
        <button className="button secondary" disabled={run.current === 0} onClick={() => changeQuestion(run.current - 1)}>Anterior</button>
        {run.current < 4 && <button className="button primary" disabled={run.answers[run.current] === null} onClick={() => changeQuestion(run.current + 1)}>Siguiente</button>}
        <button className={`button ${run.current === 4 ? "primary" : "secondary"}`} disabled={run.answers.some(answer => answer === null)}
          onClick={() => void finish()}>Entregar miniexamen</button>
      </div>
      {discard ? <div className="row">
        <button className="button secondary" ref={discardButton} onClick={reset}>Descartar intento</button>
        <button className="button quiet" onClick={() => showDiscard(false)}>Seguir con la prueba</button>
      </div> : <button className="button quiet" ref={restartButton} onClick={() => showDiscard(true)}>Reiniciar prueba</button>}
    </section>}
    {result && <>
      <section className="worksheet mini-sheet">
        <h2 ref={heading} tabIndex={-1}>Resultado del miniexamen</h2>
        <div className="row mini-stats">
          <div><span>Tiempo</span><strong>{elapsedTime(result.seconds)}</strong></div>
          <div><span>Aciertos</span><strong>{result.correct} de 5</strong></div>
        </div>
        {previous ? <div className="mini-previous">
          <p><strong>{differenceText(result.seconds - previous.seconds)}</strong></p>
          <p>Anterior · {elapsedTime(previous.seconds)} · {previous.correct} de 5</p>
        </div> : <p>Este resultado será la referencia para el próximo intento.</p>}
        <div className="row">
          <a className="button primary" href="#/progreso">Ver progreso</a>
          <button className="button secondary" onClick={reset}>Hacer otro miniexamen</button>
        </div>
      </section>
      <section className="practice-stack mini-solutions" aria-labelledby="mini-solutions">
        <h2 id="mini-solutions">Soluciones</h2>
        {miniQuestions(lesson.id, result.form).map((item, index) => <details className="question-details" key={item.id}>
          <summary>Pregunta {index + 1} · {result.answers[index] === item.answer ? "Correcta" : "Incorrecta"}</summary>
          <div className="exercise">
            <p className="exercise-prompt" lang={questionLanguage}>{questionText(item.prompt)}</p>
            <QuestionVisual prompt={item.prompt} />
            <p>Tu respuesta: <span lang={questionLanguage}>{item.options[result.answers[index]]}</span></p>
            <p><strong>Respuesta correcta</strong> · <span lang={questionLanguage}>{item.options[item.answer]}</span></p>
            <p>{item.explanation}</p>
          </div>
        </details>)}
      </section>
    </>}
  </>;
}
