/* Sichtbare Kapitel der offenen Reise (#618) für Navigation, Pager am Handy und Leiste; App hält sie aktuell */
import { CHAPTERS, type ChapterKey } from "./chapters";

export const shown = $state<{ keys: ChapterKey[] }>({ keys: CHAPTERS.filter(c => c.k !== "pkg").map(c => c.k) });
