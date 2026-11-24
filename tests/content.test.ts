import assert from "node:assert/strict";
import { test } from "node:test";
import { areaOrder, areas, byArea, curriculum } from "../src/content";
import { questions } from "../src/study";

test("each exam area has enough original questions for a timed section and ordered skill prerequisites", () => {
  const lessons = new Set<string>();
  const prompts = new Set<string>();
  const itemIds = new Set<string>();

  for (const lesson of curriculum) {
    assert.match(lesson.id, new RegExp(`^${lesson.area}-[a-z-]+$`));
    assert.ok(!lessons.has(lesson.id), lesson.id);
    assert.ok(lesson.prerequisiteIds.every(id => lessons.has(id)), lesson.id);
    assert.ok(lesson.title && lesson.objective && lesson.source && lesson.explanation.length);
    assert.ok(lesson.example.prompt && lesson.example.steps.length);
    assert.ok(lesson.exercises.length >= 7, lesson.id);
    assert.ok(lesson.exercises.some(exercise => exercise.difficulty === "challenge"), lesson.id);
    lessons.add(lesson.id);
    for (const item of questions(lesson)) {
      assert.ok(!itemIds.has(item.id), item.id);
      assert.ok(!prompts.has(item.prompt), item.id);
      assert.equal(item.options.length, 4, item.id);
      assert.equal(new Set(item.options.map(option => option.trim())).size, 4, item.id);
      assert.ok(item.options.every(option => option.trim()), item.id);
      assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4, item.id);
      assert.ok(item.explanation.trim() && item.hint.trim(), item.id);
      itemIds.add(item.id);
      prompts.add(item.prompt);
    }
  }
  for (const area of areaOrder) {
    assert.ok(byArea[area].flatMap(lesson => lesson.exercises).length >= areas[area].count);
  }
});
