/*
 * Plausibilitätscheck vor dem Veröffentlichen (#643): rot = echter Datenfehler, blockiert; gelb = ungewöhnlich, aber
 * möglich, wird veröffentlicht und im Katalog gekennzeichnet (z. B. „Lange Fahrtage“). Nichts Besonderes wird pauschal
 * ausgeschlossen: Roadtrip, Camper und Reisen ohne Flug haben höhere Grenzen für Fahrtage.
 */
import { activeOption } from "../calc";
import { addDays, dayDiff, okDate } from "../calc/travel";
import { kmBetween } from "../geo/places";
import type { Item, Trip } from "../model";
import { ROAD_FACTOR, ROAD_KMH, withPauses } from "../road/trip";
import { privateWords } from "./fromTrip";
import type { CatalogEntry } from "./types";

export type CheckLevel = "red" | "yellow";
/** gelbe Hinweise, die auch im Katalog stehen */
export const PUBLIC_WARN = ["longDay", "veryLong", "gap", "noMove", "stayPrice"] as const;
export type WarnCode = (typeof PUBLIC_WARN)[number];
export type CheckCode = WarnCode | "noDest" | "noNights" | "backBefore" | "stayOutside" | "overlap" | "zeroPrice" | "contact" | "names" | "noTitle";
export interface Finding { level: CheckLevel; code: CheckCode; v?: Record<string, string | number>; itemId?: string; day?: number }

/** Fahrtag: so viele Stunden (mit Pausen) gelten als lang bzw. sehr lang; bei Roadtrip, Camper, ohne Flug höher */
export const DRIVE_H = { long: 6, very: 10 };
export const DRIVE_H_ROAD = { long: 9, very: 13 };
/** zwei Stationen so weit auseinander ohne Flug, Mietwagen, Auto oder Transport-Posten: weite Wege */
export const MOVE_KM = 150;
/** Unterkunft pro Person und Nacht außerhalb dieser Spanne (€): ungewöhnlicher Preis */
export const STAY_PPN = { lo: 8, hi: 450 };

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINK = /\b(?:https?:\/\/|www\.)\S+/i;
const PHONE = /(?:\+|\b0)\d[\d /-]{6,}\d/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const live = (trip: Trip) => trip.items.filter(i => i.status !== "dropped");
const stays = (trip: Trip) => live(trip).filter(i => i.cat === "stay" && okDate(i.from) && okDate(i.to));
const sameWho = (a: Item, b: Item) => !a.participants?.length || !b.participants?.length || a.participants.some(x => b.participants!.includes(x));

/** Fahrzeit einer Etappe in Stunden (Luftlinie × 1,3 bei 85 km/h, Pausen wie im Roadtrip) */
export const driveHours = (km: number) => withPauses((km * ROAD_FACTOR / ROAD_KMH) * 60) / 60;

export function checkTrip(trip: Trip, e: CatalogEntry): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);

  // Ziel und Dauer
  if (!e.stops.length || e.stops.every(s => !s.place.trim())) add({ level: "red", code: "noDest" });
  if (!(e.nights > 0)) add({ level: "red", code: "noNights" });

  // Flüge: Rückflug vor dem Hinflug
  for (const it of live(trip).filter(i => i.cat === "flights")) {
    const legs = activeOption(it, trip)?.legs || [];
    const outL = legs.find(l => l.dir === "out"), back = legs.find(l => l.dir === "back");
    if (outL?.dep && back?.dep && back.dep < outL.dep) add({ level: "red", code: "backBefore", itemId: it.id });
  }

  // Unterkünfte: im Reisezeitraum, keine zwei am selben Abend für dieselben Leute
  const st = stays(trip);
  const first = okDate(trip.from) ? trip.from! : undefined, last = okDate(trip.to) ? trip.to! : undefined;
  for (const s of st) if ((first && s.from! < first) || (last && s.to! > last) || s.to! <= s.from!) add({ level: "red", code: "stayOutside", itemId: s.id });
  for (let i = 0; i < st.length; i++) for (let j = i + 1; j < st.length; j++) {
    const a = st[i], b = st[j];
    if (a.from! < b.to! && b.from! < a.to! && sameWho(a, b)) add({ level: "red", code: "overlap", itemId: b.id });
  }

  // Preise: keine 0 € oder negativ (außer privat bzw. schon vorhanden); Unterkunft pro Person und Nacht in üblicher Spanne
  for (const c of e.costs) if (c.pp < 0 || (c.pp === 0 && c.cat !== "stay" && !c.auto)) add({ level: "red", code: "zeroPrice" });
  for (const s of st.filter(x => !x.private)) {
    const o = activeOption(s, trip);
    if (o && (o.price.adult === 0 || o.price.unit === 0)) add({ level: "red", code: "zeroPrice", itemId: s.id });
  }
  for (const c of e.costs.filter(x => x.cat === "stay" && x.nights && x.pp > 0)) {
    const ppn = c.pp / c.nights!;
    if (ppn < STAY_PPN.lo || ppn > STAY_PPN.hi) { add({ level: "yellow", code: "stayPrice", v: { v: Math.round(ppn) } }); break; }
  }

  // Nächte ohne Unterkunft (Kreuzfahrt, Camper und Nachtflug zählen als Übernachtung)
  if (first && last && !trip.camper && !live(trip).some(i => i.cruise)) {
    const covered = new Set<string>();
    for (const s of st) for (let d = s.from!; d < s.to!; d = addDays(d, 1)) covered.add(d);
    for (const it of live(trip).filter(i => i.cat === "flights")) for (const l of activeOption(it, trip)?.legs || []) {
      if (l.dep && l.arr && l.arr.slice(0, 10) > l.dep.slice(0, 10)) covered.add(l.dep.slice(0, 10));
    }
    if (st.length) for (let d = first; d < last; d = addDays(d, 1)) {
      if (!covered.has(d)) { add({ level: "yellow", code: "gap", day: dayDiff(first, d) + 1 }); break; }
    }
  }

  // Wege zwischen den Stationen: lange Fahrtage, weite Wege ohne Verkehrsmittel
  const road = e.kind === "road" || !!e.noFly || !!trip.camper;
  const lim = road ? DRIVE_H_ROAD : DRIVE_H;
  const hasWheels = live(trip).some(i => i.cat === "transport" || i.rental || i.hint === "rental" || i.hint === "road:car") || !!trip.camper;
  let worst = null as Finding | null;
  e.stops.forEach((s, i) => {
    if (!i) return;
    const p = e.stops[i - 1];
    if (s.lat == null || s.lon == null || p.lat == null || p.lon == null || s.by === "plane" || s.by === "ship") return;
    const km = kmBetween({ lat: p.lat, lon: p.lon }, { lat: s.lat, lon: s.lon });
    if (km > MOVE_KM && !hasWheels && !s.by) add({ level: "yellow", code: "noMove", v: { a: p.place, b: s.place, km: Math.round(km) } });
    const h = driveHours(km);
    const code = h > lim.very ? "veryLong" : h > lim.long ? "longDay" : null;
    if (code && (!worst || (code === "veryLong" && worst.code === "longDay"))) worst = { level: "yellow", code, v: { a: p.place, b: s.place, h: Math.round(h * 10) / 10 } };
  });
  if (worst) add(worst);

  // Texte: keine Kontaktdaten oder Links (rot), keine Namen der Reisenden (gelb)
  const text = [e.title, e.summary || ""].join("\n");
  if (EMAIL.test(text) || LINK.test(text) || PHONE.test(text)) add({ level: "red", code: "contact" });
  const words = privateWords(trip).filter(w => w.trim().length >= 3);
  if (words.some(w => new RegExp(`(^|[^\\p{L}])${esc(w.trim())}($|[^\\p{L}])`, "iu").test(text))) add({ level: "yellow", code: "names" });

  return out;
}

export const blocked = (fs: Finding[]) => fs.some(f => f.level === "red");
/** gelbe Hinweise für den Katalog (ohne „Namen“, das betrifft nur den Ersteller) */
export const publicWarn = (fs: Finding[]): WarnCode[] =>
  [...new Set(fs.filter(f => f.level === "yellow" && (PUBLIC_WARN as readonly string[]).includes(f.code)).map(f => f.code as WarnCode))];
