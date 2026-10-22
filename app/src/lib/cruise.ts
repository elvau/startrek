/*
 * Kreuzfahrt (#516): Posten im Kapitel Unterkunft mit Route (Häfen, Seetage) und Kabinen.
 * Zeitraum aus Ein- und Ausschiffung, Teilnehmende aus den Kabinen; jede Kabine kostet die Personen darin.
 */
import { hhKey, isActive, uid, type Cabin, type CabinType, type Cruise, type CruiseRoute, type Item, type Option, type Port, type ShoreBuffer, type Traveler, type Trip } from "./model";
import { okDate } from "./calc/travel";
import { autoName, t } from "./i18n/index.svelte";

export const isCruise = (it: Item) => !!it.cruise;

/** höchstens so viele Personen schlägt die App je Kabine vor */
export const CABIN_MAX = 4;

export const CABIN_ICON: Record<CabinType, string> = { inside: "🛏", outside: "🪟", balcony: "🌅", suite: "👑" };

/** Preis einer Kabine für die ganze Fahrt (Währung des Angebots) */
export const cabinTotal = (c: Cabin) => (c.per === "person" ? (c.price || 0) * c.who.length : c.price || 0);
export const cabinsTotal = (cs: Cabin[] | undefined) => (cs || []).reduce((a, c) => a + cabinTotal(c), 0);

/** Kabinen nach Familien: je Familie eine Kabine, große Familien auf mehrere verteilt (höchstens CABIN_MAX, gleichmäßig) */
export function suggestCabins(people: Traveler[], type: CabinType = "inside"): Cabin[] {
  const byHh = new Map<string, Traveler[]>();
  for (const t of people) byHh.set(hhKey(t), [...(byHh.get(hhKey(t)) || []), t]);
  const out: Cabin[] = [];
  for (const ts of byHh.values()) {
    const k = Math.ceil(ts.length / CABIN_MAX), size = Math.ceil(ts.length / k);
    for (let i = 0; i < ts.length; i += size) out.push({ id: uid(), type, price: 0, who: ts.slice(i, i + size).map(t => t.id) });
  }
  return out;
}

/** das Angebot, nach dem sich Teilnehmende richten: gewähltes, sonst das erste */
const mainOption = (it: Item): Option | undefined => it.options.find(o => o.id === it.chosen) || it.options[0];

/** aktive Reisende ohne Kabine im Angebot */
export const withoutCabin = (opt: Option | undefined, trip: Trip): Traveler[] => {
  const ins = new Set((opt?.cabins || []).flatMap(c => c.who));
  return trip.travelers.filter(t => isActive(t) && !ins.has(t.id));
};

/**
 * Nach Änderungen abgleichen: Zeitraum aus erstem und letztem Hafen, Pauschalpreis je Angebot = Summe der Kabinen
 * (für Vergleich und Anzeige), Teilnehmende aus den Kabinen des gewählten Angebots.
 */
export function syncCruise(it: Item) {
  const c = it.cruise;
  if (!c) return;
  swapRoute(it, c);
  const ps = c.ports.filter(p => okDate(p.date));
  if (ps.length) {
    const a = ps[0].date, b = ps[ps.length - 1].date;
    if (it.from !== a) it.from = a;
    if (b > a && it.to !== b) it.to = b;
  }
  for (const o of it.options) {
    if (!o.cabins) continue;
    const sum = Math.round(cabinsTotal(o.cabins) * 100) / 100;
    if (o.price.mode !== "unit") o.price.mode = "unit";
    if (o.price.basis !== "stay") o.price.basis = "stay";
    if (o.price.unit !== sum) o.price.unit = sum;
  }
  const who = [...new Set((mainOption(it)?.cabins || []).flatMap(x => x.who))];
  const cur = it.participants;
  if (!who.length) { if (cur) it.participants = undefined; return; }
  if (!cur || cur.length !== who.length || who.some(id => !cur.includes(id))) it.participants = who;
}

/*
 * Mehrere Fahrten an einem Posten (#520): jedes Angebot kann eine eigene Route haben (Option.cruise). Item.cruise zeigt
 * immer die des gewählten; wird ein anderes gewählt, geht die bisherige Route an ihr Angebot zurück und die neue wird
 * geladen. Angebote ohne eigene Route behalten die bisherige (eine Fahrt mit mehreren Preisen).
 */
const routeOf = (c: Cruise): CruiseRoute => JSON.parse(JSON.stringify({ ...(c.line ? { line: c.line } : {}), ...(c.ship ? { ship: c.ship } : {}), ports: c.ports }));
function swapRoute(it: Item, c: Cruise) {
  const main = mainOption(it);
  if (!main || c.opt === main.id) return;
  const prev = c.opt ? it.options.find(o => o.id === c.opt) : undefined;
  if (prev) prev.cruise = routeOf(c);
  if (main.cruise) {
    const r = main.cruise;
    c.line = r.line; c.ship = r.ship; c.ports = JSON.parse(JSON.stringify(r.ports));
    if (!c.line) delete c.line;
    if (!c.ship) delete c.ship;
  }
  c.opt = main.id;
}

/** Route eines Angebots: eigene, beim gewählten bzw. ohne eigene die des Postens */
export function optRoute(it: Item, o: Option): CruiseRoute {
  const c = it.cruise || { ports: [] };
  if (o.cruise && o.id !== (c.opt || mainOption(it)?.id)) return o.cruise;
  return { ...(c.line ? { line: c.line } : {}), ...(c.ship ? { ship: c.ship } : {}), ports: c.ports };
}

export interface CruiseFacts { line?: string; ship?: string; from?: string; to?: string; nights: number; harbours: number; sea: number; first?: string; last?: string; route: string }
/** Eckdaten eines Angebots für den Vergleich: Nächte, Häfen (ohne Ein- und Ausschiffung), Seetage, Route als Zeile */
export function cruiseFacts(it: Item, o: Option): CruiseFacts {
  const r = optRoute(it, o);
  const dated = r.ports.filter(p => okDate(p.date)).map(p => p.date).sort();
  const named = r.ports.filter(p => !p.sea && p.place?.trim()).map(p => p.place!.trim());
  const from = dated[0], to = dated[dated.length - 1];
  const nights = from && to && to > from ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) : 0;
  const names = named.filter((n, i) => i === 0 || n !== named[i - 1]);
  return { ...(r.line ? { line: r.line } : {}), ...(r.ship ? { ship: r.ship } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), nights,
    harbours: Math.max(0, named.length - 2), sea: r.ports.filter(p => p.sea).length, first: names[0], last: names[names.length - 1], route: names.join(" → ") };
}

/** neue Kreuzfahrt: Ein- und Ausschiffung am Anfang und Ende der Reise, Kabinen nach Familien */
export function newCruise(trip: Trip, currency: string): Item {
  const people = trip.travelers.filter(isActive);
  const opt: Option = { id: uid(), label: "", price: { mode: "unit", basis: "stay", currency, unit: 0 }, cabins: suggestCabins(people) };
  const it: Item = {
    id: uid(), cat: "stay", name: t("cr.new"), status: "idea", icon: "ship", options: [opt],
    cruise: { ports: [{ date: trip.from || "" }, { date: trip.to || "" }] }
  };
  syncCruise(it);
  return it;
}

/** Überschrift: eigener Name, sonst „Kreuzfahrt ab Barcelona“, sonst „Neue Kreuzfahrt“ */
export function cruiseTitle(it: Item): string {
  const n = autoName(it.name);
  if (n && n !== t("cr.new")) return n;
  const first = portsOf(it)[0]?.place?.trim();
  return first ? t("cr.from", { place: first }) : t("cr.new");
}

/** Häfen ohne Seetage, in Reihenfolge */
export const portsOf = (it: Item): Port[] => (it.cruise?.ports || []).filter(p => !p.sea && p.place?.trim());

/** Route als Zeile: „Barcelona → Palermo → …“ (gleiche Häfen hintereinander nur einmal) */
export function routeLine(it: Item, arrow = "→"): string {
  const names = portsOf(it).map(p => p.place!.trim());
  return names.filter((n, i) => i === 0 || n !== names[i - 1]).join(` ${arrow} `);
}

/** Liegezeit „8–17“ bzw. „ab 17“ / „an 8“ (volle Stunden ohne :00) */
export function portTime(p: Port): { arr?: string; dep?: string } {
  const h = (x?: string) => (x && /^\d\d:\d\d$/.test(x) ? (x.endsWith(":00") ? String(Number(x.slice(0, 2))) : `${Number(x.slice(0, 2))}:${x.slice(3)}`) : undefined);
  return { arr: h(p.arr), dep: h(p.dep) };
}

/*
 * Landgang (#518): Zeitfenster je Hafen für Ausflüge. Puffer nach dem Anlegen (vom Schiff, Weg in die Stadt) und vor dem
 * Ablegen (meist 30–60 min vorher wieder an Bord, dazu der Rückweg).
 */
export const SHORE_AFTER = 60, SHORE_BEFORE = 90;
/** Puffer: an der Kreuzfahrt, sonst aus den Vorlieben, sonst Standard */
export const shoreBuffer = (c?: Cruise, prefs?: ShoreBuffer) => ({
  after: c?.shore?.after ?? prefs?.after ?? SHORE_AFTER, before: c?.shore?.before ?? prefs?.before ?? SHORE_BEFORE });
export interface Shore { place: string; date: string; arr?: string; dep?: string; start?: string; end?: string; minutes?: number; after: number; before: number }
const toMin = (x?: string) => (x && /^\d\d:\d\d$/.test(x) ? Number(x.slice(0, 2)) * 60 + Number(x.slice(3)) : null);
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function shoreOf(p: Port, buf = { after: SHORE_AFTER, before: SHORE_BEFORE }): Shore | null {
  if (p.sea || !p.place?.trim() || !okDate(p.date)) return null;
  const a = toMin(p.arr), d = toMin(p.dep);
  const s = a != null ? Math.min(a + buf.after, 24 * 60 - 1) : null, e = d != null ? Math.max(d - buf.before, 0) : null;
  return { place: p.place.trim(), date: p.date, ...(p.arr ? { arr: p.arr } : {}), ...(p.dep ? { dep: p.dep } : {}),
    ...(s != null ? { start: `${p.date}T${hhmm(s)}` } : {}), ...(e != null ? { end: `${p.date}T${hhmm(e)}` } : {}),
    ...(s != null && e != null ? { minutes: Math.max(0, e - s) } : {}), after: buf.after, before: buf.before };
}

/** Landgänge der Reise: Häfen zwischen Ein- und Ausschiffung (nicht verworfene Kreuzfahrten) */
export function shoresOf(trip: Trip, prefs?: ShoreBuffer): Shore[] {
  return trip.items.filter(i => i.cruise && i.status !== "dropped").flatMap(i => {
    const ps = i.cruise!.ports.filter(p => okDate(p.date)), buf = shoreBuffer(i.cruise, prefs);
    return ps.slice(1, -1).map(p => shoreOf(p, buf)).filter((x): x is Shore => !!x);
  });
}
export const shoreAt = (trip: Trip, place: string, date?: string, prefs?: ShoreBuffer) => (date ? shoresOf(trip, prefs).find(s => s.place === place && s.date === date) || null : null);
