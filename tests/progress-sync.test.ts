import assert from "node:assert/strict";
import { test } from "node:test";
import { blankState, parseBackup } from "../src/study";
import { mergeImportedProgress, mergeProgress, progressBaseline } from "../src/progressSync";
import type { Attempt } from "../src/types";

const day = "2026-11-24";
const attempt = (id: string, at: number): Attempt => ({
  id, at, day, skill: "es-ortografia", item: "es-ortografia:0", mode: "practice", seconds: 12,
  correct: true, help: false, selection: 1,
});

test("first connection preserves the server plan and adds local records without duplicates", () => {
  const local = blankState(day);
  local.settings.minutes = 45;
  local.attempts.push(attempt("a", 1), attempt("b", 3));
  local.flagged.push("es-ortografia:0");
  const remote = blankState(day);
  remote.settings.minutes = 90;
  remote.attempts.push(attempt("c", 2), attempt("b", 3));
  remote.flagged.push("es-ortografia:1");
  const result = mergeProgress(local, remote);
  assert.equal(result.settings.minutes, 90);
  assert.deepEqual(result.attempts.map(entry => entry.id), ["a", "c", "b"]);
  assert.deepEqual(result.flagged, ["es-ortografia:0", "es-ortografia:1"]);
});

test("a later sync applies local unflags and plan changes while keeping remote additions", () => {
  const common = blankState(day);
  common.flagged = ["es-ortografia:0", "es-ortografia:1"];
  const local = structuredClone(common);
  const remote = structuredClone(common);
  local.flagged = ["es-ortografia:1", "es-ortografia:2"];
  local.settings.minutesByDate[day] = 90;
  remote.flagged = ["es-ortografia:0", "es-ortografia:3"];
  remote.pinned = "es-ortografia";
  remote.attempts.push(attempt("remote", 1));
  const result = mergeProgress(local, remote, progressBaseline(common));
  assert.deepEqual(result.flagged, ["es-ortografia:2", "es-ortografia:3"]);
  assert.equal(result.settings.minutesByDate[day], 90);
  assert.equal(result.pinned, "es-ortografia");
  assert.equal(result.attempts.length, 1);
  assert.deepEqual(mergeProgress(result, result, progressBaseline(result)), result);
});

test("an explicit import adds history and restores the plan from the previous address", () => {
  const current = blankState(day);
  current.attempts.push(attempt("new", 2));
  const previous = blankState(day);
  previous.attempts.push(attempt("old", 1));
  previous.settings.minutes = 75;
  previous.pinned = "es-ortografia";
  const result = mergeImportedProgress(current, previous);
  assert.deepEqual(result.attempts.map(entry => entry.id), ["old", "new"]);
  assert.equal(result.settings.minutes, 75);
  assert.equal(result.pinned, "es-ortografia");
  assert.deepEqual(parseBackup(JSON.stringify(result)), result);
});

test("concurrent devices keep separate plan edits and resolve conflicts for a single date", () => {
  const base = blankState(day);
  base.settings.minutesByDate["2026-11-25"] = 90;
  const phone = structuredClone(base);
  phone.settings.minutes = 45;
  delete phone.settings.minutesByDate["2026-11-25"];
  phone.settings.exceptions.push("2026-11-25");
  phone.settings.minutesByDate["2026-11-27"] = 120;
  const laptop = structuredClone(base);
  laptop.settings.weekdays.push(6);
  laptop.settings.minutesByDate["2026-11-25"] = 75;
  laptop.settings.minutesByDate["2026-11-28"] = 60;
  const result = mergeProgress(phone, laptop, progressBaseline(base));
  assert.equal(result.settings.minutes, 45);
  assert.ok(result.settings.weekdays.includes(6));
  assert.deepEqual(result.settings.exceptions, ["2026-11-25"]);
  assert.deepEqual(result.settings.minutesByDate, { "2026-11-27": 120, "2026-11-28": 60 });
  assert.deepEqual(parseBackup(JSON.stringify(result)), result);
});
