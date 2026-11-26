import assert from "node:assert/strict";
import { test } from "node:test";
import { classTimerRecord, elapsedClassMs, pauseClassTimer, readClassTimer, resumeClassTimer, startClassTimer, writeClassTimer } from "../src/classTimer";

const at = Date.parse("2026-11-24T07:30:00Z");
const minute = 60_000;
const skill = "hc-orden";

test("a class timer counts active intervals and uses the save time for the record", () => {
  const started = startClassTimer("class-a", skill, at);
  const paused = pauseClassTimer(started, at + 10 * minute);
  assert.equal(elapsedClassMs(paused, at + 15 * minute), 10 * minute);
  assert.equal(pauseClassTimer(paused, at + 15 * minute), paused);
  const resumed = resumeClassTimer(paused, at + 15 * minute);
  assert.equal(resumeClassTimer(resumed, at + 19 * minute), resumed);
  assert.equal(elapsedClassMs(resumed, at + 22 * minute), 17 * minute);
  const ended = pauseClassTimer(resumed, at + 22 * minute);

  assert.deepEqual(classTimerRecord(ended, at + 34 * minute, true), {
    id: "class-a", skill, at: at + 34 * minute, day: "2026-11-24", complete: true, minutes: 17,
    intervals: [{ start: at, end: at + 10 * minute }, { start: at + 15 * minute, end: at + 22 * minute }],
  });
});

test("automatic minutes can exceed three hours and an optional correction retains the measured interval", () => {
  const started = startClassTimer("class-b", skill, at);
  const after = at + 181 * minute + 10_000;
  assert.equal(classTimerRecord(started, at, true), null);
  assert.equal(classTimerRecord(started, at + 1000, false)?.minutes, 1);
  assert.equal(classTimerRecord(started, after, false)?.minutes, 181);
  assert.equal(classTimerRecord(started, after, false, 0), null);
  assert.equal(classTimerRecord(started, after, false, 1.5), null);
  assert.equal(classTimerRecord(started, after, false, 181), null);
  assert.deepEqual(classTimerRecord(started, after, false, 145), {
    id: "class-b", skill, at: after, day: "2026-11-24", complete: false, minutes: 145,
    intervals: [{ start: at, end: after }],
  });
});

test("a backward clock creates no negative or overlapping class intervals", () => {
  const started = startClassTimer("class-c", skill, at);
  assert.equal(elapsedClassMs(started, at - 2000), 0);
  assert.deepEqual(pauseClassTimer(started, at - 2000).intervals, []);
  const paused = pauseClassTimer(started, at + minute);
  const resumed = resumeClassTimer(paused, at - minute);
  assert.equal(resumed.startedAt, at + minute);
  assert.equal(elapsedClassMs(resumed, at), minute);
  assert.equal(classTimerRecord(resumed, at, false)?.at, at + minute);
  assert.deepEqual(classTimerRecord(resumed, at + 2 * minute, false)?.intervals, [
    { start: at, end: at + minute }, { start: at + minute, end: at + 2 * minute },
  ]);
});

test("a timer survives a reload and rejects invalid saved timestamps and intervals", () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, text: string) => { entries.set(key, text); },
    removeItem: (key: string) => { entries.delete(key); },
  };
  const started = startClassTimer("class-d", skill, at);
  const paused = pauseClassTimer(started, at + minute);
  const resumed = resumeClassTimer(paused, at + 2 * minute);
  const key = "marie-cetys:class-timer:v1";
  assert.equal(readClassTimer(storage), null);
  for (const timer of [started, paused, resumed]) {
    writeClassTimer(storage, timer);
    assert.equal(storage.getItem(key), JSON.stringify(timer));
    assert.deepEqual(readClassTimer(storage), timer);
  }
  for (const bad of [null, [], {}, { ...resumed, id: "" }, { ...resumed, startedAt: -1 },
    { ...resumed, startedAt: at }, { ...resumed, intervals: [{ start: at, end: at }] },
    { ...resumed, intervals: [...resumed.intervals, { start: at + 1, end: at + minute + 1 }] },
  ]) {
    storage.setItem(key, JSON.stringify(bad));
    assert.equal(readClassTimer(storage), null);
  }
  storage.setItem(key, "{");
  assert.equal(readClassTimer(storage), null);
  writeClassTimer(storage, null);
  assert.equal(storage.getItem(key), null);
});
