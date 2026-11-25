import { useId, useRef, useState, type FormEvent } from "react";

type SyncPanelProps = {
  status: "checking" | "disconnected" | "syncing" | "synced" | "offline";
  lastSynced: number | null;
  connect: (key: string) => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  importPrevious?: () => Promise<void>;
};

const statusText: Record<SyncPanelProps["status"], string> = {
  checking: "Comprobando la conexión.",
  disconnected: "Este dispositivo está desconectado.",
  syncing: "Sincronizando tu progreso.",
  synced: "Este dispositivo está sincronizado.",
  offline: "No se pudo sincronizar. Puedes seguir estudiando. Tu progreso se guarda en este dispositivo.",
};

const localTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export default function SyncPanel({ status, lastSynced, connect, disconnect, syncNow, importPrevious }: SyncPanelProps) {
  const id = useId();
  const keyField = useRef<HTMLInputElement>(null);
  const [invalidKey, setInvalidKey] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const connected = status === "syncing" || status === "synced" || status === "offline";
  const busy = pending || status === "syncing";

  async function act(action: () => Promise<void>, failure: string, success = "") {
    setPending(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch {
      setMessage(failure);
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const field = keyField.current;
    if (!field || busy || !field.validity.valid) return;
    const key = field.value;
    field.value = "";
    setInvalidKey(false);
    void act(() => connect(key), "No se pudo conectar. Revisa la clave y tu conexión a internet.");
  }

  return <section className="panel sync-panel" aria-labelledby={id + "-title"}>
    <h2 id={id + "-title"}>Sincronizar progreso</h2>
    <p>Usa la misma clave privada en cada dispositivo para compartir tu progreso.</p>
    <p role="status" className={status === "offline" ? "plan-notice" : "muted"}>{statusText[status]}</p>
    {connected && lastSynced !== null && <p className="muted">
      Última sincronización · <time dateTime={new Date(lastSynced).toISOString()}>{localTime.format(lastSynced)}</time>
    </p>}
    {status === "disconnected" && <form className="sync-form" method="post" onSubmit={submit}>
      <label htmlFor={id + "-key"}>Clave privada</label>
      <p id={id + "-hint"} className="muted">Pega tu clave de 64 caracteres. Guárdala en un lugar seguro.</p>
      <input ref={keyField} id={id + "-key"} type="password" autoComplete="off"
        autoCapitalize="none" spellCheck={false} required pattern="[0-9a-fA-F]{64}" disabled={busy}
        aria-invalid={invalidKey} aria-describedby={id + "-hint" + (invalidKey ? " " + id + "-error" : "")}
        onInvalid={() => setInvalidKey(true)}
        onInput={event => { if (event.currentTarget.validity.valid) setInvalidKey(false); }} />
      {invalidKey && <p id={id + "-error"} className="plan-notice">Escribe 64 caracteres del 0 al 9 o de la A a la F.</p>}
      <button type="submit" className="button primary" disabled={busy}>{pending ? "Conectando…" : "Conectar este dispositivo"}</button>
    </form>}
    {connected && <div className="row">
      <button type="button" className="button primary" disabled={busy}
        onClick={() => void act(syncNow, "No se pudo sincronizar. Revisa tu conexión a internet.")}>Sincronizar ahora</button>
      {importPrevious && <button type="button" className="button secondary" disabled={busy}
        onClick={() => void act(importPrevious, "No se pudo importar. Si tu navegador bloqueó la ventana, permítela y vuelve a intentar.", "Progreso anterior importado.")}>Importar de math.musel.dev</button>}
      <button type="button" className="button secondary" disabled={busy}
        onClick={() => void act(disconnect, "No se pudo desconectar este dispositivo. Intenta de nuevo.")}>Desconectar este dispositivo</button>
    </div>}
    <p role="status" className={message ? "notice" : "sr-only"}>{message}</p>
  </section>;
}
