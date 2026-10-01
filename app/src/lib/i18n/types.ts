/* Typen der Übersetzungen, ohne Svelte (auch für den Such-Dienst) */
import type { de } from "./de";

export type Key = keyof typeof de & string;
/** Wörterbuch einer Sprache; zusätzliche Mehrzahlformen (few, many …) auch für Schlüssel, die Deutsch nicht braucht */
export type Dict = { [k in Key]?: string } & { [k: `${string}.${"zero" | "one" | "two" | "few" | "many" | "other"}`]: string };
