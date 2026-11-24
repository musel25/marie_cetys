import { useEffect, useState } from "react";
import { areas, areaOrder, byArea, lessonById } from "./content";
import { questions, studyDay } from "./study";
import { AreaTag, Icon, PageHeading, lessonHref } from "./ui";
import type { Area, Attempt, Question, StudyState } from "./types";

interface ExamRun {
  id: string;
  area: Area;
  size: "short" | "full";
  items: Question[];
  answers: Record<string, number>;
  started: number;
  end: number;
  finished?: number;
  index: number;
}

const examKey = "marie-cetys:exam:v1";

function selectQuestions(area: Area, count: number, state: StudyState) {
  const lastSeen = new Map(state.attempts.map(a => [a.item, a.at]));
  const groups = byArea[area].map(lesson => questions(lesson).sort((a, b) => {
    const seen = (lastSeen.get(a.id) ?? 0) - (lastSeen.get(b.id) ?? 0);
    const rank = { exam: 0, challenge: 1, base: 2 };
    return seen || rank[a.difficulty] - rank[b.difficulty];
  }));
  const pool: Question[] = [];
  for (let round = 0; pool.length < count && groups.some(group => group[round]); round++) {
    for (const group of groups) if (group[round] && pool.length < count) pool.push(group[round]);
  }
  return pool;
}

function loadExam(): ExamRun | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(examKey) ?? "null") as ExamRun | null;
    if (!saved || !areaOrder.includes(saved.area) || !Number.isFinite(saved.end) ||
        !Array.isArray(saved.items) || !saved.items.length || !saved.items[saved.index]) return null;
    return saved;
  } catch { return null; }
}

export function Exam({ state, onAttempts }: { state: StudyState; onAttempts: (items: Attempt[]) => void }) {
  const [run, setRun] = useState(loadExam);
  const [now, setNow] = useState(Date.now);
  const [showConfirm, setShowConfirm] = useState(false);
  const [filter, setFilter] = useState(true);

  function update(value: ExamRun | null) {
    setRun(value);
    try { sessionStorage.setItem(examKey, JSON.stringify(value)); } catch { /* browser storage may be unavailable */ }
  }

  function start(area: Area, size: ExamRun["size"]) {
    const items = selectQuestions(area, size === "short" ? 10 : areas[area].count, state);
    const started = Date.now();
    const minutes = size === "full" ? areas[area].time : Math.ceil(items.length * areas[area].time / areas[area].count);
    setNow(started);
    setFilter(true);
    update({ id: crypto.randomUUID(), area, size, items, answers: {}, started, end: started + minutes * 60_000, index: 0 });
  }

  function finish(value: ExamRun, finishTime: number) {
    const finished = Math.min(finishTime, value.end);
    const at = finished;
    const day = studyDay(new Date(at));
    const attempts = value.items.map((question, index) => {
      const selection = value.answers[question.id] ?? -1;
      const seconds = index === 0 ? Math.max(1, Math.round((finished - value.started) / 1000)) : 0;
      return { id: value.id + ":" + question.id, item: question.id, skill: question.skill, day, at, seconds, mode: "exam" as const, correct: selection === question.answer, help: false, selection };
    });
    onAttempts(attempts);
    setShowConfirm(false);
    update({ ...value, finished });
  }

  useEffect(() => {
    if (!run || run.finished) return;
    const tick = () => setNow(Date.now());
    tick();
    const interval = window.setInterval(tick, 300);
    return () => window.clearInterval(interval);
  }, [run?.id, run?.finished]);

  useEffect(() => {
    if (run && !run.finished && now >= run.end) finish(run, now);
  }, [run, now]);

  if (!run) return <>
    <PageHeading title="Simulacro" description="Practica el ritmo del examen con preguntas originales. Las soluciones aparecen al terminar." />
    <div className="exam-grid">{areaOrder.map(area => {
      const info = areas[area];
      const available = byArea[area].reduce((sum, lesson) => sum + lesson.exercises.length, 0);
      return <section className="panel exam-area" key={area}>
        <AreaTag area={area} /><h2>{info.count} preguntas</h2>
        <p><Icon name="clock" size={17}/> {info.time} minutos en la sección completa</p>
        <div className="row">
          <button className="button primary" disabled={available < info.count} onClick={() => start(area, "full")}>Sección completa</button>
          <button className="button secondary" disabled={available < 10} onClick={() => start(area, "short")}>Serie de 10</button>
        </div>
      </section>;
    })}</div>
    <p className="source-note">Modelo de tiempos de la prueba de práctica de College Board. Los resultados son porcentajes de práctica.</p>
  </>;

  const answered = Object.keys(run.answers).length;
  if (run.finished) {
    const correct = run.items.filter(item => run.answers[item.id] === item.answer).length;
    const review = run.items.filter(item => !filter || run.answers[item.id] !== item.answer);
    return <>
      <PageHeading title="Resultado del simulacro" description={areas[run.area].title} />
      <section className="panel exam-result">
        <strong>{Math.round(100 * correct / run.items.length)}%</strong>
        <div><h2>{correct} de {run.items.length} correctas</h2><p>{run.items.length - answered} sin responder</p></div>
        <button className="button primary" onClick={() => update(null)}>Elegir otra sección</button>
      </section>
      <label className="check-label results-filter"><input type="checkbox" checked={filter} onChange={event => setFilter(event.target.checked)} /> Mostrar solo errores y omisiones</label>
      <div className="practice-stack">
        {review.map(question => <details className="question-details" key={question.id}>
          <summary>{run.answers[question.id] === question.answer ? "Correcta" : run.answers[question.id] === undefined ? "Sin responder" : "Incorrecta"} · {lessonById.get(question.skill)?.title}</summary>
          <div className="exercise">
            <p className="exercise-prompt" lang={run.area === "en" ? "en" : undefined}>{question.prompt}</p>
            {run.answers[question.id] !== undefined && <p>Tu respuesta: {question.options[run.answers[question.id]]}</p>}
            <p><strong>Respuesta correcta</strong> · {question.options[question.answer]}</p><p>{question.explanation}</p>
            <a href={lessonHref(question.skill)}>Abrir lección</a>
          </div>
        </details>)}
        {!review.length && <p>Correctas todas las preguntas.</p>}
      </div>
    </>;
  }

  const item = run.items[run.index];
  const seconds = Math.max(0, Math.ceil((run.end - now) / 1000));
  const timer = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return <>
    <PageHeading title={areas[run.area].title} description="Simulacro cronometrado" />
    <div className="timed-layout">
      <section className="worksheet">
        <div className="section-title"><h2>Pregunta {run.index + 1} de {run.items.length}</h2><span className="timer" aria-label={`Tiempo restante ${Math.floor(seconds / 60)} minutos y ${seconds % 60} segundos`}><Icon name="clock"/>{timer}</span></div>
        <fieldset>
          <legend className="exercise-prompt" lang={run.area === "en" ? "en" : undefined}>{item.prompt}</legend>
          <div className="answers">{item.options.map((option, index) => <label className="answer" key={option}>
            <input type="radio" name="exam-answer" checked={run.answers[item.id] === index} onChange={() => {
              if (Date.now() < run.end) update({ ...run, answers: { ...run.answers, [item.id]: index } });
            }} />
            <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span lang={run.area === "en" ? "en" : undefined}>{option}</span>
          </label>)}</div>
        </fieldset>
        <div className="row question-actions">
          <button className="button secondary" disabled={run.index === 0} onClick={() => update({ ...run, index: run.index - 1 })}>Anterior</button>
          <button className="button primary" disabled={run.index === run.items.length - 1} onClick={() => update({ ...run, index: run.index + 1 })}>Siguiente</button>
        </div>
      </section>
      <aside className="rail-panel">
        <h2>Preguntas</h2>
        <p>{answered} de {run.items.length} respondidas</p>
        <div className="exam-navigation">{run.items.map((question, index) =>
          <button className="exam-number" aria-current={index === run.index ? "step" : undefined}
            data-answered={run.answers[question.id] !== undefined} key={question.id}
            aria-label={`Pregunta ${index + 1}, ${run.answers[question.id] === undefined ? "sin responder" : "respondida"}`}
            onClick={() => update({ ...run, index })}>{index + 1}</button>,
        )}</div>
        {showConfirm ? <div className="finish-confirm">
          <p>{run.items.length - answered} preguntas sin responder.</p>
          <div className="row"><button className="button primary" onClick={() => finish(run, Date.now())}>Confirmar</button><button className="button secondary" onClick={() => setShowConfirm(false)}>Continuar</button></div>
        </div> : <button className="button primary" onClick={() => answered < run.items.length ? setShowConfirm(true) : finish(run, Date.now())}>Terminar sección</button>}
      </aside>
    </div>
  </>;
}
