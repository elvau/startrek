import type { CatKey } from "./model";

export type ChapterKey = "trav" | CatKey | "split";

export interface Chapter { k: ChapterKey; label: string; title: string; icon: string; sub: string }

export const CHAPTERS: Chapter[] = [
  { k: "trav", label: "Reisende", title: "Wer fährt mit", icon: "users", sub: "" },
  { k: "flights", label: "Flüge", title: "Abheben", icon: "plane", sub: "Flüge und Anreise" },
  { k: "stay", label: "Unterkunft", title: "Ankommen", icon: "bed", sub: "Unterkünfte" },
  { k: "transport", label: "Vor Ort", title: "Unterwegs", icon: "car", sub: "Transport vor Ort" },
  { k: "attractions", label: "Erlebnisse", title: "Erleben", icon: "ticket", sub: "Attraktionen" },
  { k: "misc", label: "Sonstiges", title: "Alles andere", icon: "bag", sub: "Verpflegung, Versicherung, Sonstiges" },
  { k: "split", label: "Abrechnung", title: "Wer zahlt was", icon: "wallet", sub: "pro Familie" }
];

export const CAT_CHAPTERS = CHAPTERS.filter(c => c.k !== "trav" && c.k !== "split") as (Chapter & { k: CatKey })[];
export const SPLIT = CHAPTERS.find(c => c.k === "split")!;
