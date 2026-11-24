import assert from "node:assert/strict";
import { test } from "node:test";
import { blankState, classPlan, miniHistory, nextMiniForm, nextQuestion, parseBackup, periodStart, reviewCards, summary } from "../src/study";
import type { Attempt, Lesson, MiniResult } from "../src/types";
const lesson = (id: string): Lesson => ({
  id, area: "hc", title: id, objective: "goal", source: "source", explanation: ["step"],
  prerequisiteIds: [], example: { prompt: "p", steps: ["s"] },
  exercises: [
    { prompt: "open", options: ["a", "b", "c", "d"], answer: 1, explanation: "why", hint: "hint", difficulty: "base" },
    { prompt: "reserved", options: ["a", "b", "c", "d"], answer: 1, explanation: "why", hint: "hint", difficulty: "challenge" },
  ],
});

test("plan skips weekends and exceptions and measures a short deadline", () => {
  const state = blankState("2026-11-23");
  state.settings.exam = "2026-12-02";
  state.settings.exceptions = ["2026-11-27"];
  const curriculum = Array.from({ length: 8 }, (_, index) => lesson("hc-" + index));
  const plan = classPlan(curriculum, state, "2026-11-23");
  assert.equal(plan.available, 360);
  assert.equal(plan.requiredPerDay, 80);
  assert.equal(plan.slots.length, 6);
  assert.equal(plan.slots[4].day, "2026-11-30");
  assert.equal(new Set(plan.slots.flatMap(slot => slot.lessons)).size, 8);
});

test("incomplete short classes carry over, and finished classes stay done", () => {
  const state = blankState("2026-11-23");
  state.settings.minutes = 30;
  state.classes.push({ id: "one", day: "2026-11-23", skill: "hc-0", minutes: 60, complete: true, at: 1 });
  const plan = classPlan([lesson("hc-0"), lesson("hc-1")], state, "2026-11-24");
  assert.deepEqual(plan.slots.map(slot => slot.lessons), [["hc-1"], ["hc-1"]]);
});

test("logged class minutes use today's capacity before scheduling a new class", () => {
  const state = blankState("2026-11-23");
  state.classes.push({ id: "one", day: "2026-11-23", skill: "hc-0", minutes: 60, complete: true, at: 1 });
  const plan = classPlan([lesson("hc-0"), lesson("hc-1")], state, "2026-11-23");
  assert.deepEqual(plan.slots, [{ day: "2026-11-24", lessons: ["hc-1"], minutes: 60 }]);
});

test("a missed skill returns next day and the review prefers an unseen variant", () => {
  const attempt: Attempt = { id: "a", at: 1, day: "2026-11-27", skill: "hc-order", item: "hc-order:0", correct: false, help: false, seconds: 20, mode: "practice" };
  const cards = reviewCards([attempt]);
  assert.equal(cards.get("hc-order")?.due, "2026-11-28");
  assert.equal(nextQuestion(lesson("hc-order"), [attempt])?.id, "hc-order:1");
});

test("calendar periods use local Monday weeks and calendar months", () => {
  assert.equal(periodStart("2026-12-01", "week"), "2026-11-30");
  assert.equal(periodStart("2026-12-01", "month"), "2026-12-01");
});

test("exam time counts even when a question is skipped, without inventing an answer", () => {
  const day = "2026-11-23";
  const state = blankState(day);
  state.attempts.push({ id: "a", at: 1, day, skill: "hc-order", item: "hc-order:0", correct: false, help: false, seconds: 540, mode: "exam", selection: -1 });
  assert.equal(summary(state, day, day).seconds, 540);
  assert.equal(summary(state, day, day).attempts.length, 0);
  assert.equal(reviewCards(state.attempts).size, 0);
});

test("backup validation preserves valid data and rejects malformed dates and duplicates", () => {
  const state = blankState("2026-11-23");
  assert.deepEqual(parseBackup(JSON.stringify(state)), state);
  state.settings.start = "2026-02-31";
  assert.throws(() => parseBackup(JSON.stringify(state)));
  state.settings.start = "2026-11-23";
  state.classes = Array(2).fill({ id: "one", at: 1, day: "2026-11-23", skill: "hc-0", minutes: 60, complete: true });
  assert.throws(() => parseBackup(JSON.stringify(state)));
});

const miniResult: MiniResult = {
  id: "mini-a", at: 123, day: "2026-11-23", skill: "hc-orden", form: 0,
  seconds: 127, answers: [1, 2, 0, 3, 1], correct: 5,
};

const practiceAttempt: Attempt = {
  id: "attempt-a", at: 1, day: "2026-11-23", skill: "hc-orden", item: "hc-orden:0",
  correct: false, help: false, seconds: 20, mode: "practice", selection: 0,
};

test("version 1 backups made before mini-tests load with empty mini-test history", () => {
  const { miniResults, ...legacy } = blankState("2026-11-23");
  legacy.attempts = [practiceAttempt];
  assert.deepEqual(parseBackup(JSON.stringify(legacy)), { ...legacy, miniResults: [] });
});

test("backups keep all five answers, the score, and the exact mini-test time", () => {
  const result = { ...miniResult, seconds: 10_801 };
  const spanishResult = { ...result, id: "mini-es", skill: "es-ortografia" };
  const data = { ...blankState("2026-11-23"), miniResults: [result, spanishResult] };
  assert.deepEqual(parseBackup(JSON.stringify(data)).miniResults, [result, spanishResult]);
});

test("backups reject malformed mini-test results", () => {
  const state = blankState("2026-11-23");
  for (const invalid of [
    null, {},
    [{ ...miniResult, skill: "es-texto" }],
    [{ ...miniResult, skill: "es-ortografia", form: 1 }],
    [{ ...miniResult, form: 3 }],
    [{ ...miniResult, seconds: 0 }],
    [{ ...miniResult, seconds: 12.5 }],
    [{ ...miniResult, correct: 6 }],
    [{ ...miniResult, answers: [1, 2, 0, 3] }],
    [{ ...miniResult, answers: [1, 2, 0, 3, 1, 2] }],
    [{ ...miniResult, answers: [1, 2, 0, 3, 4] }],
    [{ ...miniResult, answers: [1, 2, 0, 3, 1.5] }],
    [{ ...miniResult, day: "2026-11-31" }],
  ]) {
    assert.throws(() => parseBackup(JSON.stringify({ ...state, miniResults: invalid })));
  }
});

test("backups reject duplicate mini-test IDs across event types", () => {
  const state = { ...blankState("2026-11-23"), miniResults: [miniResult] };
  const duplicateAttempt = { ...practiceAttempt, id: miniResult.id };
  const duplicateClass = { ...miniResult, minutes: 60, complete: true };
  for (const data of [
    { ...state, miniResults: [miniResult, miniResult] },
    { ...state, attempts: [duplicateAttempt] },
    { ...state, classes: [duplicateClass] },
  ]) {
    assert.throws(() => parseBackup(JSON.stringify(data)));
  }
});

test("summaries count mini-test seconds once and preserve individual question scores", () => {
  const resultOnlyDay = { ...miniResult, id: "mini-b", day: "2026-11-24", seconds: 113 };
  const outsidePeriod = { ...miniResult, id: "mini-c", day: "2026-11-25", seconds: 53 };
  const state = {
    ...blankState("2026-11-23"), attempts: [practiceAttempt], miniResults: [miniResult, resultOnlyDay, outsidePeriod],
  };
  const result = summary(state, "2026-11-23", "2026-11-24");
  assert.deepEqual(result.miniResults, [miniResult, resultOnlyDay]);
  assert.deepEqual(result.attempts, [practiceAttempt]);
  assert.equal(result.correct, 0);
  assert.equal(result.seconds, 260);
  assert.equal(result.activeDays, 2);
});

test("summaries subtract only the class time that overlaps a mini-test for the same skill and day", () => {
  const day = "2026-11-23";
  const end = Date.parse("2026-11-24T07:00:00Z");
  const minute = 60_000;
  const state = blankState(day);
  state.attempts = [practiceAttempt];
  state.classes = [
    { id: "class-b", at: end + 10 * minute, day, skill: "hc-orden", minutes: 20, complete: false },
    { id: "class-a", at: end, day, skill: "hc-orden", minutes: 20, complete: false },
    { id: "class-c", at: end + 70 * minute, day: "2026-11-24", skill: "hc-orden", minutes: 120, complete: true },
  ];

  const covered = { ...miniResult, at: end + 5 * minute, seconds: 600 };
  const partial = { ...miniResult, at: end + 15 * minute, seconds: 2400 };
  const otherSkill = { ...miniResult, at: end, skill: "hc-secuencias", seconds: 300 };
  for (const [mini, seconds] of [[covered, 20], [partial, 620], [otherSkill, 320]] as const) {
    const result = summary({ ...state, miniResults: [mini] }, day, "2026-11-24");
    assert.equal(result.seconds, seconds);
    assert.equal(result.classMinutes, 160);
    assert.deepEqual(result.miniResults, [mini]);
  }
});

test("mini-test history sorts by time and breaks ties by ID within the same skill", () => {
  const sameTime = { ...miniResult, id: "mini-b" };
  const older = { ...miniResult, id: "mini-c", at: 100 };
  const otherSkill = { ...miniResult, id: "mini-d", at: 200, skill: "hc-secuencias" };
  assert.deepEqual(miniHistory([older, sameTime, otherSkill, miniResult], "hc-orden"), [sameTime, miniResult, older]);
});

test("mini-tests rotate forms for each skill and return to the first form after the last one", () => {
  const nextDay = { ...miniResult, id: "mini-b", at: 345, day: "2026-11-24", form: 1 };
  const sameDay = { ...miniResult, id: "mini-c", at: 346, day: "2026-11-24", form: 2 };
  assert.equal(nextMiniForm([], "hc-orden", 3), 0);
  assert.equal(nextMiniForm([miniResult], "hc-secuencias", 3), 0);
  assert.equal(nextMiniForm([miniResult], "hc-orden", 3), 1);
  assert.equal(nextMiniForm([nextDay, miniResult], "hc-orden", 3), 2);
  assert.equal(nextMiniForm([sameDay, miniResult, nextDay], "hc-orden", 3), 0);
});

test("a mini-test rating takes priority over practice on the same day", () => {
  const laterRetry = { ...miniResult, id: "mini-b", at: 234, correct: 1 };
  const cards = reviewCards([practiceAttempt], [laterRetry, miniResult]);
  assert.equal(cards.get("hc-orden")?.due, "2026-11-26");
  assert.equal(cards.get("hc-orden")?.card.reps, 1);
});

test("mini-test review ratings follow the score and use each study day once", () => {
  const laterTest = { ...miniResult, id: "mini-b", at: 234, day: "2026-11-26", correct: 3 };
  const cards = reviewCards([], [laterTest, miniResult]);
  assert.equal(cards.get("hc-orden")?.due, "2026-11-27");
  assert.equal(cards.get("hc-orden")?.card.reps, 2);
  assert.equal(reviewCards([], [{ ...miniResult, correct: 4 }]).get("hc-orden")?.due, "2026-11-25");
});
