import type { CatKey } from "./model";
import { t, type Key } from "./i18n/index.svelte";

export type ChapterKey = "trav" | CatKey | "split";

export interface Chapter { k: ChapterKey; readonly label: string; readonly title: string; icon: string; readonly sub: string }

/** Texte kommen aus der Übersetzung (Getter: passen sich beim Sprachwechsel an) */
const ch = (k: ChapterKey, icon: string): Chapter => ({
  k, icon,
  get label() { return t(`ch.${k}.label` as Key); },
  get title() { return t(`ch.${k}.title` as Key); },
  get sub() { return t(`ch.${k}.sub` as Key); }
});

export const CHAPTERS: Chapter[] = [
  ch("trav", "users"), ch("flights", "plane"), ch("stay", "bed"), ch("transport", "car"),
  ch("attractions", "ticket"), ch("misc", "bag"), ch("split", "wallet")
];

export const chLabel = (c: Chapter) => c.label;
export const chTitle = (c: Chapter) => c.title;

export const CAT_CHAPTERS = CHAPTERS.filter(c => c.k !== "trav" && c.k !== "split") as (Chapter & { k: CatKey })[];
export const SPLIT = CHAPTERS.find(c => c.k === "split")!;
