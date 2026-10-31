/*
 * Reise um Import erweitern (#617): Änderungen gegen die Reise je Posten, bevor etwas geändert wird.
 * - neu: kein passender Posten → übernehmen (Standard) oder weglassen
 * - ergänzt: passender Posten ohne Preis bzw. mit gleichem Preis → als gewähltes Angebot übernehmen (Standard) oder behalten
 * - ersetzt: passender Posten mit anderem Preis → ersetzen, beide behalten (Standard) oder alt behalten
 * - nicht im Angebot: Posten derselben Kapitel, die das Angebot nicht nennt → behalten (Standard) oder löschen
 * Pakete zählen als ein Posten (immer neu). Nichts wird ohne Wahl gelöscht oder überschrieben.
 */
import { noPrice, type CatKey, type Item, type Trip } from "../model";
import { calcOption } from "../calc";
import { pkgOf } from "../package";

export type DiffKind = "new" | "fill" | "replace" | "missing";
export type DiffChoice = "take" | "skip" | "replace" | "both" | "keep" | "delete";
export interface DiffRow {
  id: string;
  kind: DiffKind;
  cat: CatKey;
  /** neue Posten aus dem Angebot (Paket: alle Teile), leer bei „nicht im Angebot“ */
  items: Item[];
  /** vorhandener Posten in der Reise */
  target?: Item;
  choices: DiffChoice[];
  choice: DiffChoice;
  /** Preis vorher (vorhandener Posten) und laut Angebot */
  before?: number;
  after?: number;
}

const CHOICES: Record<DiffKind, DiffChoice[]> = {
  new: ["take", "skip"],
  fill: ["take", "keep"],
  replace: ["replace", "both", "keep"],
  missing: ["keep", "delete"]
};
const DEFAULT: Record<DiffKind, DiffChoice> = { new: "take", fill: "take", replace: "both", missing: "keep" };

const norm = (s = "") => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const chosen = (it: Item) => it.options.find(o => o.id === it.chosen) || it.options[0];
const route = (it: Item) => { const l = chosen(it)?.legs?.[0]; return l ? `${l.from}-${l.to}` : ""; };
const net = (it: Item, trip: Trip) => { const o = chosen(it); return o && !noPrice(o) ? Math.round(calcOption(o, it, trip).net) : undefined; };

/** passt ein vorhandener Posten zum neuen? gleiche Kategorie und Strecke, Name oder Art */
function same(a: Item, b: Item): boolean {
  if (a.cat !== b.cat || !a.cruise !== !b.cruise) return false;
  if (a.cat === "flights") { const r = route(b); return !!r && route(a) === r; }
  if (a.cat === "transport") {
    if (a.hint === "transfer" || b.hint === "transfer") return a.hint === b.hint;
    return norm(a.name) === norm(b.name);
  }
  const x = norm(a.name), y = norm(b.name);
  if (x && y && (x === y || x.includes(y) || y.includes(x))) return true;
  // Unterkunft: gleicher Zeitraum zählt auch (Name auf der Buchung oft anders geschrieben)
  return a.cat === "stay" && !!a.from && a.from === b.from && a.to === b.to;
}

/** Änderungen eines Imports (made: Posten aus importToTrip auf einer Kopie) gegen die Reise */
export function diffImport(trip: Trip, made: Item[]): DiffRow[] {
  const rows: DiffRow[] = [];
  const used = new Set<string>();
  const pool = trip.items.filter(i => !i.auto && i.status !== "dropped" && !pkgOf(i));
  const pkgs = new Map<string, Item[]>();
  for (const it of made) {
    const p = pkgOf(it);
    if (p) { pkgs.set(p.id, [...(pkgs.get(p.id) || []), it]); continue; }
    const target = pool.find(x => !used.has(x.id) && same(x, it));
    const after = net(it, trip);
    if (!target) { rows.push({ id: it.id, kind: "new", cat: it.cat, items: [it], choices: CHOICES.new, choice: DEFAULT.new, after }); continue; }
    used.add(target.id);
    const before = net(target, trip);
    const kind: DiffKind = before === undefined || after === undefined || before === after ? "fill" : "replace";
    rows.push({ id: it.id, kind, cat: it.cat, items: [it], target, choices: CHOICES[kind], choice: DEFAULT[kind], before, after });
  }
  for (const [id, items] of pkgs) {
    const main = items.find(i => pkgOf(i)?.main) || items[0];
    rows.unshift({ id: `pkg:${id}`, kind: "new", cat: main.cat, items, choices: CHOICES.new, choice: DEFAULT.new, after: items.reduce((s, i) => s + (net(i, trip) || 0), 0) });
  }
  // nicht im Angebot: nur Kapitel, die das Angebot betrifft
  const cats = new Set(made.map(i => i.cat));
  for (const x of pool) if (cats.has(x.cat) && !used.has(x.id)) rows.push({ id: x.id, kind: "missing", cat: x.cat, items: [], target: x, choices: CHOICES.missing, choice: DEFAULT.missing, before: net(x, trip) });
  return rows;
}

/** gibt es etwas abzuwägen? Nur neue Posten: direkt übernehmen */
export const needsReview = (rows: DiffRow[]) => rows.some(r => r.kind !== "new");

/** gewählte Änderungen anwenden; gibt die Posten zurück, die neu sind oder etwas bekommen haben */
export function applyDiff(trip: Trip, rows: DiffRow[]): Item[] {
  const out: Item[] = [];
  for (const r of rows) {
    const t = r.target ? trip.items.find(i => i.id === r.target!.id) : undefined;
    const opts = r.items.flatMap(i => i.options);
    if (r.kind === "new" && r.choice === "take") { trip.items.push(...r.items); out.push(...r.items); continue; }
    if (!t) continue;
    if (r.kind === "missing") { if (r.choice === "delete") trip.items = trip.items.filter(i => i.id !== t.id); continue; }
    if (r.choice === "keep" || r.choice === "skip") continue;
    if (r.choice === "replace") { t.options = opts; delete t.chosen; }
    else { t.options.push(...opts); if (r.choice === "take" && opts[0]) t.chosen = opts[0].id; }
    if (r.items[0]?.check) { t.check = true; if (r.items[0].checkWhy) t.checkWhy = r.items[0].checkWhy; }
    out.push(t);
  }
  return out;
}
