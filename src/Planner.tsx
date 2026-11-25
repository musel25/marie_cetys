import { useEffect, useRef, useState } from "react";
import SyncPanel from "./SyncPanel";
import { mergePlanSettings } from "./progressSync";
import { curriculum, lessonById } from "./content";
import { classPlan, dateLabel, parseBackup } from "./study";
import { duration, lessonHref, PageHeading } from "./ui";
import type { Settings, StudyState } from "./types";

const weekdays = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]] as const;

export default function Planner({ state, today, onSettings, onImport, mergeBackup, sync }: {
  state: StudyState; today: string; onSettings: (settings: Settings, base: Settings) => Promise<boolean>;
  onImport: (state: StudyState) => Promise<boolean>; mergeBackup: boolean; sync: React.ComponentProps<typeof SyncPanel>;
}) {
  const [draft, setDraft] = useState(state.settings);
  const lastSettings = useRef(state.settings);
  const [exception, setException] = useState("");
  const [studyDate, setStudyDate] = useState("");
  const [dateMinutes, setDateMinutes] = useState("");
  const [planMessage, setPlanMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState<StudyState>();
  const input = useRef<HTMLInputElement>(null);
  const planNotice = useRef<HTMLParagraphElement>(null);
  const forecast = classPlan(curriculum, state, today);
  const slots = more ? forecast.slots : forecast.slots.slice(0, 10);
  const scheduledMinutes = Number(dateMinutes);
  const canAddTime = studyDate >= "2000-01-01" && studyDate <= "2099-12-31" &&
    Number.isInteger(scheduledMinutes) && scheduledMinutes >= 15 && scheduledMinutes <= 180;

  useEffect(() => {
    const previous = lastSettings.current;
    lastSettings.current = state.settings;
    setDraft(current => mergePlanSettings(current, state.settings, previous));
  }, [state.settings]);

  useEffect(() => {
    if (planMessage) planNotice.current?.scrollIntoView({ block: "nearest" });
  }, [planMessage]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!draft.weekdays.length) throw Error("Elige al menos un día de estudio.");
      if (draft.exam && draft.exam <= draft.start) throw Error("El examen debe ser posterior al inicio.");
      parseBackup(JSON.stringify({ ...state, settings: draft }));
      const saved = await onSettings(draft, lastSettings.current);
      setPlanMessage(saved ? "Plan guardado." : "");
    } catch (error) { setPlanMessage(error instanceof Error ? error.message : "Revisa las fechas del plan."); }
  }

  function withoutDateMinutes(day: string) {
    const adjusted = { ...draft.minutesByDate };
    delete adjusted[day];
    return adjusted;
  }

  function addDateMinutes() {
    setDraft({
      ...draft,
      minutesByDate: { ...draft.minutesByDate, [studyDate]: scheduledMinutes },
      exceptions: draft.exceptions.filter(day => day !== studyDate),
    });
    setStudyDate("");
    setDateMinutes("");
    setPlanMessage("");
  }

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `piensa-ii-progreso-${today}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function readFile(file?: File) {
    if (!file) return;
    setPending(undefined);
    try {
      if (file.size > 12_000_000) throw Error("El archivo es demasiado grande.");
      const parsed = parseBackup(await file.text());
      setPending(parsed);
      setBackupMessage("Respaldo listo para cargar.");
    } catch { setBackupMessage("No se pudo leer un respaldo válido. Tu progreso sigue guardado."); }
    if (input.current) input.current.value = "";
  }

  return <>
    <PageHeading title="Plan de estudio" description="Elige tus días y cuánto tiempo tienes. Si ya sabes la fecha del examen, agrégala." />
    <div className="planner-grid">
      <form className="panel plan-form" onSubmit={save}>
        <h2>Horario</h2>
        <fieldset>
          <legend>Días de estudio</legend>
          <div className="weekday-select">{weekdays.map(([number, label]) =>
            <label className="weekday" key={number}>
              <input type="checkbox" checked={draft.weekdays.includes(number)} onChange={event => setDraft({
                ...draft, weekdays: event.target.checked ? [...draft.weekdays, number] : draft.weekdays.filter(day => day !== number),
              })} />
              <span>{label}</span>
            </label>,
          )}</div>
        </fieldset>
        <div className="field-grid">
          <label>Minutos al día<input required type="number" min="15" max="180" value={draft.minutes || ""} onChange={event => setDraft({ ...draft, minutes: Number(event.target.value) })} /></label>
          <label>Empieza el<input required type="date" min="2000-01-01" max="2099-12-31" value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
          <label>Fecha del examen <span className="muted">(opcional)</span><input type="date" min="2000-01-01" max="2099-12-31" value={draft.exam} onChange={event => setDraft({ ...draft, exam: event.target.value })} /></label>
        </div>
        <div className="exception-row">
          <label>Día libre <input type="date" min="2000-01-01" max="2099-12-31" value={exception} onChange={event => setException(event.target.value)} /></label>
          <button type="button" className="button secondary" disabled={!exception || draft.exceptions.includes(exception)} onClick={() => {
            setDraft({
              ...draft,
              exceptions: [...draft.exceptions, exception].sort(),
              minutesByDate: withoutDateMinutes(exception),
            });
            setException("");
          }}>Añadir día libre</button>
        </div>
        {draft.exceptions.length > 0 && <ul className="plain-list">{draft.exceptions.map(day =>
          <li key={day}><span>{dateLabel(day, "long")}</span><button type="button" className="button quiet" onClick={() => setDraft({ ...draft, exceptions: draft.exceptions.filter(entry => entry !== day) })}>Quitar</button></li>,
        )}</ul>}
        <fieldset className="date-minutes">
          <legend>Tiempo por fecha</legend>
          <div className="field-grid">
            <label>Fecha de estudio
              <input name="study-date" type="date" min="2000-01-01" max="2099-12-31" value={studyDate}
                onChange={event => setStudyDate(event.target.value)} />
            </label>
            <label>Minutos para esa fecha
              <input name="date-minutes" type="number" min="15" max="180" inputMode="numeric" value={dateMinutes}
                onChange={event => setDateMinutes(event.target.value)} />
            </label>
          </div>
          <button type="button" className="button secondary" disabled={!canAddTime} onClick={addDateMinutes}>
            {draft.minutesByDate[studyDate] === undefined ? "Añadir tiempo" : "Actualizar tiempo"}
          </button>
          {Object.keys(draft.minutesByDate).length > 0 && <ul className="plain-list">
            {Object.entries(draft.minutesByDate).sort(([first], [second]) => first.localeCompare(second)).map(([day, minutes]) =>
              <li key={day}>
                <span><time dateTime={day}>{dateLabel(day, "long")}</time> · {minutes} min</span>
                <button type="button" className="button quiet" aria-label={`Quitar tiempo del ${dateLabel(day, "long")}`}
                  onClick={() => {
                    setDraft({ ...draft, minutesByDate: withoutDateMinutes(day) });
                    setPlanMessage("");
                  }}>Quitar</button>
              </li>,
            )}
          </ul>}
        </fieldset>
        <p ref={planNotice} role="status" className={planMessage ? "notice" : "sr-only"}>{planMessage}</p>
        <button className="button primary">Guardar plan</button>
      </form>
      <section className="panel">
        <h2>Próximas clases</h2>
        <p className="muted">{duration(state.settings.minutes)} al día · {state.settings.weekdays.length} días a la semana</p>
        {state.settings.exam && <p className={forecast.shortfall ? "plan-notice" : "muted"}>
          {forecast.required === 0 ? "Ya completaste todas las clases." : forecast.dates === 0
            ? "No quedan días de estudio antes del examen. Ajusta las fechas o los días disponibles."
            : forecast.shortfall
              ? `Faltan ${duration(forecast.shortfall)} con tu horario actual.` + (forecast.requiredPerDay
                ? ` La propuesta agrupa temas y requiere ${duration(forecast.requiredPerDay)} por día habitual.` : "")
              : `Hay ${duration(forecast.available)} disponibles para ${duration(forecast.required)} de clase pendiente.`}
        </p>}
        {slots.length ? <ol className="calendar-list">{slots.map(slot =>
          <li key={slot.day}>
            <span className="calendar-day">{dateLabel(slot.day, "long")}</span>
            <div>{slot.lessons.map(id => <a key={id} href={lessonHref(id)}>{lessonById.get(id)?.title}</a>)}</div>
            <span className="muted">{slot.minutes} min</span>
          </li>,
        )}</ol> : <p className="muted">El temario sigue disponible para practicar.</p>}
        {forecast.slots.length > 10 && <button className="button secondary" onClick={() => setMore(!more)}>{more ? "Mostrar menos" : "Ver el plan completo"}</button>}
      </section>
    </div>
    <SyncPanel {...sync} />
    <section className="panel backups">
      <h2>Respaldo de progreso</h2>
      <p>Descarga una copia del progreso de este navegador para compartirla con tu tutor o cargarla en otro dispositivo.</p>
      <div className="row">
        <button className="button secondary" onClick={download}>Descargar respaldo</button>
        <button className="button secondary" onClick={() => input.current?.click()}>Elegir respaldo</button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={event => void readFile(event.target.files?.[0])} />
      </div>
      {pending && <div className="plan-notice">
        <p>El respaldo incluye {pending.attempts.length} {pending.attempts.length === 1 ? "respuesta" : "respuestas"}, {pending.miniResults.length} {pending.miniResults.length === 1 ? "miniexamen" : "miniexámenes"} y {pending.classes.length} {pending.classes.length === 1 ? "registro" : "registros"} de clase. {mergeBackup ? "Cargarlo combina el historial y usa el plan del respaldo." : "Cargarlo reemplaza el progreso de este navegador."}</p>
        <div className="row"><button className="button primary" onClick={async () => {
          const saved = await onImport(pending);
          setDraft(pending.settings); setPending(undefined); setBackupMessage(saved ? "Respaldo cargado." : "");
        }}>{mergeBackup ? "Cargar y combinar" : "Cargar y reemplazar"}</button><button className="button secondary" onClick={() => { setPending(undefined); setBackupMessage(""); }}>Cancelar</button></div>
      </div>}
      <p role="status" className={backupMessage ? "notice" : "sr-only"}>{backupMessage}</p>
    </section>
  </>;
}
