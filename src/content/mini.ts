import cognitive from "./cognitive-mini.json";
import spanish from "./espanol-mini.json";
import math from "./math-mini.json";
import english from "./ingles-mini.json";
import { lessonById, miniQuestionCount } from "./index";
import type { Exercise, Question } from "../types";

const forms = new Map<string, Exercise[][]>(Object.entries({
  ...cognitive,
  ...spanish,
  ...math,
  ...english,
} as Record<string, Exercise[][]>));

export function miniFormCount(skill: string) {
  return forms.get(skill)?.length ?? 0;
}

export function miniQuestions(skill: string, form: number): Question[] {
  const lesson = lessonById.get(skill);
  const variants = forms.get(skill);
  if (!lesson || !variants) return [];
  const original = variants[form];
  if (!original) return [];

  // Keep each original prefix so saved answers still refer to the same questions.
  const extraCount = miniQuestionCount - original.length;
  // Pin the size of a shared bank prefix so appending questions never shifts an existing form.
  const reserve = lesson.exercises.slice(0, lesson.miniReserveSize ?? extraCount * variants.length);
  const start = (form * extraCount) % reserve.length;
  const extension = [...reserve.slice(start), ...reserve.slice(0, start)].slice(0, extraCount);
  return [...original, ...extension].map((exercise, index) => ({
    ...exercise, skill, id: skill + ":mini:" + form + ":" + index,
  }));
}
