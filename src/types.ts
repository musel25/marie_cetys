export type Area = "hc" | "es" | "mat" | "en";
export type Difficulty = "base" | "exam" | "challenge";
export type Mode = "practice" | "review" | "live" | "exam";
export type Period = "day" | "week" | "month";

export interface Exercise {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  hint: string;
  difficulty: Difficulty;
}

export interface LessonDraft {
  id: string;
  title: string;
  objective: string;
  explanation: string[];
  example: { prompt: string; steps: string[] };
  workedExamples?: { prompt: string; explanation: string }[];
  prerequisiteIds: string[];
  source: string;
  exercises: Exercise[];
}

export interface Lesson extends LessonDraft { area: Area }
export interface Question extends Exercise { id: string; skill: string }

export interface Settings {
  start: string;
  exam: string;
  weekdays: number[];
  minutes: number;
  exceptions: string[];
}

export interface Attempt {
  id: string;
  at: number;
  day: string;
  item: string;
  skill: string;
  correct: boolean;
  help: boolean;
  seconds: number;
  mode: Mode;
  selection?: number;
}

export interface ClassRecord {
  id: string;
  at: number;
  day: string;
  skill: string;
  minutes: number;
  complete: boolean;
}

export interface MiniResult {
  id: string;
  at: number;
  day: string;
  skill: string;
  form: number;
  seconds: number;
  answers: number[];
  correct: number;
}

export interface StudyState {
  version: 1;
  settings: Settings;
  pinned: string;
  attempts: Attempt[];
  classes: ClassRecord[];
  miniResults: MiniResult[];
  flagged: string[];
}
