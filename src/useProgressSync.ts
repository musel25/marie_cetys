import { useCallback, useEffect, useRef, useState } from "react";
import {
  endProgressSession, getProgress, mergeProgress, progressBaseline, sameProgress, setProgress, startProgressSession,
  type ProgressBaseline,
} from "./progressSync";
import { blankState, parseBackup } from "./study";
import type { StudyState } from "./types";

export type SyncStatus = "checking" | "disconnected" | "syncing" | "synced" | "offline";
const baselineKey = "marie-cetys:sync-baseline";
const activeKey = "marie-cetys:sync-active";

function readLocal(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* the active tab can still synchronize from memory */ }
}

function readBaseline() {
  const saved = readLocal(baselineKey);
  if (!saved) return undefined;
  try {
    return progressBaseline(parseBackup(JSON.stringify({ ...blankState(), ...JSON.parse(saved) })));
  } catch { return undefined; }
}

export function useProgressSync({ change, snapshot, apply }: {
  change: number;
  snapshot: () => StudyState;
  apply: (saved: StudyState, captured: ProgressBaseline) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<SyncStatus>("checking");
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const enabled = useRef(readLocal(activeKey) === "1");
  const baseline = useRef<ProgressBaseline | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback((operation: () => Promise<void>) => {
    const run = queue.current.then(() => navigator.locks
      ? navigator.locks.request("marie-cetys:sync", operation)
      : operation());
    queue.current = run.catch(() => {});
    return run;
  }, []);

  const disconnectLocally = useCallback(() => {
    enabled.current = false;
    writeLocal(activeKey, null);
    setStatus("disconnected");
    setLastSynced(null);
  }, []);

  const synchronize = useCallback(async () => {
    if (enabled.current) setStatus("syncing");
    try {
      for (let tries = 0; tries < 4; tries++) {
        const remote = await getProgress();
        if (!remote) {
          disconnectLocally();
          return;
        }

        enabled.current = true;
        writeLocal(activeKey, "1");
        const local = snapshot();
        const candidate = remote.state
          ? mergeProgress(local, remote.state, readBaseline() ?? baseline.current)
          : local;
        const saved = remote.state && sameProgress(candidate, remote.state)
          ? remote : await setProgress(remote.revision, candidate);
        if (saved === "conflict") continue;
        if (saved === "disconnected") {
          disconnectLocally();
          return;
        }
        if (!saved.state) throw Error("La VPS no devolvió el progreso guardado.");
        await apply(saved.state, progressBaseline(local));
        baseline.current = progressBaseline(saved.state);
        writeLocal(baselineKey, JSON.stringify(baseline.current));
        setLastSynced(Date.now());
        setStatus("synced");
        return;
      }
      throw Error("El progreso cambió durante la sincronización.");
    } catch (error) {
      setStatus(enabled.current ? "offline" : "disconnected");
      throw error;
    }
  }, [apply, disconnectLocally, snapshot]);

  const syncNow = useCallback(() => enqueue(synchronize), [enqueue, synchronize]);
  const connect = useCallback((key: string) => enqueue(async () => {
    await startProgressSession(key);
    enabled.current = true;
    writeLocal(activeKey, "1");
    await synchronize();
    if (!enabled.current) throw Error("Este navegador no pudo iniciar la sesión.");
  }), [enqueue, synchronize]);

  const disconnect = useCallback(() => enqueue(async () => {
    await endProgressSession();
    disconnectLocally();
  }), [disconnectLocally, enqueue]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void syncNow().catch(() => {});
    };
    const interval = window.setInterval(() => {
      if (enabled.current) refresh();
    }, 15000);
    const online = () => { if (enabled.current) refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", online);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", online);
    };
  }, [syncNow]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (change === 0 || enabled.current) void syncNow().catch(() => {});
    }, change === 0 ? 0 : 450);
    return () => window.clearTimeout(timer);
  }, [change, syncNow]);

  return { status, lastSynced, connected: enabled.current, connect, disconnect, syncNow };
}
