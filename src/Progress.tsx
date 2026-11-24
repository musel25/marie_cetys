import { useState } from "react";
import { areaOrder, areas, curriculum, lessonById } from "./content";
import { addDays, dateLabel, periodStart, questions, summary } from "./study";
import { duration, elapsedTime, Icon, miniHref, PageHeading, lessonHref, questionHref } from "./ui";
import type { Period, StudyState } from "./types";

const periods = { day: "Día", week: "Semana", month: "Mes" };

function shiftPeriod(day: string, period: Period, delta: number) {
  if (period === "day") return addDays(day, delta);
  if (period === "week") return addDays(day, delta * 7);
  const value = new Date(day + "T12:00:00Z");
  value.setUTCMonth(value.getUTCMonth() + delta);
  return value.toISOString().slice(0, 10);
}

export function Progress({ state, today, onFlag }: { state: StudyState; today: string; onFlag: (id: string) => void }) {
  const [period, setPeriod] = useState<Period>("week");
  const [selected, setSelected] = useState(today);
  const first = periodStart(selected, period);
  const last = addDays(shiftPeriod(first, period, 1), -1);
  const results = summary(state, first, last);
  const minis = [...results.miniResults].sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
  const miniCount = minis.reduce((sum, item) => sum + item.answers.length, 0);
  const miniCorrect = minis.reduce((sum, item) => sum + item.correct, 0);
  const totalQuestions = results.attempts.length + miniCount;
  const correct = results.correct + miniCorrect;
  const minutes = results.classMinutes + Math.round(results.seconds / 60);
  const completed = new Set(state.classes.filter(entry => entry.complete).map(entry => entry.skill)).size;
  const mistakeCounts = new Map<string, number>();
  for (const attempt of results.attempts) if (!attempt.correct || attempt.help) {
    mistakeCounts.set(attempt.skill, (mistakeCounts.get(attempt.skill) ?? 0) + 1);
  }
  for (const mini of minis) if (mini.correct < mini.answers.length) {
    mistakeCounts.set(mini.skill, (mistakeCounts.get(mini.skill) ?? 0) + mini.answers.length - mini.correct);
  }
  const revisit = Array.from(mistakeCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const flagged = state.flagged.flatMap(id => {
    const lesson = lessonById.get(id.split(":")[0]);
    const question = lesson && questions(lesson).find(item => item.id === id);
    const number = lesson ? questions(lesson).filter(item => item.difficulty !== "challenge").findIndex(item => item.id === id) + 1 : 0;
    return question ? [{ question, lesson, number }] : [];
  });

  const bars = period === "day" ? [] : Array.from({ length: period === "week" ? 7 : 5 }, (_, index) => {
    const from = addDays(first, period === "week" ? index : index * 7);
    const to = period === "week" ? from : addDays(from, 6) > last ? last : addDays(from, 6);
    const data = summary(state, from, to);
    return { from, to, minutes: data.classMinutes + Math.round(data.seconds / 60) };
  }).filter(bar => bar.from <= last);

  return <>
    <PageHeading title="Progreso" description="Consulta tu tiempo, tus resultados y las dudas para la siguiente clase." />
    <div className="progress-controls">
      <div className="segmented" aria-label="Periodo">{Object.entries(periods).map(([key, label]) =>
        <button key={key} aria-pressed={period === key} onClick={() => { setPeriod(key as Period); setSelected(today); }}>{label}</button>,
      )}</div>
      <div className="row range-controls">
        <button className="button secondary" onClick={() => setSelected(shiftPeriod(first, period, -1))}>Anterior</button>
        <span>{dateLabel(first)}{first !== last ? ` a ${dateLabel(last)}` : ""}</span>
        <button className="button secondary" disabled={first >= periodStart(today, period)} onClick={() => setSelected(shiftPeriod(first, period, 1))}>Siguiente</button>
      </div>
    </div>
    <div className="metric-grid">
      <div className="metric"><span>Tiempo de estudio</span><strong>{duration(minutes, results.seconds > 0)}</strong><span>{duration(results.classMinutes)} de clase · {results.activeDays} {results.activeDays === 1 ? "día activo" : "días activos"}</span></div>
      <div className="metric"><span>Preguntas resueltas</span><strong>{totalQuestions}</strong><span>{correct} {correct === 1 ? "correcta" : "correctas"}</span></div>
      <div className="metric"><span>Porcentaje de aciertos</span><strong>{totalQuestions ? Math.round(100 * correct / totalQuestions) + "%" : "—"}</strong><span>En el periodo</span></div>
      <div className="metric"><span>Clases completadas</span><strong>{results.complete}</strong><span>{completed} de {curriculum.length} en total</span></div>
    </div>
    <div className="progress-grid">
      {bars.length > 0 && <section className="panel">
        <h2>Tiempo por {period === "week" ? "día" : "bloque semanal"}</h2>
        <div className="bar-chart">
          {bars.map(bar => <div className="bar-row" key={bar.from}>
            <span>{dateLabel(bar.from)}{period === "month" ? `–${bar.to.slice(-2)}` : ""}</span>
            <meter aria-label={dateLabel(bar.from)} value={bar.minutes} max={Math.max(60, ...bars.map(entry => entry.minutes))} />
            <strong>{bar.minutes} min</strong>
          </div>)}
        </div>
      </section>}
      <section className="panel">
        <h2>Resultados por área</h2>
        <div className="stat-list">
          {areaOrder.map(area => {
            const matching = results.attempts.filter(attempt => lessonById.get(attempt.skill)?.area === area);
            const matchingMinis = minis.filter(item => lessonById.get(item.skill)?.area === area);
            const count = matching.length + matchingMinis.reduce((sum, item) => sum + item.answers.length, 0);
            const right = matching.filter(attempt => attempt.correct).length + matchingMinis.reduce((sum, item) => sum + item.correct, 0);
            return <div key={area}><span>{areas[area].title}</span><strong>{right} de {count}</strong></div>;
          })}
        </div>
      </section>
      <section className="panel">
        <h2>Temas para retomar</h2>
        {revisit.length === 0 ? <p className="muted">Aquí verás los temas con errores o respuestas con ayuda.</p> :
          <ul className="plain-list">{revisit.map(([id, count]) => <li key={id}><a href={lessonHref(id)}>{lessonById.get(id)?.title ?? id}</a> <span className="muted">{count} {count === 1 ? "respuesta" : "respuestas"}</span></li>)}</ul>}
      </section>
      <section className="panel">
        <h2><Icon name="flag" size={20}/> Dudas guardadas</h2>
        {!flagged.length ? <p className="muted">Guarda un ejercicio para comentarlo durante la clase.</p> :
          <ul className="plain-list">{flagged.map(({ question, lesson, number }) => <li key={question.id}>
            <div><a href={questionHref(question.id)}>{lesson!.title} · {number ? `Ejercicio ${number}` : "Ejercicio de reto"}</a><p className="excerpt">{question.prompt}</p></div>
            <button className="button quiet" onClick={() => onFlag(question.id)} aria-label={`Quitar duda de ${lesson!.title}`}>Quitar</button>
          </li>)}</ul>}
      </section>
    </div>
    <section className="panel mini-history" aria-labelledby="mini-history-title">
      <h2 id="mini-history-title">Miniexámenes</h2>
      {minis.length === 0 ? <p className="muted">Aquí verás el tiempo y los aciertos de tus miniexámenes.</p> :
        <ul className="plain-list">{minis.map(item => <li key={item.id}>
          <div><a href={miniHref(item.skill)}>{lessonById.get(item.skill)?.title ?? item.skill}</a><p>{dateLabel(item.day)}</p></div>
          <div className="mini-history-result"><strong>{elapsedTime(item.seconds)}</strong><span>{item.correct} de 5</span></div>
        </li>)}</ul>}
    </section>
  </>;
}
