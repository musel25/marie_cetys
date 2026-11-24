import type { ReactNode } from "react";
import type { Area } from "./types";
import { areas } from "./content";

const iconPaths = {
  home: "M3 10.5 12 3l9 7.5V21H3z M9 21v-7h6v7",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15m6-12v15",
  repeat: "M20 7H7a4 4 0 0 0-4 4m14-7 3 3-3 3 M4 17h13a4 4 0 0 0 4-4M7 14l-3 3 3 3",
  clock: "M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  graph: "M4 4v16h16 M8 15l4-5 4 2 4-6",
  calendar: "M4 5h16v15H4z M4 9h16 M8 3v4m8-4v4 M8 13h2m4 0h2m-8 3h2",
  book: "M12 6v15m0-15C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Z",
  check: "m5 12 4 4L19 6",
  sparkle: "M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z",
  flag: "M5 22V3m0 1c6-5 8 4 14 0v10c-6 4-8-5-14 0",
  link: "m9 15 6-6 M8 16l-1 1a3.54 3.54 0 0 1-5-5l5-5a3.54 3.54 0 0 1 5 0m0 10a3.54 3.54 0 0 0 5 0l5-5a3.54 3.54 0 0 0-5-5l-1 1",
};
export type IconName = keyof typeof iconPaths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={iconPaths[name]} /></svg>;
}

export function AreaTag({ area }: { area: Area }) {
  return <span className={`area-tag area-${area}`}>{areas[area].title}</span>;
}

export function PageHeading({ title, description }: { title: string; description?: ReactNode }) {
  return <header className="page-heading"><h1>{title}</h1>{description && <p>{description}</p>}</header>;
}

export function lessonHref(id: string) { return "#/clase/" + id; }
export function questionHref(id: string) {
  const [lesson, index] = id.split(":");
  return lessonHref(lesson) + "/" + index;
}

export function duration(minutes: number, hasSeconds = false) {
  if (minutes === 0 && hasSeconds) return "Menos de 1 min";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
}
