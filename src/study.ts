import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import { acceptsMiniQuestionCount, expectedMiniFormCount, lessonById } from "./content";
import type { Attempt, ClassRecord, Difficulty, Lesson, MiniResult, Period, Question, Settings, StudyState } from "./types";

const dayMs = 86_400_000;
const storageKey = "marie-cetys:study:v1";
const engine = fsrs({ request_retention: 0.9, enable_fuzz: false, enable_short_term: false, maximum_interval: 365 });
const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Tijuana", year: "numeric", month: "2-digit", day: "2-digit",
});

export function studyDay(date = new Date()) {
  const parts = Object.fromEntries(calendar.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function noon(day: string) { return new Date(day + "T12:00:00.000Z"); }

export function addDays(day: string, count: number) {
  return new Date(noon(day).getTime() + count * dayMs).toISOString().slice(0, 10);
}

export function dayOfWeek(day: string) { return noon(day).getUTCDay(); }

export function periodStart(day: string, period: Period) {
  if (period === "day") return day;
  if (period === "month") return day.slice(0, 7) + "-01";
  return addDays(day, -((dayOfWeek(day) + 6) % 7));
}

export function dateLabel(day: string, kind: "short" | "long" = "short") {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: kind, day: "numeric", month: kind, timeZone: "UTC",
  }).format(noon(day));
}

export function blankState(day = studyDay()): StudyState {
  return {
    version: 1,
    settings: { start: day, exam: "", weekdays: [1, 2, 3, 4, 5], minutes: 60, exceptions: [] },
    pinned: "",
    attempts: [],
    classes: [],
    miniResults: [],
    flagged: [],
  };
}

function dateIsValid(value: unknown): value is string {
  return typeof value === "string" && /^20\d\d-\d\d-\d\d$/.test(value) &&
    Number.isFinite(noon(value).getTime()) && addDays(value, 0) === value;
}

function boundedInt(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

type RecordValue = Record<string, unknown>;
function object(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validString(value: unknown, length = 100): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= length;
}

function validSettings(settings: unknown): settings is Settings {
  return object(settings) && dateIsValid(settings.start) &&
    (settings.exam === "" || (dateIsValid(settings.exam) && settings.exam > settings.start)) &&
    Array.isArray(settings.weekdays) && settings.weekdays.length > 0 &&
    new Set(settings.weekdays).size === settings.weekdays.length &&
    settings.weekdays.every(day => boundedInt(day, 0, 6)) && boundedInt(settings.minutes, 15, 180) &&
    Array.isArray(settings.exceptions) && settings.exceptions.length <= 365 &&
    settings.exceptions.every(dateIsValid);
}

type StudyEvent = Pick<Attempt, "id" | "at" | "day" | "skill">;

function validEvent(value: unknown): value is RecordValue & StudyEvent {
  return object(value) && validString(value.id) && dateIsValid(value.day) && validString(value.skill) &&
    boundedInt(value.at, 0, Number.MAX_SAFE_INTEGER);
}

function validAttempt(value: unknown): value is Attempt {
  return validEvent(value) && validString(value.item) && typeof value.correct === "boolean" &&
    typeof value.help === "boolean" && boundedInt(value.seconds, 0, 10_800) &&
    ["practice", "review", "live", "exam"].some(mode => mode === value.mode) &&
    (value.selection === undefined || boundedInt(value.selection, -1, 3));
}

function validClass(value: unknown): value is ClassRecord {
  return validEvent(value) && typeof value.complete === "boolean" && boundedInt(value.minutes, 1, 180);
}

function validMiniResult(value: unknown): value is MiniResult {
  if (!validEvent(value)) return false;
  const lesson = lessonById.get(value.skill);
  return !!lesson && boundedInt(value.form, 0, expectedMiniFormCount(lesson) - 1) &&
    boundedInt(value.seconds, 1, Number.MAX_SAFE_INTEGER) &&
    Array.isArray(value.answers) && acceptsMiniQuestionCount(lesson, value.form, value.answers.length) &&
    boundedInt(value.correct, 0, value.answers.length) &&
    value.answers.every(answer => boundedInt(answer, 0, 3));
}

export function parseBackup(text: string): StudyState {
  if (text.length > 12_000_000) throw Error("El archivo es demasiado grande.");
  const value: unknown = JSON.parse(text);
  const miniResults = object(value) && value.miniResults !== undefined ? value.miniResults : [];
  if (!object(value) || value.version !== 1 || !validSettings(value.settings) ||
      (value.pinned !== "" && !validString(value.pinned)) ||
      !Array.isArray(value.attempts) || !value.attempts.every(validAttempt) ||
      !Array.isArray(value.classes) || !value.classes.every(validClass) ||
      !Array.isArray(miniResults) || !miniResults.every(validMiniResult) ||
      !Array.isArray(value.flagged) || !value.flagged.every(item => validString(item))) {
    throw Error("El archivo no tiene el formato de respaldo esperado.");
  }
  const ids = [...value.attempts, ...value.classes, ...miniResults].map(event => event.id);
  if (new Set(ids).size !== ids.length) throw Error("El archivo contiene registros duplicados.");
  return {
    version: 1, settings: value.settings, pinned: value.pinned, attempts: value.attempts,
    classes: value.classes, miniResults, flagged: value.flagged,
  };
}

export function loadState(): { state: StudyState; recovered: boolean; found: boolean } {
  try {
    const existing = localStorage.getItem(storageKey);
    return { state: existing ? parseBackup(existing) : blankState(), recovered: false, found: Boolean(existing) };
  } catch {
    return { state: blankState(), recovered: true, found: false };
  }
}

export function saveState(state: StudyState) {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

export function isStudyDay(day: string, settings: Settings) {
  return settings.weekdays.includes(dayOfWeek(day)) && !settings.exceptions.includes(day);
}

export function classPlan(lessons: Lesson[], state: StudyState, today = studyDay()) {
  const settings = state.settings;
  const start = today > settings.start ? today : settings.start;
  const completed = new Set(state.classes.filter(record => record.complete).map(record => record.skill));
  const remaining = lessons.filter(lesson => !completed.has(lesson.id)).map(lesson => {
    const done = state.classes.filter(record => record.skill === lesson.id).reduce((sum, record) => sum + record.minutes, 0);
    return { id: lesson.id, left: Math.max(10, 60 - done) };
  });
  const required = remaining.reduce((sum, lesson) => sum + lesson.left, 0);
  const dates: string[] = [];
  const stop = settings.exam || addDays(start, 1000);
  for (let day = start; day < stop; day = addDays(day, 1)) {
    if (isStudyDay(day, settings)) dates.push(day);
  }
  const loggedToday = dates[0] === today
    ? state.classes.filter(record => record.day === today).reduce((total, record) => total + record.minutes, 0)
    : 0;
  const available = settings.exam
    ? dates.length * settings.minutes - Math.min(settings.minutes, loggedToday)
    : required;
  const usingToday = dates.length ? Math.ceil((required + loggedToday) / dates.length) : required;
  const skippingToday = loggedToday && dates.length > 1 ? Math.ceil(required / (dates.length - 1)) : usingToday;
  const requiredPerDay = required ? Math.min(usingToday, skippingToday) : 0;
  const plannedPerDay = Math.max(settings.minutes, requiredPerDay);
  let lessonIndex = 0;
  const slots: { day: string; lessons: string[]; minutes: number }[] = [];
  for (const day of dates) {
    if (lessonIndex >= remaining.length) break;
    const capacity = plannedPerDay - (day === today ? loggedToday : 0);
    if (capacity <= 0) continue;
    const ids: string[] = [];
    let minutes = 0;
    while (lessonIndex < remaining.length && minutes < capacity) {
      const lesson = remaining[lessonIndex];
      const used = Math.min(lesson.left, capacity - minutes);
      ids.push(lesson.id);
      minutes += used;
      lesson.left -= used;
      if (!lesson.left) lessonIndex++;
    }
    slots.push({ day, lessons: ids, minutes });
  }
  return { slots, dates: dates.length, available, required, requiredPerDay, shortfall: Math.max(0, required - available) };
}

export function questions(lesson: Lesson): Question[] {
  return lesson.exercises.map((exercise, index) => ({
    ...exercise, id: lesson.id + ":" + index, skill: lesson.id,
  }));
}

const difficultyRank = { base: 0, exam: 1, challenge: 2 };

export function nextQuestion(lesson: Lesson, attempts: Attempt[], excluded = new Set<string>(), preferred: Difficulty = "challenge") {
  const lastUsed = new Map<string, number>();
  for (const attempt of attempts) lastUsed.set(attempt.item, Math.max(attempt.at, lastUsed.get(attempt.item) ?? 0));
  return questions(lesson).filter(question => !excluded.has(question.id)).sort((a, b) => {
    const recency = (lastUsed.get(a.id) ?? -1) - (lastUsed.get(b.id) ?? -1);
    const rank = difficultyRank[preferred];
    return recency || Math.abs(difficultyRank[a.difficulty] - rank) - Math.abs(difficultyRank[b.difficulty] - rank);
  })[0];
}

export function reviewQuestion(lesson: Lesson, attempts: Attempt[]) {
  const last = attempts.filter(item => item.skill === lesson.id && item.selection !== -1).at(-1);
  const difficulty = questions(lesson).find(item => item.id === last?.item)?.difficulty ?? "base";
  const preferred = last?.correct && !last.help && difficulty === "base" ? "exam" : difficulty;
  return nextQuestion(lesson, attempts, new Set(), preferred);
}

function compareEventTime(a: StudyEvent, b: StudyEvent) {
  return a.at - b.at || a.id.localeCompare(b.id);
}

export function miniHistory(results: MiniResult[], skill: string) {
  return results.filter(result => result.skill === skill).sort((a, b) => compareEventTime(b, a));
}

export function nextMiniForm(results: MiniResult[], skill: string, count: number) {
  const latest = miniHistory(results, skill)[0];
  return latest ? (latest.form + 1) % count : 0;
}

interface ReviewEvent {
  event: StudyEvent;
  priority: number;
  rating: Grade;
}

function miniRating(result: MiniResult): Grade {
  if (result.correct === result.answers.length) return Rating.Good;
  return result.correct / result.answers.length >= 0.8 ? Rating.Hard : Rating.Again;
}

export function reviewCards(attempts: Attempt[], miniResults: MiniResult[] = []) {
  const cards = new Map<string, { due: string; card: Card }>();
  const eventRatings = [
    ...miniResults.map<ReviewEvent>(result => ({
      event: result, priority: 0, rating: miniRating(result),
    })),
    ...attempts.filter(attempt => attempt.selection !== -1).map<ReviewEvent>(attempt => ({
      event: attempt, priority: 1, rating: !attempt.correct ? Rating.Again : attempt.help ? Rating.Hard : Rating.Good,
    })),
  ].sort((a, b) => a.event.day.localeCompare(b.event.day) || a.priority - b.priority || compareEventTime(a.event, b.event));
  for (const { event, rating } of eventRatings) {
    const previous = cards.get(event.skill);
    // The first mini-test, or the first question when there is no mini-test, sets the schedule for the day.
    if (previous?.card.last_review?.toISOString().slice(0, 10) === event.day) continue;
    const date = noon(event.day);
    const card = engine.next(previous?.card ?? createEmptyCard(date), date, rating).card;
    const days = rating === Rating.Again ? 1 : Math.max(rating === Rating.Hard ? 1 : 2, card.scheduled_days);
    const due = addDays(event.day, days);
    card.due = noon(due);
    card.scheduled_days = days;
    cards.set(event.skill, { due, card });
  }
  return cards;
}

function miniSecondsOutsideClasses(result: MiniResult, classes: ClassRecord[]) {
  const intervals = classes.filter(record => record.day === result.day && record.skill === result.skill)
    .map(record => ({ start: record.at - record.minutes * 60_000, end: record.at }))
    .sort((a, b) => a.start - b.start);
  let coveredUntil = result.at - result.seconds * 1000;
  let coveredMs = 0;
  for (const interval of intervals) {
    const start = Math.max(interval.start, coveredUntil);
    const end = Math.min(interval.end, result.at);
    if (end <= start) continue;
    coveredMs += end - start;
    coveredUntil = end;
  }
  return result.seconds - coveredMs / 1000;
}

export function summary(state: StudyState, first: string, last: string) {
  const items = state.attempts.filter(event => event.day >= first && event.day <= last);
  const attempts = items.filter(event => event.selection !== -1);
  const classes = state.classes.filter(event => event.day >= first && event.day <= last);
  const miniResults = state.miniResults.filter(event => event.day >= first && event.day <= last);
  const questionSeconds = items.reduce((sum, event) => sum + event.seconds, 0);
  const miniSeconds = miniResults.reduce((sum, result) => sum + miniSecondsOutsideClasses(result, classes), 0);
  return {
    attempts,
    classes,
    miniResults,
    correct: attempts.filter(event => event.correct).length,
    seconds: questionSeconds + miniSeconds,
    classMinutes: classes.reduce((sum, event) => sum + event.minutes, 0),
    complete: new Set(classes.filter(event => event.complete).map(event => event.skill)).size,
    activeDays: new Set([...items, ...miniResults, ...classes].map(event => event.day)).size,
  };
}
