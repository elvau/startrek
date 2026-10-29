/*
 * Verpflegung wie im Artefakt: Tagessatz pro Erwachsenem aus dem Essensstil, aus den Länderdaten
 * (Pakete mit echten Richtwerten, sonst Schätzung nach Preisniveau), je Familie für die Tage vor Ort.
 * Die Posten „Verpflegung …“ im Kapitel Sonstiges werden daraus automatisch gesetzt.
 */
import { t, tn, type Key } from "./i18n/index.svelte";
import { hhKey, isActive, isDetailed, uid, type Board, type FoodCfg, type FoodStyle, type Item, type Trip } from "./model";
import { activeOption, presences } from "./calc";
import { nightsList, okDate } from "./calc/travel";
import { ccOf, findCity, type GeoData } from "./geo/places";

/** Essensstil mit Namen und Beschreibung in der gewählten Sprache (Getter: folgt dem Sprachwechsel) */
const style = (k: FoodStyle) => ({ k, get l() { return t(`food.style.${k}.l` as Key); }, get d() { return t(`food.style.${k}.d` as Key); } });

export const FOOD_STYLES: { k: FoodStyle; readonly l: string; readonly d: string }[] = [
  style("self"), style("mix"), style("out"), style("treat"), style("hb"), style("ai")
];
/** Deutschland als Maßstab (Preisniveau 1), € pro Erwachsenem und Tag */
/** Halbpension: nur Mittagessen und Kleinigkeiten, All-inclusive: nur Kleinigkeiten unterwegs (Rest steckt in der Unterkunft) */
export const FOOD_DE: Record<FoodStyle, number> = { self: 20, mix: 35, out: 55, treat: 85, hb: 15, ai: 5 };

export const foodCfg = (trip: Trip): Required<Pick<FoodCfg, "style" | "child" | "infant">> & FoodCfg =>
  ({ style: "mix", child: 50, infant: 25, ...(trip.food || {}) });

/** Tagessatz in € pro Erwachsenem: Länderpaket (mit Ortsfaktor), sonst Deutschland × Preisniveau^0,7 */
export function foodRate(g: GeoData, trip: Trip, k: FoodStyle): { eur: number; note: string; est: boolean } {
  const cc = ccOf(g, trip.country);
  const pack = cc ? g.packs[cc] : undefined;
  const w = cc ? g.world.find(x => x.k === cc) : undefined;
  const style = FOOD_STYLES.find(s => s.k === k)!;
  if (pack?.food?.[k]) {
    const city = trip.place ? findCity(g, trip.place, cc) : null;
    const fac = city ? pack.cities.find(c => c.n === city.name)?.food || 1 : 1;
    const toEur = !pack.cur || pack.cur === "EUR" ? 1 : 1 / (w?.rate || 1);
    return { eur: Math.round(pack.food[k] * fac * toEur), note: pack.foodNote?.[k] || style.d, est: false };
  }
  return { eur: Math.round(FOOD_DE[k] * Math.pow(w?.pli || 1, 0.7)), note: style.d, est: true };
}

/** Tage mit gleicher Verpflegung (Rundreise, #596): Stil, Verpflegung der Unterkunft, Tagessatz pro Erwachsenem */
export interface FoodPart { style: FoodStyle; board?: Board; days: number; eur: number; place?: string }

export interface FoodRow {
  hh: string; ids: string[]; days: number; style: FoodStyle; own: boolean; eur: number; note: string; est: boolean;
  /** Verpflegung laut Unterkunft, nach der sich der Stil richtet (ohne eigene Wahl der Familie) */
  board?: Board;
  /** je nach Unterkunft verschieden (Rundreise): die Teile; eur ist dann der Durchschnitt pro Tag */
  parts?: FoodPart[];
}

/** Unterkunft mit Verpflegung → Stil: Halbpension nur noch mittags, Voll/All-inclusive nur Kleinigkeiten */
const BOARD_STYLE: Partial<Record<Board, FoodStyle>> = { half: "hb", full: "ai", all: "ai" };
/** Frühstück inklusive: gut ein Fünftel weniger */
const BREAKFAST = 0.8;

/** Verpflegung der Unterkunft, in der diese Familie schläft (erste passende, gewählte Unterkunft) */
export function boardFor(trip: Trip, ids: string[]): Board | undefined {
  if (!isDetailed(trip, "stay")) return undefined;
  for (const it of trip.items) {
    if (it.cat !== "stay" || it.status === "dropped" || (it.participants && !it.participants.some(id => ids.includes(id)))) continue;
    // Kreuzfahrt (#520): Vollpension an Bord, sonst rechnete der Vergleich mit Land das Essen doppelt
    const b = it.cruise ? "full" : activeOption(it, trip)?.stay?.board;
    if (b) return b;
  }
  return undefined;
}

const boardOf = (it: Item, trip: Trip): Board | undefined => (it.cruise ? "full" : activeOption(it, trip)?.stay?.board);
/** Ort der Unterkunft (aus der Suche bzw. privat) für den Tagessatz je Station */
function placeOf(it: Item, trip: Trip): At | undefined {
  const q = activeOption(it, trip)?.query?.place ? activeOption(it, trip)!.query! : it.private;
  return q?.place?.trim() ? { place: q.place.trim(), ...(q.country ? { country: q.country } : {}) } : undefined;
}
interface At { place: string; country?: string }
export interface Night { board?: Board; at?: At }

/**
 * Je Nacht (#596): die Unterkunft mit Zeitraum, in der die Familie schläft, mit Verpflegung und Ort; Nächte ohne solche
 * Unterkunft wie bisher nach der ersten Unterkunft ohne Zeitraum mit Verpflegungsangabe (Ort: der der Reise).
 */
export function staysByNight(trip: Trip, ids: string[], nights: string[]): Night[] {
  const stays = trip.items.filter(it => it.cat === "stay" && it.status !== "dropped" && (!it.participants || it.participants.some(id => ids.includes(id))));
  const dated = stays.filter(it => okDate(it.from) && okDate(it.to) && it.to! > it.from!);
  const boards = isDetailed(trip, "stay");
  const rest = boards ? stays.filter(it => !dated.includes(it)).map(it => boardOf(it, trip)).find(b => !!b) : undefined;
  return nights.map(n => {
    const s = dated.find(it => it.from!.slice(0, 10) <= n && n < it.to!.slice(0, 10));
    const at = s ? placeOf(s, trip) : undefined;
    const board = boards ? (s ? boardOf(s, trip) : rest) : undefined;
    return { ...(board ? { board } : {}), ...(at ? { at } : {}) };
  });
}

/** „11 Tage Gemischt, 6 Tage Frühstück (Berat), 3 Tage Halbpension“; Orte nur, wenn sie sich unterscheiden */
export function partsText(parts: FoodPart[]): string {
  const places = new Set(parts.map(p => p.place || ""));
  return parts.map(p => `${tn("n.days", p.days)} ${p.board && p.board !== "self" ? t(`board.${p.board}` as Key) : FOOD_STYLES.find(s => s.k === p.style)!.l}${places.size > 1 && p.place ? ` (${p.place})` : ""}`).join(", ");
}

/**
 * je Familie: Tage vor Ort, sonst Reisetage. An- und Abreisetag zählen je einen halben Tag (man isst dort meist nur
 * einmal), also so viele Tage wie Nächte; ein Tagesausflug ohne Übernachtung zählt einen Tag.
 * Tagessatz je Nacht nach Verpflegung und Ort der Unterkunft (Rundreise über mehrere Länder), sonst nach dem Ziel der Reise.
 */
const mealDays = (nights: number) => Math.max(1, nights);
export function foodPlan(trip: Trip, g: GeoData): FoodRow[] {
  const cfg = foodCfg(trip);
  const pres = presences(trip);
  const act = trip.travelers.filter(isActive);
  const tripDays = okDate(trip.from) && okDate(trip.to) ? mealDays(nightsList(trip.from, trip.to).length) : 0;
  // Ort → Land (Code) und Stadt; ohne erkennbares Land das der Reise
  const tripCc = ccOf(g, trip.country);
  const locs = new Map<string, { trip: Trip; label: string }>();
  const locOf = (at?: At) => {
    if (!at) return { key: "", trip, label: "" };
    const k = `${at.place}|${at.country || ""}`;
    if (!locs.has(k)) {
      const cc = ccOf(g, at.country) || findCity(g, at.place)?.cc || tripCc;
      locs.set(k, { trip: { ...trip, place: at.place, country: cc || trip.country }, label: at.place.split(",")[0].trim() });
    }
    return { key: k, ...locs.get(k)! };
  };
  const rates = new Map<string, ReturnType<typeof foodRate>>();
  const rateOf = (k: FoodStyle, at?: At) => {
    const l = locOf(at), key = `${k}|${l.key}`;
    if (!rates.has(key)) rates.set(key, foodRate(g, l.trip, k));
    return rates.get(key)!;
  };
  return [...new Set(act.map(hhKey))].map((hh): FoodRow => {
    const ids = act.filter(t => hhKey(t) === hh).map(t => t.id);
    // Nächte der Familie: die des Längsten vor Ort, sonst die der Reise
    const lists = ids.map(id => pres[id]).filter(p => !!p).map(p => nightsList(p!.a, p!.d));
    const nights = lists.length ? lists.reduce((a, b) => (b.length > a.length ? b : a)) : nightsList(trip.from, trip.to);
    const days = lists.length || tripDays ? mealDays(nights.length) : 0;
    const own = cfg.hh?.[hh];
    // eigene Wahl der Familie > Verpflegung der Unterkunft (je Nacht) > Stil für alle; Ort zählt immer
    const per: Night[] = nights.length ? staysByNight(trip, ids, nights) : [{ board: boardFor(trip, ids) }];
    const parts: FoodPart[] = [];
    let est = false;
    for (const n of per) {
      const b = own ? undefined : n.board;
      const style = own || (b && BOARD_STYLE[b]) || cfg.style;
      const board = b && b !== "self" ? b : undefined;
      const r = rateOf(style, n.at);
      est ||= r.est;
      const eur = board === "breakfast" ? Math.round(r.eur * BREAKFAST) : r.eur;
      const label = locOf(n.at).label || undefined;
      // gleicher Stil, gleiche Verpflegung und gleicher Satz: ein Teil (Ort nur, wenn überall derselbe)
      const p = parts.find(x => x.style === style && x.board === board && x.eur === eur);
      if (p) { p.days++; if (p.place !== label) p.place = undefined; }
      else parts.push({ style, ...(board ? { board } : {}), days: 1, eur, ...(label ? { place: label } : {}) });
    }
    // eine Verpflegung: alle Tage; sonst die Tage je Teil
    if (parts.length === 1) parts[0].days = days;
    const one = parts.length === 1 ? parts[0] : null;
    const style = one ? one.style : own || cfg.style;
    const total = parts.reduce((a, p) => a + p.eur * p.days, 0);
    return {
      hh, ids, days, style, own: !!own, note: rateOf(style).note, est,
      eur: one ? one.eur : Math.round(total / Math.max(1, days)),
      ...(one?.board ? { board: one.board } : {}),
      ...(one ? {} : { parts: parts.sort((a, b) => b.days - a.days) })
    };
  }).filter(r => r.days > 0);
}

/** Familien mit gleichem Stil, Tagen und Satz zusammen: ein Posten statt einer für jede (Gruppe mit 15 Personen: einer) */
export interface FoodGroup extends Omit<FoodRow, "hh"> { key: string; hhs: string[] }
export function foodGroups(rows: FoodRow[]): FoodGroup[] {
  const map = new Map<string, FoodGroup>();
  for (const r of rows) {
    const k = [r.style, r.eur, r.days, r.board || "", r.own ? "own" : "", (r.parts || []).map(p => `${p.style}:${p.board || ""}:${p.days}:${p.eur}`).join(",")].join("|");
    const g = map.get(k);
    if (g) { g.hhs.push(r.hh); g.ids.push(...r.ids); }
    else { const { hh, ...rest } = r; map.set(k, { ...rest, ids: [...r.ids], key: k, hhs: [hh] }); }
  }
  // Schlüssel des Postens: die Familien darin (bleibt stabil, solange sich die Zusammensetzung nicht ändert)
  return [...map.values()].map(g => ({ ...g, key: g.hhs.length === rows.length && rows.length > 1 ? "*" : g.hhs.join("|") }));
}
/** Name des Postens: „Verpflegung“ (alle), „Verpflegung Klein“ (eine Familie), „Verpflegung (3 Familien)“ */
export function foodGroupName(g: FoodGroup, all: number): string {
  if (g.hhs.length === 1) return t("food.itemName", { hh: g.hhs[0] });
  return g.hhs.length === all ? t("food.itemAll") : t("food.itemSome", { n: g.hhs.length });
}

/** Posten „Verpflegung …“ angleichen; schreibt nur bei echten Änderungen (sonst Endlosschleife im Effekt) */
export function syncFood(trip: Trip, g: GeoData): boolean {
  const cfg = foodCfg(trip);
  const before = JSON.stringify(trip.items.filter(i => i.auto === "food"));
  if (!cfg.on) {
    if (trip.items.some(i => i.auto === "food")) { trip.items = trip.items.filter(i => i.auto !== "food"); return true; }
    return false;
  }
  const rows = foodPlan(trip, g);
  const groups = foodGroups(rows);
  const keep = new Set<string>();
  for (const r of groups) {
    let it = trip.items.find(i => i.auto === "food" && i.hh === r.key);
    const style = FOOD_STYLES.find(s => s.k === r.style)!;
    const want = {
      name: foodGroupName(r, rows.length), participants: r.ids,
      label: style.l, detail: `${r.parts ? `${t("food.byStays", { list: partsText(r.parts) })}. ` : r.board ? `${t("food.byStay", { b: t(`board.${r.board}` as Key) })}. ` : ""}${r.note}. ${r.est ? t("food.detailEst", { c: cfg.child, i: cfg.infant }) : t("food.detail", { c: cfg.child, i: cfg.infant })}`,
      price: { mode: "person" as const, currency: "EUR", adult: r.eur, child: Math.round(r.eur * cfg.child / 100), infant: Math.round(r.eur * cfg.infant / 100), qty: r.days }
    };
    if (!it) {
      it = { id: uid(), cat: "misc", auto: "food", hh: r.key, name: want.name, status: "idea", options: [{ id: uid(), label: "", price: { mode: "person", currency: "EUR" } }] } as Item;
      trip.items.push(it);
    }
    keep.add(it.id);
    const o = it.options[0];
    if (it.name !== want.name) it.name = want.name;
    if (JSON.stringify(it.participants) !== JSON.stringify(want.participants)) it.participants = want.participants;
    if (o.label !== want.label) o.label = want.label;
    if (o.detail !== want.detail) o.detail = want.detail;
    if (JSON.stringify(o.price) !== JSON.stringify(want.price)) o.price = want.price;
  }
  if (trip.items.some(i => i.auto === "food" && !keep.has(i.id))) trip.items = trip.items.filter(i => i.auto !== "food" || keep.has(i.id));
  return JSON.stringify(trip.items.filter(i => i.auto === "food")) !== before;
}
