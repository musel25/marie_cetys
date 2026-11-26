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
  return (guides.get(lesson.id) ?? []).map(section => {
    const id = lesson.id + ":guiado-" + section.id;
    return {
      ...section,
      question: { ...section.exercise, id, skill: lesson.id },
      followUpQuestion: { ...section.followUp, id: id + "-practica", skill: lesson.id },
    };
  });
}
