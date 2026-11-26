import { useEffect, useState } from "react";
import { elapsedClassMs, type ClassTimer } from "./classTimer";
import { elapsedTime, Icon } from "./ui";

export default function ClassTimerPanel({ timer, lessonTitle, lessonLink, onToggle, onSave }: {
  timer: ClassTimer;
  lessonTitle: string;
  lessonLink?: string;
  onToggle: (at: number) => void;
  onSave: (complete: boolean, minutes?: number) => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now);
  const [complete, setComplete] = useState(true);
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const running = timer.startedAt !== null;
  const elapsed = elapsedClassMs(timer, now);
  const seconds = Math.floor(elapsed / 1000);

  useEffect(() => {
    if (!running) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [running]);

  function toggle() {
    const at = Date.now();
    setNow(at);
    onToggle(at);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(complete, minutes === "" ? undefined : Number(minutes));
    } finally {
      setSaving(false);
    }
  }

  return <section className="panel class-timer-panel" aria-labelledby="class-timer-title">
    <div className="section-title">
      <h2 id="class-timer-title" tabIndex={-1}>Clase en curso</h2>
      <span className="timer" role="timer" aria-label="Tiempo de clase">
        <Icon name="clock" size={17}/><time dateTime={`PT${seconds}S`}>{elapsedTime(seconds)}</time>
      </span>
    </div>
    <p>{lessonTitle}{!running && <> · En pausa</>}</p>
    <form onSubmit={event => void save(event)}>
      <fieldset className="log-class" disabled={saving}>
        <div className="row">
          <button className="button secondary" type="button" onClick={toggle}>{running ? "Pausar" : "Reanudar"}</button>
          <button className="button primary" disabled={elapsed === 0}>Guardar clase</button>
          {lessonLink && <a className="button quiet" href={lessonLink}>Ir a la lección</a>}
          <label className="check-label"><input type="checkbox" checked={complete} onChange={event => setComplete(event.target.checked)} /> Terminé esta clase</label>
        </div>
        <details className="class-time-details">
          <summary>Ajustar minutos</summary>
          <label>Minutos <input type="number" min="1" max="180" value={minutes}
            placeholder={String(Math.max(1, Math.round(elapsed / 60_000)))} onChange={event => setMinutes(event.target.value)}
            onInvalid={event => { const adjustment = event.currentTarget.closest("details"); if (adjustment) adjustment.open = true; }} /></label>
        </details>
      </fieldset>
    </form>
  </section>;
}
