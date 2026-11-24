import bank from "./cognitive-mini.json";
import type { Exercise, Question } from "../types";

export const cognitiveForms = bank as Record<string, Exercise[][]>;

export function miniQuestions(skill: string, form: number): Question[] {
  return (cognitiveForms[skill]?.[form] ?? []).map((exercise, index) => ({
    ...exercise, skill, id: skill + ":mini:" + form + ":" + index,
  }));
}
