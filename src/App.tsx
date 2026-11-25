import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { areas, areaOrder, byArea, curriculum, lessonById, resourceLinks } from "./content";
import { Exam } from "./Exam";
import { addDays, classPlan, dateLabel, loadState, periodStart, reviewCards, reviewQuestion, saveState, studyDay, studyMinutes, summary } from "./study";
import type { Area, Attempt, ClassRecord, Lesson, MiniResult, Question, StudyState } from "./types";
import { AreaTag, duration, elapsedTime, Icon, lessonHref, miniHref, PageHeading, type IconName } from "./ui";
import { OrderDiagram, QuestionCard } from "./QuestionCard";
import { mergeImportedProgress, mergePlanSettings, mergeProgress, sameProgress, type ProgressBaseline } from "./progressSync";
import { isPreviousProgressPage, PreviousProgressPage, primaryOrigin, requestPreviousProgress } from "./previousProgress";
import { useProgressSync } from "./useProgressSync";

const navigation: { id: string; label: string; icon: IconName }[] = [
  { id: "", label: "Clase de hoy", icon: "home" },
  { id: "temario", label: "Temario", icon: "map" },
  { id: "repaso", label: "Repaso", icon: "repeat" },
  { id: "simulacro", label: "Simulacro", icon: "clock" },
  { id: "progreso", label: "Progreso", icon: "graph" },
  { id: "plan", label: "Plan", icon: "calendar" },
];
const MiniExam = lazy(() => import("./MiniExam"));
const Workbook = lazy(() => import("./Workbook"));
const Progress = lazy(() => import("./Progress"));
const Planner = lazy(() => import("./Planner"));
function readRoute() { return location.hash.replace(/^#\/?/, "").split("/").slice(0, 3); }

function Home({ state, today, dueCount }: { state: StudyState; today: string; dueCount: number }) {
  const plan = classPlan(curriculum, state, today);
  const slot = plan.slots[0];
  const lesson = lessonById.get(state.pinned) ?? (slot ? lessonById.get(slot.lessons[0]) : undefined);
  const completed = new Set(state.classes.filter(record => record.complete).map(record => record.skill));
  const first = periodStart(today, "week");
  const week = summary(state, first, addDays(first, 6));
  const weeklyGoal = Array.from({ length: 7 }, (_, index) => addDays(first, index)).filter(day =>
    day >= state.settings.start && (!state.settings.exam || day < state.settings.exam),
  ).reduce((total, day) => total + studyMinutes(day, state.settings), 0);
  const usedMinutes = Math.round(week.seconds / 60) + week.classMinutes;
  const published = lesson?.exercises.filter(exercise => exercise.difficulty !== "challenge").length;
  return <>
    <div className="home-top"><PageHeading title="Clase de hoy" /><time dateTime={today}><Icon name="calendar" size={17}/>{dateLabel(today, "long")}</time></div>
    <div className="home-grid">
      <section className="hero">
        {lesson ? <>
          <div className="hero-copy">
            <AreaTag area={lesson.area} />
            <h2>{lesson.title}</h2>
            <p>{lesson.objective}</p>
            <a className="button hero-button" href={lessonHref(lesson.id)}>Abrir la clase</a>
          </div>
          {lesson.id === "hc-orden" ? <OrderDiagram preview /> : <div className="hero-symbol"><Icon name="book" size={90}/></div>}
        </> : <div className="hero-copy"><h2>{completed.size >= curriculum.length ? "Temario completado" : "Estudia a tu ritmo"}</h2><p>Abre cualquier lección o ajusta tus fechas.</p><a className="button hero-button" href="#/temario">Ver temario</a></div>}
        {lesson && <div className="hero-footer">
          <span><Icon name="book" size={17}/> Práctica y miniexamen</span>
          <span><Icon name="check" size={17}/> {published} ejercicios</span>
          <span><Icon name="clock" size={17}/> {duration(state.pinned ? studyMinutes(today, state.settings) || state.settings.minutes : slot?.minutes ?? state.settings.minutes)}</span>
          {slot && slot.day > today && !state.pinned && <span>Próxima · {dateLabel(slot.day)}</span>}
        </div>}
      </section>
      <aside className="home-rail">
        <section className="panel review-preview">
          <div className="panel-icon"><Icon name="repeat"/></div>
          <h2>Repaso opcional</h2>
          <p>{dueCount ? `${dueCount} ${dueCount === 1 ? "tema disponible" : "temas disponibles"}` : "Tus temas aparecerán aquí cuando toque practicarlos."}</p>
          <a className="button secondary" href="#/repaso">{dueCount ? "Empezar repaso" : "Ver repaso"}</a>
        </section>
        <section className="panel week-summary">
          <h2>Esta semana</h2>
          <strong>{duration(usedMinutes, week.seconds > 0)}</strong>
          {weeklyGoal > 0 ? <>
            <span> de {duration(weeklyGoal)}</span>
            <progress aria-label="Tiempo de estudio esta semana" value={Math.min(usedMinutes, weeklyGoal)} max={weeklyGoal} />
          </> : <span> de estudio</span>}
          <a href="#/progreso">Ver progreso</a>
        </section>
      </aside>
    </div>
    <section className="home-curriculum">
      <div className="section-title"><h2>Tu temario</h2><a className="text-link" href="#/temario">Ver todos los temas</a></div>
      <div className="area-grid">{areaOrder.map(area => {
        const total = byArea[area].length;
        const done = byArea[area].filter(item => completed.has(item.id)).length;
        return <a className={`area-card area-${area}`} href={`#/temario/${area}`} key={area}>
          <span className="area-mark" aria-hidden="true">{area === "hc" ? "◇" : area === "mat" ? "÷" : area === "es" ? "ñ" : "Aa"}</span>
          <h3>{areas[area].title}</h3>{area === "hc" && <p className="area-description">Lógica, patrones y relaciones</p>}<span>{done} de {total} clases completas</span>
          <progress value={done} max={total || 1} aria-label={`Clases completas de ${areas[area].title}`} />
        </a>;
      })}</div>
    </section>
  </>;
}

function Curriculum({ filter, state }: { filter: Area | undefined; state: StudyState }) {
  const selected = filter ? [filter] : areaOrder;
  const completed = new Set(state.classes.filter(record => record.complete).map(record => record.skill));
  return <>
    <PageHeading title="Temario" description="Abre cualquier lección. Sigue el orden de cada área si estás aprendiendo el tema." />
    <nav aria-label="Áreas del temario" className="filter-list">
      <a className="filter-chip" href="#/temario" aria-current={!filter ? "page" : undefined}>Todas</a>
      {areaOrder.map(area => <a key={area} className="filter-chip" href={`#/temario/${area}`} aria-current={filter === area ? "page" : undefined}>{areas[area].short}</a>)}
    </nav>
    <div className="curriculum-grid">{selected.map(area =>
      <section className="panel curriculum-panel" key={area}><AreaTag area={area}/><h2>{areas[area].title}</h2><p>{areas[area].message}</p>
        <ol className="topic-list">{byArea[area].map((lesson, index) => (
          <li key={lesson.id}><a href={lessonHref(lesson.id)}>
            <span className={`topic-index ${completed.has(lesson.id) ? "done" : ""}`}>{completed.has(lesson.id) ? <Icon name="check" size={16}/> : index + 1}</span>
            <span><strong>{lesson.title}</strong><span>{lesson.objective}</span></span>
            <span className="topic-count">{lesson.exercises.filter(item => item.difficulty !== "challenge").length} preguntas</span>
          </a></li>
        ))}</ol>
      </section>,
    )}</div>
    <section className="panel source-panel"><h2>Material de apoyo</h2>
      <ul className="plain-list">{resourceLinks.map(resource => <li key={resource.url}><div><a href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a><p>{resource.description}</p></div></li>)}</ul>
    </section>
  </>;
}

function Review({ due, state, onAttempt, onFlag }: {
  due: Lesson[]; state: StudyState; onAttempt: (item: Attempt) => void; onFlag: (id: string) => void;
}) {
  const [batch, setBatch] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [started, setStarted] = useState(false);
  const question = batch[index];
  const lesson = question && lessonById.get(question.skill);
  const minis = new Map([...state.miniResults].sort((a, b) => a.at - b.at).map(entry => [entry.skill, entry]));
  const available = curriculum.filter(item => minis.has(item.id) && !due.some(lesson => lesson.id === item.id));
  function start() {
    setBatch(due.slice(0, 8).flatMap(item => {
      const fresh = reviewQuestion(item, state.attempts);
      return fresh ? [fresh] : [];
    }));
    setIndex(0); setAnswered(false); setStarted(true);
  }
  return <>
    <PageHeading title="Repaso opcional" description="Intenta una pregunta nueva antes de volver a la explicación." />
    {!started && <section className="panel review-state">
      <div className="panel-icon"><Icon name="repeat" /></div>
      <h2>{due.length ? `${due.length} ${due.length === 1 ? "tema para repasar" : "temas para repasar"}` : "Estás al día"}</h2>
      <p>{due.length ? "Empieza una ronda de hasta ocho preguntas." : "Después de practicar un tema, el sitio te sugerirá cuándo retomarlo."}</p>
      {due.length ? <button className="button primary" onClick={start}>Empezar repaso</button> : <a className="button secondary" href="#/temario">Ver temario</a>}
    </section>}
    {started && lesson && question && <section className="worksheet review-work">
      <div className="section-title"><AreaTag area={lesson.area}/><span>{index + 1} de {batch.length}</span></div>
      <h2>{lesson.title}</h2>
      <QuestionCard key={question.id} question={question} mode="review" area={lesson.area} flagged={state.flagged.includes(question.id)} onFlag={() => onFlag(question.id)} onAttempt={item => { onAttempt(item); setAnswered(true); }} />
      <div className="row review-actions">
        <a className="button secondary" href={lessonHref(lesson.id)}>Abrir explicación</a>
        <a className="button secondary" href={miniHref(lesson.id)}>Hacer miniexamen</a>
        {answered && <button className="button primary" onClick={() => { setIndex(index + 1); setAnswered(false); }}>{index === batch.length - 1 ? "Terminar repaso" : "Siguiente pregunta"}</button>}
      </div>
    </section>}
    {started && !question && <section className="panel review-state"><h2>Ronda terminada</h2><p>Repasaste {batch.length} temas.</p>
      {due.length ? <button className="button primary" onClick={start}>Repasar más temas</button> : <a className="button secondary" href="#/progreso">Ver progreso</a>}
    </section>}
    {!started && due.length > 0 && <section className="panel due-topics">
      <h2>Temas disponibles</h2>
      <ul className="plain-list">{due.map(item => <li key={item.id}>
        <a href={lessonHref(item.id)}>{item.title}</a>
        <a href={miniHref(item.id)} aria-label={`Miniexamen de ${item.title}`}>Miniexamen</a>
      </li>)}</ul>
    </section>}
    {!started && available.length > 0 && <section className="panel due-topics">
      <h2>Miniexámenes para repetir</h2>
      <ul className="plain-list">{available.map(item => <li key={item.id}>
        <a href={miniHref(item.id)}>{item.title}</a><span>{elapsedTime(minis.get(item.id)!.seconds)}</span>
      </li>)}</ul>
    </section>}
  </>;
}

export function App() {
  return isPreviousProgressPage() ? <main id="main-content" className="main-content"><PreviousProgressPage /></main> : <StudyApp />;
}

function StudyApp() {
  const [initial] = useState(loadState);
  const [state, setState] = useState(initial.state);
  const [localChange, setLocalChange] = useState(0);
  const currentState = useRef(initial.state);
  const unsaved = useRef(false);
  const [route, setRoute] = useState(readRoute);
  const [message, announce] = useState(initial.recovered ? "No se encontró un progreso válido en este navegador." : "");
  const [today, setToday] = useState(studyDay);
  const main = useRef<HTMLElement>(null);
  const [page = "", id, target] = route;
  const cards = useMemo(() => reviewCards(state.attempts, state.miniResults), [state.attempts, state.miniResults]);
  const due = useMemo(() => curriculum.filter(item => (cards.get(item.id)?.due ?? "9999") <= today)
    .sort((a, b) => (cards.get(a.id)?.due ?? "").localeCompare(cards.get(b.id)?.due ?? "")), [cards, today]);

  useEffect(() => {
    function navigate() {
      const next = readRoute();
      setRoute(next);
      window.scrollTo(0, 0);
      if (!next[2]) requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    }
    function updateDate() { setToday(studyDay()); }
    function readOtherTab() {
      const saved = loadState();
      if (!saved.found || unsaved.current) return;
      currentState.current = saved.state;
      setState(saved.state);
    }
    window.addEventListener("hashchange", navigate);
    window.addEventListener("focus", updateDate);
    window.addEventListener("storage", readOtherTab);
    const clock = window.setInterval(updateDate, 30_000);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("focus", updateDate);
      window.removeEventListener("storage", readOtherTab);
      window.clearInterval(clock);
    };
  }, []);

  const snapshot = useCallback(() => {
    const saved = loadState();
    return saved.found && !unsaved.current ? saved.state : currentState.current;
  }, []);

  const update = useCallback((transform: (before: StudyState) => StudyState, savedMessage?: string, fromSync = false) => {
    function commit() {
      const next = transform(snapshot());
      if (fromSync && !unsaved.current && sameProgress(currentState.current, next)) return true;
      if (!fromSync) setLocalChange(change => change + 1);
      currentState.current = next;
      setState(next);
      try {
        saveState(next);
        unsaved.current = false;
        if (savedMessage) announce(savedMessage);
        return true;
      } catch {
        unsaved.current = true;
        announce("Este navegador no pudo guardar el progreso. Descarga un respaldo desde Plan.");
        return false;
      }
    }
    if (navigator.locks) {
      return navigator.locks.request("marie-cetys:study", commit).catch(() => commit());
    }
    return Promise.resolve(commit());
  }, [snapshot]);
  const applyRemote = useCallback((remote: StudyState, captured: ProgressBaseline) =>
    update(before => mergeProgress(before, remote, captured), undefined, true), [update]);
  const sync = useProgressSync({ change: localChange, snapshot, apply: applyRemote });
  const connected = sync.connected;
  function importBackup(data: StudyState) {
    return update(before => connected ? mergeImportedProgress(before, data) : data);
  }
  async function importPrevious() {
    const previous = await requestPreviousProgress();
    await update(before => mergeImportedProgress(before, previous));
    await sync.syncNow().catch(() => { /* the imported history is already stored locally */ });
  }

  function addAttempts(items: Attempt[]) {
    update(before => {
      const ids = new Set(before.attempts.map(attempt => attempt.id));
      return { ...before, attempts: [...before.attempts, ...items.filter(item => !ids.has(item.id))] };
    });
  }
  function addMini(result: MiniResult) {
    return update(before => before.miniResults.some(entry => entry.id === result.id) ? before
      : { ...before, miniResults: [...before.miniResults, result] });
  }
  function toggleFlag(id: string) {
    update(before => ({ ...before, flagged: before.flagged.includes(id) ? before.flagged.filter(item => item !== id) : [...before.flagged, id] }));
  }
  function recordClass(record: ClassRecord) {
    update(
      before => ({ ...before, classes: [...before.classes, record], pinned: record.complete && before.pinned === record.skill ? "" : before.pinned }),
      record.complete ? "Clase registrada como completa." : "Tiempo de clase guardado.",
    );
  }
  const lesson = id ? lessonById.get(id) : undefined;
  const active = page === "clase" || page === "mini" ? "temario" : page;
  const content = page === "" ? <Home state={state} today={today} dueCount={due.length}/>
    : page === "temario" ? <Curriculum state={state} filter={areaOrder.find(area => area === id)}/>
    : page === "clase" && lesson ? <Suspense fallback={<p>Cargando la lección…</p>}>
      <Workbook key={lesson.id + (target ?? "")} lesson={lesson} target={target} state={state} onAttempt={item => addAttempts([item])} onClass={recordClass}
        onFlag={toggleFlag} announce={announce} onPin={pinned => { update(before => ({ ...before, pinned }), pinned ? "Clase fijada en el inicio." : "Clase quitada del inicio."); }}/>
    </Suspense>
    : page === "mini" && lesson ? <Suspense fallback={<p>Cargando miniexamen…</p>}>
      <MiniExam key={lesson.id} lesson={lesson} results={state.miniResults} onFinish={addMini} />
    </Suspense>
    : page === "repaso" ? <Review due={due} state={state} onAttempt={item => addAttempts([item])} onFlag={toggleFlag}/>
    : page === "simulacro" ? <Exam state={state} onAttempts={addAttempts}/>
    : page === "progreso" ? <Suspense fallback={<p>Cargando el progreso…</p>}>
      <Progress state={state} today={today} onFlag={toggleFlag}/>
    </Suspense>
    : page === "plan" ? <Suspense fallback={<p>Cargando el plan…</p>}>
      <Planner state={state} today={today} onSettings={(settings, base) => update(before => ({
          ...before, settings: mergePlanSettings(settings, before.settings, base),
        }))}
        onImport={importBackup} mergeBackup={connected}
        sync={{ ...sync, importPrevious: location.origin === primaryOrigin ? importPrevious : undefined }} />
    </Suspense>
    : <><PageHeading title="No encontramos esa página" /><a href="#/">Volver a Clase de hoy</a></>;

  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Ir al contenido</a>
    <header className="sidebar">
      <a className="brand" href="#/" aria-label="Marie PIENSE II, inicio"><span className="brand-mark"><Icon name="book" size={22}/></span><span><strong>Marie</strong><small>PIENSE II</small></span></a>
      <nav aria-label="Navegación principal">
        {navigation.map(item => <a href={`#/${item.id}`} aria-current={active === item.id ? "page" : undefined} key={item.id}>
          <Icon name={item.icon} size={20}/><span>{item.label}</span>{item.id === "repaso" && due.length > 0 && <span className="nav-count">{due.length}</span>}
        </a>)}
      </nav>
      <div className="sidebar-note"><Icon name="calendar" size={17}/><span>{state.settings.weekdays.length} días por semana<br/><strong>{duration(state.settings.minutes)} por sesión</strong></span></div>
    </header>
    <main id="main-content" ref={main} tabIndex={-1} className="main-content">{content}</main>
    <div role="status" className={message ? "announcement" : "sr-only"} onClick={() => announce("")}>{message}{message && <button onClick={() => announce("")} aria-label="Cerrar aviso">×</button>}</div>
  </div>;
}
