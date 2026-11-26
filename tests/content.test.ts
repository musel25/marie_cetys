import assert from "node:assert/strict";
import { test } from "node:test";
import { areaOrder, areas, byArea, curriculum, expectedMiniFormCount, lessonById, miniQuestionCount } from "../src/content";
import { guidedSections } from "../src/content/guides";
import { miniFormCount, miniQuestions } from "../src/content/mini";
import { questions } from "../src/study";

test("each exam area has enough original questions for a timed section and ordered skill prerequisites", () => {
  const lessons = new Set<string>();
  const prompts = new Set<string>();
  const itemIds = new Set<string>();

  for (const lesson of curriculum) {
    assert.match(lesson.id, new RegExp(`^${lesson.area}-[a-z-]+$`));
    assert.ok(!lessons.has(lesson.id), lesson.id);
    assert.ok(lesson.prerequisiteIds.every(id => lessons.has(id)), lesson.id);
    assert.ok(lesson.title && lesson.objective && lesson.source);
    const guided = guidedSections(lesson);
    assert.ok(guided.length >= 2, lesson.id);
    for (const section of guided) {
      assert.match(section.id, /^[a-z-]+$/);
      assert.ok(section.title.trim() && section.points.length && section.points.every(point => point.trim()), lesson.id);
      assert.ok(section.example.prompt.trim() && section.example.steps.length >= 2, section.id);
      for (const step of section.example.steps) {
        assert.ok(step.prompt.trim() && step.explanation.trim(), section.id);
        assert.ok(step.options.length >= 2 && step.options.every(option => option.trim()), section.id);
        assert.equal(new Set(step.options).size, step.options.length, section.id);
        assert.ok(Number.isInteger(step.answer) && step.answer >= 0 && step.answer < step.options.length, section.id);
      }
    }
    assert.ok(lesson.exercises.filter(exercise => exercise.difficulty === "base").length >= 3, lesson.id);
    assert.ok(lesson.exercises.filter(exercise => exercise.difficulty === "exam").length >= 4, lesson.id);
    assert.ok(lesson.exercises.some(exercise => exercise.difficulty === "challenge"), lesson.id);
    lessons.add(lesson.id);
    for (const item of [...questions(lesson), ...guided.flatMap(section => [section.question, section.followUpQuestion])]) {
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

test("every mini-exam has fifteen distinct questions with alternatives to the guided practice", () => {
  const prompts = new Set(curriculum.flatMap(lesson => [...questions(lesson), ...guidedSections(lesson).flatMap(section => [section.question, section.followUpQuestion])].map(item => item.prompt)));
  for (const lesson of curriculum) {
    const bank = new Map(lesson.exercises.map(item => [item.prompt, item]));
    const originalCount = lesson.id === "es-ortografia" ? 10 : 5;
    const formCount = miniFormCount(lesson.id);
    assert.equal(formCount, expectedMiniFormCount(lesson), lesson.id);
    assert.equal(formCount, lesson.area === "hc" || lesson.id === "es-ortografia" ? 3 : 1, lesson.id);
    const extensions = new Set<string>();
    for (let form = 0; form < formCount; form++) {
      const items = miniQuestions(lesson.id, form);
      assert.equal(items.length, miniQuestionCount, lesson.id);
      assert.equal(items.length, 15, lesson.id);
      assert.equal(new Set(items.map(item => item.prompt)).size, items.length, lesson.id);
      if (lesson.area === "hc") {
        assert.deepEqual(items.slice(0, originalCount).map(item => item.difficulty), ["base", "base", "exam", "exam", "exam"]);
      }
      for (const item of items.slice(0, originalCount)) {
        assert.equal(item.options.length, 4, item.id);
        assert.equal(new Set(item.options.map(option => option.trim())).size, 4, item.id);
        assert.ok(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < 4, item.id);
        assert.ok(item.options.every(option => option.trim()), item.id);
        assert.ok(item.explanation.trim() && item.hint.trim(), item.id);
        assert.ok(!prompts.has(item.prompt), item.id);
        prompts.add(item.prompt);
      }
      const extension = items.slice(originalCount);
      for (const { id, skill, ...exercise } of extension) {
        assert.equal(skill, lesson.id, id);
        assert.deepEqual(exercise, bank.get(exercise.prompt), id);
      }
      const promptSet = JSON.stringify(extension.map(item => item.prompt).sort());
      assert.ok(!extensions.has(promptSet), lesson.id);
      extensions.add(promptSet);
    }
  }
});

test("appending a bank question does not change a saved mini-exam form", () => {
  const lesson = lessonById.get("hc-analogias")!;
  const savedForm = miniQuestions(lesson.id, 1);
  lesson.exercises.push({ ...lesson.exercises[0], prompt: "Future addition" });
  try {
    assert.deepEqual(miniQuestions(lesson.id, 1), savedForm);
  } finally {
    lesson.exercises.pop();
  }
});
