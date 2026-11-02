/*
 * Startbestand des Reisekatalogs (#642): die Reiseideen-Seiten (seo/pages.ts) als Katalogeinträge. Zeilen der Anreise
 * (Flug, Bahn, Bus, Auto ab Wohnort) fallen weg, die Anreise schätzt die App je Betrachter (#645). Ausflüge werden Touren,
 * außer sie sind der Kern der Reise (Skipass, Festivalticket, Musical). Weitere Einträge pflegt die Routine (#651).
 * Ohne Beschreibung der Seite: die nennt Anreise und Abflug ab Deutschland, der Katalog rechnet ab dem Wohnort des Betrachters.
 */
import { PAGES, STAND, type Page } from "../seo/pages";
import type { TravelStyle } from "../model";
import type { CatalogEntry, CatalogKind, CatalogMove } from "./types";

interface Meta {
  lat: number; lon: number; nights: number; months: number[]; kind: CatalogKind; styles: TravelStyle[];
  /** Zeilen der Anreise (Index in costs) */
  arrive: number[];
  /** Ausflüge, die zum Kern gehören (Index in costs) */
  core?: number[];
  noFly?: boolean;
  move?: CatalogMove[];
  event?: string;
}

/** je Reiseidee: Lage des Ziels, Nächte, gute Monate, Art (aus dem Text der Seite) */
export const SEED_META: Record<string, Meta> = {
  "gruppenreise-mallorca-kosten": { lat: 39.62, lon: 2.98, nights: 5, months: [5, 6, 9], kind: "stay", styles: ["beach"], arrive: [0], move: ["car"] },
  "gruppenreise-prag-kosten": { lat: 50.09, lon: 14.42, nights: 3, months: [3, 4, 5, 9, 10, 12], kind: "stay", styles: ["city", "party"], arrive: [0], move: ["transit"] },
  "gruppenreise-amsterdam-kosten": { lat: 52.37, lon: 4.9, nights: 3, months: [4, 5, 6, 9], kind: "stay", styles: ["city", "culture"], arrive: [0], move: ["transit"] },
  "gruppenreise-barcelona-kosten": { lat: 41.39, lon: 2.17, nights: 4, months: [3, 4, 5, 10], kind: "stay", styles: ["city", "beach"], arrive: [0], move: ["transit"] },
  "gardasee-mehrere-familien-kosten": { lat: 45.89, lon: 10.84, nights: 7, months: [6, 7, 8], kind: "stay", styles: ["nature", "beach"], arrive: [0] },
  "gruppenreise-kroatien-ferienhaus-kosten": { lat: 45.23, lon: 13.6, nights: 7, months: [6, 7, 8, 9], kind: "stay", styles: ["beach"], arrive: [0] },
  "gruppenreise-lissabon-kosten": { lat: 38.71, lon: -9.13, nights: 4, months: [3, 4, 5, 9, 10], kind: "stay", styles: ["city", "culture"], arrive: [0], move: ["transit"] },
  "ferienhaus-daenemark-familien-kosten": { lat: 55.56, lon: 8.13, nights: 7, months: [7, 8, 10], kind: "stay", styles: ["beach", "nature"], arrive: [0] },
  "junggesellenabschied-kosten": { lat: 53.55, lon: 9.97, nights: 2, months: [5, 6, 7, 8, 9], kind: "event", styles: ["party", "city"], arrive: [0], event: "Junggesellenabschied" },
  "klassenfahrt-berlin-kosten": { lat: 52.52, lon: 13.4, nights: 4, months: [4, 5, 6, 9, 10], kind: "stay", styles: ["city", "culture"], arrive: [0], noFly: true, move: ["transit"] },
  "familienurlaub-mehrere-familien-kosten": { lat: 53.95, lon: 14.17, nights: 7, months: [6, 7, 8], kind: "stay", styles: ["beach"], arrive: [0] },
  "skiurlaub-gruppe-oesterreich-kosten": { lat: 47.17, lon: 11.86, nights: 6, months: [1, 2, 3], kind: "stay", styles: ["ski"], arrive: [0], core: [2] },
  "festival-mit-freunden-kosten": { lat: 50.34, lon: 6.95, nights: 3, months: [6, 7, 8], kind: "event", styles: ["party"], arrive: [1], core: [0], event: "Festival" },
  "vereinsreise-reisebus-kosten": { lat: 53.55, lon: 9.99, nights: 2, months: [3, 4, 5, 9, 10, 11], kind: "event", styles: ["city", "culture"], arrive: [0], core: [2], noFly: true, event: "Musical" },
  "kurztrip-wien-freunde-kosten": { lat: 48.21, lon: 16.37, nights: 3, months: [4, 5, 9, 10, 12], kind: "stay", styles: ["city", "culture"], arrive: [0], move: ["transit"] }
};

const MONTHS: Record<string, string> = { Januar: "01", Februar: "02", März: "03", April: "04", Mai: "05", Juni: "06", Juli: "07", August: "08", September: "09", Oktober: "10", November: "11", Dezember: "12" };
/** „Oktober 2026“ → „2026-10“ */
export function standOf(s: string): string {
  const [m, y] = s.split(" ");
  return MONTHS[m] && /^\d{4}$/.test(y) ? `${y}-${MONTHS[m]}` : "";
}

/** Gruppe aus dem Link in die App: „2-2,2-1“ = Familien mit Erwachsenen-Kindern, sonst Anzahl Erwachsene */
function groupOf(p: Page): CatalogEntry["group"] {
  if (p.plan.fam) {
    const fam = p.plan.fam.split(",").map(f => f.split("-").map(Number));
    return { adults: fam.reduce((a, f) => a + (f[0] || 0), 0), children: fam.reduce((a, f) => a + (f[1] || 0), 0), infants: 0 };
  }
  return { adults: p.plan.gruppe || 2, children: 0, infants: 0 };
}

const mid = (a: number, b: number) => Math.round((a + b) / 2);

export function pageToCatalog(p: Page): CatalogEntry | null {
  const m = SEED_META[p.slug];
  if (!m) return null;
  const costs: CatalogEntry["costs"] = [], tours: CatalogEntry["tours"] = [];
  p.costs.forEach((c, i) => {
    if (m.arrive.includes(i)) return;
    const row = { pp: mid(c.from, c.to), range: [c.from, c.to] as [number, number] };
    if (c.cat === "attractions" && !m.core?.includes(i)) tours.push({ name: c.label, ...row });
    else costs.push({ cat: c.cat, label: c.label, ...row, ...(c.cat === "stay" ? { place: p.plan.ziel, nights: m.nights } : {}) });
  });
  return {
    v: 1, id: `idea:${p.slug}`, source: "idea", lang: "de", title: p.h1, kind: m.kind, styles: [...m.styles],
    ...(m.noFly ? { noFly: true } : {}), ...(m.event ? { event: m.event } : {}),
    group: groupOf(p), months: [...m.months], nights: m.nights,
    stops: [{ place: p.plan.ziel, cc: p.plan.land, lat: m.lat, lon: m.lon, nights: m.nights }],
    ...(m.move ? { move: [...m.move] } : {}), costs, tours, days: [], stand: standOf(STAND), slug: p.slug
  };
}

/** alle Reiseideen als Katalogeinträge */
export const seedCatalog = (): CatalogEntry[] => PAGES.map(pageToCatalog).filter((e): e is CatalogEntry => !!e);
