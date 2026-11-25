import { useId, useState, type FormEvent } from "react";
import type { SyncStatus } from "./useProgressSync";

type SyncPanelProps = {
  status: SyncStatus;
  lastSynced: number | null;
  connect: (username: string, password: string) => Promise<void>;
  changePassword: (currentPassword: string, password: string) => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<void>;
  importPrevious?: () => Promise<void>;
  accountPage?: boolean;
};

const statusText: Record<SyncStatus, string> = {
  checking: "Comprobando la sesión.",
  disconnected: "Inicia sesión para sincronizar tu progreso.",
  syncing: "Sincronizando tu progreso.",
  synced: "Este dispositivo está sincronizado.",
  offline: "No se pudo sincronizar. Puedes seguir estudiando. Tu progreso se guarda en este dispositivo.",
};

const localTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export default function SyncPanel({
  status, lastSynced, connect, changePassword, disconnect, syncNow, importPrevious, accountPage = false,
}: SyncPanelProps) {
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
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

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    void act(async () => {
      await connect(String(data.get("username")).trim(), String(data.get("password")));
      form.reset();
      setShowPassword(false);
    }, "No se pudo iniciar sesión. Revisa el usuario, la contraseña y tu conexión.");
  }

  function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    void act(async () => {
      await changePassword(String(data.get("currentPassword")), String(data.get("newPassword")));
      form.reset();
    }, "No se pudo guardar la contraseña. Revisa la contraseña actual y vuelve a intentar.", "Contraseña guardada.");
  }

  return <section className="panel sync-panel" aria-labelledby={id + "-title"}>
    <h2 id={id + "-title"}>Sincronizar progreso</h2>
    <p role="status" className={status === "offline" ? "plan-notice" : "muted"}>{statusText[status]}</p>
    {connected && lastSynced !== null && <p className="muted">
      Última sincronización · <time dateTime={new Date(lastSynced).toISOString()}>{localTime.format(lastSynced)}</time>
    </p>}
    {status === "disconnected" && (accountPage ? <form className="sync-form" method="post" onSubmit={signIn}>
      <label htmlFor="study-username">Usuario</label>
      <input id="study-username" name="username" autoComplete="username" autoCorrect="off"
        autoCapitalize="none" spellCheck={false} defaultValue="marie" maxLength={64} enterKeyHint="next" required />
      <label htmlFor="study-password">Contraseña</label>
      <input id="study-password" name="password" type={showPassword ? "text" : "password"}
        autoComplete="current-password" maxLength={256} enterKeyHint="done" required aria-describedby="study-signin-hint" />
      <p id="study-signin-hint" className="muted">La primera vez, usa tu clave de activación como contraseña.</p>
      <div className="row">
        <button type="submit" className="button primary" disabled={busy}>{pending ? "Iniciando sesión…" : "Iniciar sesión"}</button>
        <button type="button" className="button quiet" aria-controls="study-password" onClick={() => setShowPassword(show => !show)}>
          {showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
        </button>
      </div>
    </form> : <a className="button primary" href="#/sesion">Abrir inicio de sesión</a>)}
    {connected && <>
      <div className="row">
        {accountPage
          ? <a className="button primary" href="#/progreso">Ver progreso</a>
          : <a className="button secondary" href="#/sesion">Administrar sesión</a>}
        <button type="button" className="button secondary" disabled={busy}
          onClick={() => void act(syncNow, "No se pudo sincronizar. Revisa tu conexión a internet.")}>Sincronizar ahora</button>
        {importPrevious && <button type="button" className="button secondary" disabled={busy}
          onClick={() => void act(importPrevious, "No se pudo importar. Si tu navegador bloqueó la ventana, permítela y vuelve a intentar.", "Progreso anterior importado.")}>Importar de math.musel.dev</button>}
        <button type="button" className="button quiet" disabled={busy}
          onClick={() => void act(disconnect, "No se pudo cerrar la sesión. Intenta de nuevo.")}>Cerrar sesión</button>
      </div>
      {accountPage && <details className="sync-password-settings">
        <summary>Cambiar contraseña</summary>
        <form className="sync-form" method="post" onSubmit={savePassword}>
          <input type="hidden" name="username" autoComplete="username" value="marie" />
          <label htmlFor="study-current-password">Contraseña actual</label>
          <input id="study-current-password" type="password" name="currentPassword" autoComplete="current-password"
            maxLength={256} enterKeyHint="next" required aria-describedby="study-current-hint" />
          <p id="study-current-hint" className="muted">También puedes usar tu clave de activación.</p>
          <label htmlFor="study-new-password">Nueva contraseña</label>
          <input id="study-new-password" type="password" name="newPassword" autoComplete="new-password"
            minLength={12} maxLength={256} enterKeyHint="done" required aria-describedby="study-password-length" />
          <p id="study-password-length" className="muted">Usa al menos 12 caracteres.</p>
          <button type="submit" className="button primary" disabled={busy}>Guardar contraseña</button>
        </form>
      </details>}
    </>}
    <p role="status" className={message ? "notice" : "sr-only"}>{message}</p>
  </section>;
}
