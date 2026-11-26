import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { areas, areaOrder, byArea, curriculum, lessonById, miniQuestionCount, resourceLinks } from "./content";
import ClassTimerPanel from "./ClassTimerPanel";
import { classTimerRecord, pauseClassTimer, readClassTimer, resumeClassTimer, startClassTimer, writeClassTimer, type ClassTimer } from "./classTimer";
import { Exam } from "./Exam";
import { addDays, classPlan, dateLabel, loadState, longReviewLimit, longReviewQuestions, periodStart, reviewCards, reviewQuestion, saveState, studyDay, studyMinutes, summary } from "./study";
import type { Area, Attempt, ClassRecord, Lesson, MiniResult, Question, StudyState } from "./types";
import { AreaTag, duration, elapsedTime, Icon, lessonHref, miniHref, PageHeading, type IconName } from "./ui";
import { OrderDiagram, QuestionCard } from "./QuestionCard";
import { mergeImportedProgress, mergePlanSettings, mergeProgress, sameProgress, type ProgressBaseline } from "./progressSync";
import { isPreviousProgressPage, PreviousProgressPage, primaryOrigin, requestPreviousProgress } from "./previousProgress";
import SyncPanel from "./SyncPanel";
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

function Home({ state, today, dueCount, hasStudied, onStartClass }: {
  state: StudyState; today: string; dueCount: number; hasStudied: boolean; onStartClass?: (skill: string) => void;
}) {
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
  return <>
    <div className="home-top"><PageHeading title="Clase de hoy" /><time dateTime={today}><Icon name="calendar" size={17}/>{dateLabel(today, "long")}</time></div>
    <div className="home-grid">
      <section className="hero">
        {lesson ? <>
          <div className="hero-copy">
            <AreaTag area={lesson.area} />
            <h2>{lesson.title}</h2>
            <p>{lesson.objective}</p>
            <div className="row">
              {onStartClass && <button className="button hero-button" onClick={() => onStartClass(lesson.id)}>Iniciar clase</button>}
              <a className={`button ${onStartClass ? "secondary" : "hero-button"}`} href={lessonHref(lesson.id)}>Abrir la clase</a>
            </div>
          </div>
          {lesson.id === "hc-orden" ? <OrderDiagram preview /> : <div className="hero-symbol"><Icon name="book" size={90}/></div>}
        </> : <div className="hero-copy"><h2>{completed.size >= curriculum.length ? "Temario completado" : "Estudia a tu ritmo"}</h2><p>Abre cualquier lección o ajusta tus fechas.</p><a className="button hero-button" href="#/temario">Ver temario</a></div>}
        {lesson && <div className="hero-footer">
          <span><Icon name="book" size={17}/> Práctica guiada</span>
          <span><Icon name="check" size={17}/> Miniexamen de {miniQuestionCount} preguntas</span>
          <span><Icon name="clock" size={17}/> {duration(state.pinned ? studyMinutes(today, state.settings) || state.settings.minutes : slot?.minutes ?? state.settings.minutes)}</span>
          {slot && slot.day > today && !state.pinned && <span>Próxima · {dateLabel(slot.day)}</span>}
        </div>}
      </section>
      <aside className="home-rail">
        <section className="panel review-preview">
          <div className="panel-icon"><Icon name="repeat"/></div>
          <h2>Repaso opcional</h2>
          <p>{dueCount ? `${dueCount} ${dueCount === 1 ? "tema disponible" : "temas disponibles"}`
            : hasStudied ? "Puedes hacer un repaso largo con los temas que ya estudiaste." : "Tus temas aparecerán aquí cuando toque practicarlos."}</p>
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
            <span className="topic-count">{miniQuestionCount} en el miniexamen</span>
          </a></li>
        ))}</ol>
      </section>,
    )}</div>
    <section className="panel source-panel"><h2>Material de apoyo</h2>
      <ul className="plain-list">{resourceLinks.map(resource => <li key={resource.url}><div><a href={resource.url} target="_blank" rel="noreferrer">{resource.title}</a><p>{resource.description}</p></div></li>)}</ul>
    </section>
  </>;
}

function dueReviewQuestions(due: Lesson[], attempts: Attempt[]) {
  return due.slice(0, 8).flatMap(lesson => {
    const question = reviewQuestion(lesson, attempts);
    return question ? [question] : [];
  });
}

function Review({ due, studied, state, classLesson, classRunning, onAttempt, onFlag }: {
  due: Lesson[]; studied: Lesson[]; state: StudyState; classLesson?: Lesson; classRunning: boolean;
  onAttempt: (item: Attempt) => void; onFlag: (id: string) => void;
}) {
  const [batch, setBatch] = useState<Question[]>(() => classLesson ? dueReviewQuestions(due, state.attempts) : []);
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const started = batch.length > 0;
  const question = batch[index];
  const lesson = question && lessonById.get(question.skill);
  const classHref = classLesson && lessonHref(classLesson.id);
  const minis = new Map([...state.miniResults].sort((a, b) => a.at - b.at).map(entry => [entry.skill, entry]));
  const available = curriculum.filter(item => minis.has(item.id) && !due.includes(item));

  function move(next: number) {
    setIndex(next);
    setAnswered(false);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function start(long: boolean) {
    const next = long
      ? longReviewQuestions([...due, ...studied.filter(item => !due.includes(item))], state.attempts)
      : dueReviewQuestions(due, state.attempts);
    setBatch(next);
    move(0);
  }

  function finish() {
    setBatch(batch.slice(0, index + 1));
    move(index + 1);
  }

  return <>
    <PageHeading title={classLesson ? "Repaso de inicio" : "Repaso opcional"} />
    {!started && classHref && <button className="button primary" onClick={() => { location.hash = classHref; }}>Continuar a la clase</button>}
    {!started && !classLesson && <section className="panel review-state">
      <div className="panel-icon"><Icon name="repeat" /></div>
      <h2>{due.length ? `${due.length} ${due.length === 1 ? "tema para repasar" : "temas para repasar"}` : "Estás al día"}</h2>
      {due.length > 0 && <p>El repaso diario usa una pregunta por tema pendiente, hasta ocho.</p>}
      <p>{studied.length ? `Una ronda larga usa hasta ${longReviewLimit} preguntas de los temas que ya estudiaste.` : "Practica un tema para empezar a repasarlo aquí."}</p>
      <div className="row">
        {due.length > 0 && <button className="button primary" onClick={() => start(false)}>Empezar repaso</button>}
        {studied.length > 0
          ? <button className={`button ${due.length ? "secondary" : "primary"}`} onClick={() => start(true)}>Empezar repaso largo</button>
          : <a className="button secondary" href="#/temario">Ver temario</a>}
      </div>
    </section>}
    {started && lesson && question && <section className="worksheet review-work">
      <div className="section-title"><AreaTag area={lesson.area}/><span>{index + 1} de {batch.length}</span></div>
      <h2 ref={heading} tabIndex={-1}>{lesson.title}</h2>
      <QuestionCard key={question.id} question={question} mode="review" area={lesson.area} timeInClass={classRunning}
        flagged={state.flagged.includes(question.id)} onFlag={() => onFlag(question.id)} onAttempt={item => { onAttempt(item); setAnswered(true); }} />
      <div className="row review-actions">
        {classHref ? <>
          {answered && index === batch.length - 1
            ? <button className="button primary" onClick={() => { location.hash = classHref; }}>Continuar a la clase</button>
            : <>
              {answered && <button className="button primary" onClick={() => move(index + 1)}>Siguiente pregunta</button>}
              <a className="button quiet" href={classHref}>Pasar a la clase</a>
            </>}
        </> : <>
          <a className="button secondary" href={lessonHref(lesson.id)}>Abrir explicación</a>
          <a className="button secondary" href={miniHref(lesson.id)}>Hacer miniexamen</a>
          {answered && (index === batch.length - 1
          ? <button className="button primary" onClick={finish}>Terminar repaso</button>
          : <>
            <button className="button primary" onClick={() => move(index + 1)}>Siguiente pregunta</button>
            <button className="button quiet" onClick={finish}>Terminar ahora</button>
          </>)}
        </>}
      </div>
    </section>}
    {started && !question && <section className="panel review-state">
      <h2 ref={heading} tabIndex={-1}>Ronda terminada</h2>
      <p>Respondiste {batch.length} {batch.length === 1 ? "pregunta" : "preguntas"}.</p>
      <div className="row">
        {due.length > 0 && <button className="button primary" onClick={() => start(false)}>Repasar más temas</button>}
        {studied.length > 0 && <button className={`button ${due.length ? "secondary" : "primary"}`} onClick={() => start(true)}>Otra ronda larga</button>}
        <a className="button secondary" href="#/progreso">Ver progreso</a>
      </div>
    </section>}
    {!started && !classLesson && due.length > 0 && <section className="panel due-topics">
      <h2>Temas disponibles</h2>
      <ul className="plain-list">{due.map(item => <li key={item.id}>
        <a href={lessonHref(item.id)}>{item.title}</a>
        <a href={miniHref(item.id)} aria-label={`Miniexamen de ${item.title}`}>Miniexamen</a>
      </li>)}</ul>
    </section>}
    {!started && !classLesson && available.length > 0 && <section className="panel due-topics">
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
  const [classTimer, setClassTimer] = useState(() => {
    try {
      const timer = readClassTimer(sessionStorage);
      return timer && lessonById.has(timer.skill) && !initial.state.classes.some(record => record.id === timer.id) ? timer : null;
    } catch { return null; }
  });
  const savingClass = useRef(false);
  const main = useRef<HTMLElement>(null);
  const [page = "", id, target] = route;
  const cards = useMemo(() => reviewCards(state.attempts, state.miniResults), [state.attempts, state.miniResults]);
  const due = useMemo(() => curriculum.filter(item => (cards.get(item.id)?.due ?? "9999") <= today)
    .sort((a, b) => (cards.get(a.id)?.due ?? "").localeCompare(cards.get(b.id)?.due ?? "")), [cards, today]);
  const studied = useMemo(() => {
    const completed = new Set(state.classes.filter(record => record.complete).map(record => record.skill));
    return curriculum.filter(item => cards.has(item.id) || completed.has(item.id));
  }, [cards, state.classes]);

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
    return update(
      before => before.classes.some(entry => entry.id === record.id) ? before
        : { ...before, classes: [...before.classes, record], pinned: record.complete && before.pinned === record.skill ? "" : before.pinned },
      (record.complete ? "Clase completa. " : "") + `Guardaste ${duration(record.minutes)} de clase.`,
    );
  }

  function updateClassTimer(timer: ClassTimer | null) {
    setClassTimer(timer);
    try { writeClassTimer(sessionStorage, timer); } catch { /* keep the timer in memory */ }
  }

  function startClass(skill: string) {
    if (classTimer) return;
    updateClassTimer(startClassTimer(crypto.randomUUID(), skill, Date.now()));
    if (due.length) location.hash = "/repaso/clase";
    else if (page !== "clase" || id !== skill) location.hash = lessonHref(skill);
    else requestAnimationFrame(() => document.getElementById("class-timer-title")?.focus());
  }

  async function saveTimedClass(complete: boolean, minutes?: number) {
    if (!classTimer || savingClass.current) return;
    const at = Date.now();
    const paused = pauseClassTimer(classTimer, at);
    const record = classTimerRecord(paused, at, complete, minutes);
    if (!record) return;
    savingClass.current = true;
    updateClassTimer(paused);
    try {
      if (!await recordClass(record)) return;
      updateClassTimer(null);
      if (page === "repaso" && id === "clase") location.hash = lessonHref(record.skill);
      else requestAnimationFrame(() => main.current?.focus({ preventScroll: true }));
    } finally { savingClass.current = false; }
  }

  const syncPanel = { ...sync, importPrevious: location.origin === primaryOrigin ? importPrevious : undefined };
  const lesson = id ? lessonById.get(id) : undefined;
  const timedLesson = classTimer ? lessonById.get(classTimer.skill) : undefined;
  const classRunning = !!classTimer && classTimer.startedAt !== null;
  const reviewLesson = page === "repaso" && id === "clase" ? timedLesson : undefined;
  const active = page === "clase" || page === "mini" ? "temario" : page;
  const content = page === "" ? <Home state={state} today={today} dueCount={due.length} hasStudied={studied.length > 0}
    onStartClass={classTimer ? undefined : startClass} />
    : page === "temario" ? <Curriculum state={state} filter={areaOrder.find(area => area === id)}/>
    : page === "clase" && lesson ? <Suspense fallback={<p>Cargando la lección…</p>}>
      <Workbook key={lesson.id + (target ?? "")} lesson={lesson} target={target} state={state} onAttempt={item => addAttempts([item])} onClass={recordClass}
        classRunning={classRunning} onStartClass={classTimer ? undefined : () => startClass(lesson.id)}
        onFlag={toggleFlag} announce={announce} onPin={pinned => { update(before => ({ ...before, pinned }), pinned ? "Clase fijada en el inicio." : "Clase quitada del inicio."); }}/>
    </Suspense>
    : page === "mini" && lesson ? <Suspense fallback={<p>Cargando miniexamen…</p>}>
      <MiniExam key={lesson.id} lesson={lesson} results={state.miniResults} onFinish={addMini} />
    </Suspense>
    : page === "repaso" ? <Review key={reviewLesson?.id ?? "repaso"} due={due} studied={studied} state={state} classLesson={reviewLesson} classRunning={classRunning}
      onAttempt={item => addAttempts([item])} onFlag={toggleFlag}/>
    : page === "simulacro" ? <Exam state={state} onAttempts={addAttempts}/>
    : page === "progreso" ? <Suspense fallback={<p>Cargando el progreso…</p>}>
      <Progress state={state} today={today} onFlag={toggleFlag}/>
    </Suspense>
    : page === "sesion" ? <>
      <PageHeading title={connected ? "Mi sesión" : "Iniciar sesión"} />
      <SyncPanel {...syncPanel} accountPage />
    </>
    : page === "plan" ? <Suspense fallback={<p>Cargando el plan…</p>}>
      <Planner state={state} today={today} onSettings={(settings, base) => update(before => ({
          ...before, settings: mergePlanSettings(settings, before.settings, base),
        }))}
        onImport={importBackup} mergeBackup={connected}
        sync={syncPanel} />
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
        {connected && <a href="#/sesion" aria-current={page === "sesion" ? "page" : undefined}>
          <Icon name="user" size={20}/><span>Mi sesión</span>
        </a>}
      </nav>
      <div className="sidebar-note"><Icon name="calendar" size={17}/><span>{state.settings.weekdays.length} días por semana<br/><strong>{duration(state.settings.minutes)} por sesión</strong></span></div>
    </header>
    <main id="main-content" ref={main} tabIndex={-1} className="main-content">
      {page !== "sesion" && sync.status === "disconnected" && <aside className="panel sign-in-prompt" aria-label="Acceso al progreso">
        <p>Inicia sesión para ver tu avance y seguir estudiando desde cualquier dispositivo.</p>
        <a className="button primary" href="#/sesion">Iniciar sesión</a>
      </aside>}
      {classTimer && timedLesson && <ClassTimerPanel key={classTimer.id} timer={classTimer} lessonTitle={timedLesson.title}
        lessonLink={reviewLesson || (page === "clase" && lesson?.id === timedLesson.id) ? undefined : lessonHref(timedLesson.id)}
        onToggle={at => updateClassTimer(classRunning ? pauseClassTimer(classTimer, at) : resumeClassTimer(classTimer, at))}
        onSave={saveTimedClass} />}
      {content}
    </main>
    <div role="status" className={message ? "announcement" : "sr-only"} onClick={() => announce("")}>{message}{message && <button onClick={() => announce("")} aria-label="Cerrar aviso">×</button>}</div>
  </div>;
}
