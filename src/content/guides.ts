import cognitive from "./guides/cognitive.json";
import spanish from "./guides/espanol.json";
import english from "./guides/ingles.json";
import math from "./guides/math.json";
import type { GuidedSection, Lesson } from "../types";

const guides = new Map(Object.entries({
  ...cognitive,
  ...spanish,
  ...english,
  ...math,
} as Record<string, GuidedSection[]>));

export function guidedSections(lesson: Lesson) {
  return (guides.get(lesson.id) ?? []).map(section => ({
    ...section,
    question: { ...section.exercise, id: lesson.id + ":guiado-" + section.id, skill: lesson.id },
  }));
}
