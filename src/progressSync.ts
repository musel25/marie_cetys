import { parseBackup } from "./study";
import type { Settings, StudyState } from "./types";

export type ProgressBaseline = Pick<StudyState, "settings" | "pinned" | "flagged">;

export function progressBaseline(state: StudyState): ProgressBaseline {
  return { settings: state.settings, pinned: state.pinned, flagged: state.flagged };
}

export function sameProgress(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function mergeMembership<T>(local: T[], remote: T[], base: T[]) {
  const merged = new Set(remote);
  const remaining = new Set(local);
  const previous = new Set(base);
  for (const item of previous) if (!remaining.has(item)) merged.delete(item);
  for (const item of remaining) if (!previous.has(item)) merged.add(item);
  return [...merged];
}

function dateOverrides(settings: Settings) {
  return new Map([...Object.entries(settings.minutesByDate), ...settings.exceptions.map(day => [day, 0] as const)]);
}

export function mergePlanSettings(local: Settings, remote: Settings, base: Settings) {
  if (sameProgress(local, base)) return remote;
  if (sameProgress(remote, base)) return local;

  const weekdays = mergeMembership(local.weekdays, remote.weekdays, base.weekdays).sort((left, right) => left - right);
  const previous = dateOverrides(base);
  const chosen = dateOverrides(local);
  const merged = dateOverrides(remote);
  for (const day of new Set([...previous.keys(), ...chosen.keys()])) {
    const minutes = chosen.get(day);
    if (minutes === previous.get(day)) continue;
    if (minutes === undefined) merged.delete(day);
    else merged.set(day, minutes);
  }

  const overrides = [...merged].sort(([left], [right]) => left.localeCompare(right));
  const exceptions = overrides.filter(([, minutes]) => minutes === 0).map(([day]) => day);
  const datePlan = exceptions.length <= 365
    ? { exceptions, minutesByDate: Object.fromEntries(overrides.filter(([, minutes]) => minutes > 0)) }
    : { exceptions: local.exceptions, minutesByDate: local.minutesByDate };
  const dates = local.start !== base.start || local.exam !== base.exam ? local : remote;
  return {
    start: dates.start, exam: dates.exam,
    minutes: local.minutes !== base.minutes ? local.minutes : remote.minutes,
    weekdays: weekdays.length ? weekdays : local.weekdays,
    ...datePlan,
  };
}

export function mergeProgress(local: StudyState, remote: StudyState, base?: ProgressBaseline): StudyState {
  const seen = new Set([...remote.attempts, ...remote.classes, ...remote.miniResults].map(item => item.id));
  function combine<T extends { id: string; at: number }>(localRecords: T[], remoteRecords: T[]) {
    const merged = [...remoteRecords];
    for (const item of localRecords) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged.sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
  }

  return {
    version: 1,
    settings: base ? mergePlanSettings(local.settings, remote.settings, base.settings) : remote.settings,
    pinned: base && local.pinned !== base.pinned ? local.pinned : remote.pinned,
    attempts: combine(local.attempts, remote.attempts),
    classes: combine(local.classes, remote.classes),
    miniResults: combine(local.miniResults, remote.miniResults),
    flagged: mergeMembership(local.flagged, remote.flagged, base?.flagged ?? []).sort(),
  };
}

export function mergeImportedProgress(current: StudyState, imported: StudyState): StudyState {
  return mergeProgress(current, imported);
}

type RemoteProgress = { revision: number; state: StudyState | null };

function progressUrl() {
  return new URL("./api/progress", location.href).href;
}

async function remoteProgress(response: Response): Promise<RemoteProgress> {
  if (!response.ok) throw Error("No se pudo consultar el progreso de la VPS.");
  const value = await response.json();
  if (!Number.isSafeInteger(value?.revision) || value.revision < 0 || (value.state === null) !== (value.revision === 0)) {
    throw Error("La VPS devolvió un progreso inválido.");
  }
  return { revision: value.revision, state: value.state === null ? null : parseBackup(JSON.stringify(value.state)) };
}

export async function getProgress(): Promise<RemoteProgress | undefined> {
  const response = await fetch(progressUrl(), { cache: "no-store", signal: AbortSignal.timeout(10000) });
  return response.status === 401 ? undefined : remoteProgress(response);
}

export async function setProgress(revision: number, state: StudyState): Promise<RemoteProgress | "conflict" | "disconnected"> {
  const response = await fetch(progressUrl(), {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision, state }), signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401) return "disconnected";
  if (response.status === 409) return "conflict";
  return remoteProgress(response);
}

export async function startProgressSession(username: string, password: string) {
  const response = await fetch(progressUrl() + "/session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("No se pudo iniciar sesión.");
}

export async function changeProgressPassword(currentPassword: string, password: string) {
  const response = await fetch(progressUrl() + "/session", {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, password }), signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error("No se pudo guardar la contraseña.");
}

export async function endProgressSession() {
  const response = await fetch(progressUrl() + "/session", { method: "DELETE", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error("No se pudo cerrar la sesión.");
}
