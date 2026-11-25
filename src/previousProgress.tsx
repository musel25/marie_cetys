import { useState } from "react";
import { loadState, parseBackup } from "./study";
import type { StudyState } from "./types";

export const primaryOrigin = "https://piensa.musel.dev";
const previousOrigin = "https://math.musel.dev";
const transferMessage = "piensa:transfer-progress";

export function isPreviousProgressPage() {
  return location.origin === previousOrigin && location.pathname === "/piensa/" && location.hash === "#/transferir";
}

export function requestPreviousProgress(): Promise<StudyState> {
  if (location.origin !== primaryOrigin) return Promise.reject(Error("Abre la dirección principal."));
  const popup = window.open(previousOrigin + "/piensa/#/transferir", "_blank", "popup,width=620,height=600");
  if (!popup) return Promise.reject(Error("El navegador bloqueó la ventana de importación."));
  return new Promise((resolve, reject) => {
    function clean() {
      window.removeEventListener("message", receive);
      window.clearInterval(closed);
      window.clearTimeout(timeout);
    }
    function receive(event: MessageEvent) {
      if (event.origin !== previousOrigin || event.source !== popup ||
          event.data?.type !== transferMessage || typeof event.data.backup !== "string") return;
      clean();
      popup?.close();
      try { resolve(parseBackup(event.data.backup)); }
      catch { reject(Error("No se pudo leer el progreso anterior.")); }
    }
    const closed = window.setInterval(() => {
      if (popup.closed) {
        clean();
        reject(Error("Se cerró la ventana de importación."));
      }
    }, 500);
    const timeout = window.setTimeout(() => {
      clean();
      popup.close();
      reject(Error("Se agotó el tiempo de importación."));
    }, 300000);
    window.addEventListener("message", receive);
  });
}

export function PreviousProgressPage() {
  const [saved] = useState(loadState);
  if (!window.opener) return <section className="panel">
    <h1>Importar progreso anterior</h1>
    <p>Inicia la importación en Plan, en la dirección principal.</p>
    <a className="button primary" href={primaryOrigin + "/#/plan"}>Abrir el Plan</a>
  </section>;
  return <section className="panel">
    <h1>Importar progreso anterior</h1>
    {saved.found ? <>
      <p>Vas a enviar el progreso de este navegador a piensa.musel.dev. Las respuestas, clases, miniexámenes y dudas se combinan. También se usa el plan anterior.</p>
      <p>{saved.state.attempts.length} respuestas · {saved.state.classes.length} clases · {saved.state.miniResults.length} miniexámenes</p>
      <button className="button primary" type="button" onClick={() => {
        window.opener?.postMessage({ type: transferMessage, backup: JSON.stringify(saved.state) }, primaryOrigin);
      }}>Enviar a piensa.musel.dev</button>
    </> : <p>En este navegador no hay progreso guardado en la dirección anterior.</p>}
    <button className="button quiet" type="button" onClick={() => window.close()}>Cancelar</button>
  </section>;
}
