import assert from "node:assert/strict";
import { test } from "node:test";
import { blankState, classPlan, parseBackup, periodStart, reviewCards, nextQuestion, summary } from "../src/study";
import type { Attempt, Lesson } from "../src/types";
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
