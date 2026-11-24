import cognitive from "./cognitive-mini.json";
import spanish from "./espanol-mini.json";
import math from "./math-mini.json";
import english from "./ingles-mini.json";
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
  return (forms.get(skill)?.[form] ?? []).map((exercise, index) => ({
    ...exercise, skill, id: skill + ":mini:" + form + ":" + index,
  }));
}
