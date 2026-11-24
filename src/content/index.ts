import cognitive from "./cognitive.json";
import espanol from "./espanol.json";
import math from "./math.json";
import ingles from "./ingles.json";
import type { Area, Lesson, LessonDraft } from "../types";

export const areas = {
  hc: { title: "Habilidad cognoscitiva", short: "Cognoscitiva", time: 35, count: 42, message: "Orden, relaciones, patrones y lógica." },
  es: { title: "Español", short: "Español", time: 30, count: 37, message: "Lengua, comprensión de lectura y redacción." },
  mat: { title: "Matemáticas", short: "Matemáticas", time: 35, count: 35, message: "Números, álgebra, geometría y datos." },
  en: { title: "Inglés", short: "Inglés", time: 30, count: 40, message: "Language, reading and writing." },
};

export const areaOrder: Area[] = ["hc", "mat", "es", "en"];
const sources: Record<Area, LessonDraft[]> = {
  hc: cognitive as LessonDraft[], mat: math as LessonDraft[],
  es: espanol as LessonDraft[], en: ingles as LessonDraft[],
};

export const byArea = Object.fromEntries(areaOrder.map(area => [
  area, sources[area].map(lesson => ({ ...lesson, area })),
])) as Record<Area, Lesson[]>;

export const curriculum = Array.from({ length: Math.max(...areaOrder.map(area => byArea[area].length)) }, (_, index) =>
  areaOrder.flatMap(area => byArea[area][index] ? [byArea[area][index]] : []),
).flat();

export const lessonById = new Map(curriculum.map(lesson => [lesson.id, lesson]));

export const resourceLinks = [
  { title: "Guía de estudio de College Board", description: "Temario, ejemplos y ejercicios de las cuatro áreas.", url: "https://latam.collegeboard.org/publicaciones/guia-de-estudio-piense-ii/" },
  { title: "Prueba de práctica oficial", description: "Guárdala para un ensayo completo de 130 minutos.", url: "https://latam.collegeboard.org/publicaciones/prueba-de-practica-piense-ii/" },
  { title: "Módulos de aprendizaje de CETYS", description: "Práctica adicional en cognoscitiva, español y matemáticas.", url: "https://www.cetys.mx/admisiones/modulos-de-aprendizaje/" },
  { title: "Fichas de matemáticas de CONEA", description: "Ejercicios resueltos por tema.", url: "https://sites.google.com/view/conea-preparatoria/matem%C3%A1ticas/soluciones" },
  { title: "Simulacro nacional UNX", description: "Modelo adicional para tres áreas.", url: "https://unx.mx/simulacro-nacional-examen-de-admision/" },
];
