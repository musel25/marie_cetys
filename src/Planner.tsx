import { useRef, useState } from "react";
import { curriculum, lessonById } from "./content";
import { classPlan, dateLabel, parseBackup } from "./study";
import { duration, lessonHref, PageHeading } from "./ui";
import type { Settings, StudyState } from "./types";

const weekdays = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]] as const;

export function Planner({ state, today, onSettings, onImport }: {
  state: StudyState; today: string; onSettings: (settings: Settings) => Promise<boolean>; onImport: (state: StudyState) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(state.settings);
  const [exception, setException] = useState("");
  const [message, setMessage] = useState("");
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState<StudyState>();
  const input = useRef<HTMLInputElement>(null);
  const forecast = classPlan(curriculum, state, today);
  const slots = more ? forecast.slots : forecast.slots.slice(0, 10);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (!draft.weekdays.length) throw Error("Elige al menos un día de estudio.");
      if (draft.exam && draft.exam <= draft.start) throw Error("El examen debe ser posterior al inicio.");
      parseBackup(JSON.stringify({ ...state, settings: draft }));
      const saved = await onSettings(draft);
      setMessage(saved ? "Plan guardado." : "");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Revisa las fechas del plan."); }
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
      setMessage("Respaldo listo para cargar.");
    } catch { setMessage("No se pudo leer un respaldo válido. Tu progreso sigue guardado."); }
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
            setDraft({ ...draft, exceptions: [...draft.exceptions, exception].sort() });
            setException("");
          }}>Añadir día libre</button>
        </div>
        {draft.exceptions.length > 0 && <ul className="plain-list">{draft.exceptions.map(day =>
          <li key={day}><span>{dateLabel(day, "long")}</span><button type="button" className="button quiet" onClick={() => setDraft({ ...draft, exceptions: draft.exceptions.filter(entry => entry !== day) })}>Quitar</button></li>,
        )}</ul>}
        <button className="button primary">Guardar plan</button>
      </form>
      <section className="panel">
        <h2>Próximas clases</h2>
        <p className="muted">{duration(state.settings.minutes)} al día · {state.settings.weekdays.length} días a la semana</p>
        {state.settings.exam && <p className={forecast.shortfall ? "plan-notice" : "muted"}>
          {forecast.required === 0 ? "Ya completaste todas las clases." : forecast.dates === 0
            ? "No quedan días de estudio antes del examen. Ajusta las fechas o los días disponibles."
            : forecast.shortfall
              ? `Faltan ${duration(forecast.shortfall)} con tu horario actual. La propuesta agrupa temas y requiere ${duration(forecast.requiredPerDay)} al día.`
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
    <section className="panel backups">
      <h2>Respaldo de progreso</h2>
      <p>El progreso se guarda en este navegador. Descarga una copia para compartirla con tu tutor o cargarla en otro dispositivo.</p>
      <div className="row">
        <button className="button secondary" onClick={download}>Descargar respaldo</button>
        <button className="button secondary" onClick={() => input.current?.click()}>Elegir respaldo</button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={event => void readFile(event.target.files?.[0])} />
      </div>
      {pending && <div className="plan-notice">
        <p>El respaldo incluye {pending.attempts.length} respuestas y {pending.classes.length} registros de clase. Cargarlo reemplaza el progreso de este navegador.</p>
        <div className="row"><button className="button primary" onClick={async () => {
          const saved = await onImport(pending);
          setDraft(pending.settings); setPending(undefined); setMessage(saved ? "Respaldo cargado." : "");
        }}>Cargar y reemplazar</button><button className="button secondary" onClick={() => { setPending(undefined); setMessage(""); }}>Cancelar</button></div>
      </div>}
    </section>
    <p role="status" className={message ? "notice" : "sr-only"}>{message}</p>
  </>;
}
