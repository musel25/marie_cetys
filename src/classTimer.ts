import { studyDay } from "./study";
import type { ClassInterval, ClassRecord } from "./types";

const storageKey = "marie-cetys:class-timer:v1";
const minuteMs = 60_000;

export interface ClassTimer {
  id: string;
  skill: string;
  intervals: ClassInterval[];
  startedAt: number | null;
}

export function startClassTimer(id: string, skill: string, now: number): ClassTimer {
  return { id, skill, intervals: [], startedAt: now };
}

export function pauseClassTimer(timer: ClassTimer, now: number): ClassTimer {
  const start = timer.startedAt;
  if (start === null) return timer;
  const intervals = now > start ? [...timer.intervals, { start, end: now }] : timer.intervals;
  return { ...timer, intervals, startedAt: null };
}

export function resumeClassTimer(timer: ClassTimer, now: number): ClassTimer {
  if (timer.startedAt !== null) return timer;
  return { ...timer, startedAt: Math.max(now, timer.intervals.at(-1)?.end ?? 0) };
}

export function elapsedClassMs(timer: ClassTimer, now: number) {
  const completed = timer.intervals.reduce((total, { start, end }) => total + (end - start), 0);
  return completed + (timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt));
}

export function classTimerRecord(timer: ClassTimer, now: number, complete: boolean, minutesOverride?: number): ClassRecord | null {
  if (minutesOverride !== undefined && (!Number.isInteger(minutesOverride) || minutesOverride < 1 || minutesOverride > 180)) return null;
  const paused = pauseClassTimer(timer, now);
  const last = paused.intervals.at(-1);
  if (!last) return null;
  const at = Math.max(now, last.end);
  const elapsed = elapsedClassMs(paused, at);
  const minutes = minutesOverride ?? Math.max(1, Math.round(elapsed / minuteMs));
  return { id: timer.id, skill: timer.skill, at, day: studyDay(new Date(at)), minutes, complete, intervals: paused.intervals };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000;
}

function validInterval(value: unknown): value is ClassInterval {
  return object(value) && validTimestamp(value.start) && validTimestamp(value.end) && value.start < value.end;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 100;
}

function validTimer(value: unknown): value is ClassTimer {
  if (!object(value) || !validIdentifier(value.id) || !validIdentifier(value.skill)) return false;
  const { intervals, startedAt } = value;
  return Array.isArray(intervals) && intervals.every(validInterval) &&
    intervals.every((interval, index) => index === 0 || interval.start >= intervals[index - 1].end) &&
    (startedAt === null || (validTimestamp(startedAt) && startedAt >= (intervals.at(-1)?.end ?? 0)));
}

export function readClassTimer(storage: Pick<Storage, "getItem">): ClassTimer | null {
  const raw = storage.getItem(storageKey);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return validTimer(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeClassTimer(storage: Pick<Storage, "setItem" | "removeItem">, timer: ClassTimer | null) {
  if (timer === null) storage.removeItem(storageKey);
  else storage.setItem(storageKey, JSON.stringify(timer));
}
