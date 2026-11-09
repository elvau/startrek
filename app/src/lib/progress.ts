/*
 * Fortschritt der Reise (#151, Epic #671): Wie viel einer vollständigen Reise ist geplant? Gemessen an Bausteinen mit
 * festem Gewicht, nicht an den Posten, die schon da sind: Steht nur der Flug in der Reise, ist nur der Anteil der
 * Anreise erreicht. Anreise je Person und Richtung, Unterkunft je Person und Nacht, die übrigen Bausteine je Reise.
 * Stand der Posten: Idee 0 %, Gewählt 50 %, Gebucht und Bezahlt 100 %, Verworfen zählt nicht.
 * Einfacher Modus: ein Betrag je Bereich gilt als Schätzung (wie „Gewählt“).
 * Bausteine lassen sich als „nicht nötig“ ausschalten; ohne Übernachtung schaltet die App die Unterkunft selbst aus.
 */
import { activeOption, participantsOf } from "./calc";
import { airNights, nightsList, okDate } from "./calc/travel";
import { planPresences } from "./stays/presence";
import { hhKey, isActive, isDetailed, type CatKey, type Item, type ProgressBlock, type Status, type Trip } from "./model";

export const BLOCKS: ProgressBlock[] = ["travel", "stay", "transport", "attractions", "misc"];
/** Gewichte in Prozent; hier anpassen */
export const WEIGHTS: Record<ProgressBlock, number> = { travel: 40, stay: 30, transport: 10, attractions: 10, misc: 10 };
export const STATUS_W: Record<Status, number> = { idea: 0, chosen: 0.5, booked: 1, paid: 1, dropped: 0 };
/** Schätzung im einfachen Modus und automatische Verpflegung */
export const ESTIMATE_W = 0.5;
export const BLOCK_CAT: Record<ProgressBlock, CatKey> = { travel: "flights", stay: "stay", transport: "transport", attractions: "attractions", misc: "misc" };

/** was im Baustein noch fehlt (für den Text unter dem Balken) */
export type Missing =
  | { kind: "persons"; open: number; total: number }
  | { kind: "nights"; nights: number; persons: number }
  | { kind: "unbooked" }
  | { kind: "dates" }
  | { kind: "empty" }
  /** nur Ideen, noch nichts gewählt */
  | { kind: "idea" }
  | null;

export interface BlockState {
  k: ProgressBlock;
  /** Anteil am Ganzen in Prozent (nach dem Verteilen ausgeschalteter Bausteine), 0 wenn aus */
  w: number;
  /** abgedeckt, 0 bis 1 */
  done: number;
  /** ausgeschaltet: von Hand („Brauchen wir nicht“) bzw. von der App (keine Nacht) */
  off: "user" | "auto" | null;
  missing: Missing;
}

export interface Progress { pct: number; blocks: BlockState[] }

const live = (trip: Trip, cat: CatKey) => trip.items.filter(it => it.cat === cat && it.status !== "dropped");
const best = (items: Item[]) => items.reduce((m, it) => Math.max(m, STATUS_W[it.status]), 0);
/** einfacher Modus: Betrag für den Bereich oder einzelne Einträge */
const estimated = (trip: Trip, cat: CatKey) => (trip.simple?.[cat] ?? 0) > 0 || !!trip.lines?.some(l => l.cat === cat && l.amount > 0);

/** Anreise: je Person Hin und Zurück, jeweils der beste Stand der Posten, die diese Richtung abdecken */
function travel(trip: Trip): Pick<BlockState, "done" | "missing"> {
  const people = trip.travelers.filter(isActive);
  if (!people.length) return { done: 0, missing: { kind: "empty" } };
  const items = live(trip, "flights").filter(it => !it.auto);
  let sum = 0, open = 0, partial = 0;
  for (const t of people) {
    let out = 0, back = 0;
    for (const it of items) {
      if (!participantsOf(it, trip).some(p => p.id === t.id)) continue;
      const legs = activeOption(it, trip)?.legs || [];
      // ohne Flugdaten (Auto, Bahn, Posten mit Preis): gilt für Hin und Zurück
      const o = !legs.length || legs.some(l => l.dir === "out"), b = !legs.length || legs.some(l => l.dir === "back");
      const w = STATUS_W[it.status];
      if (o) out = Math.max(out, w);
      if (b) back = Math.max(back, w);
    }
    const s = (out + back) / 2;
    sum += s;
    if (s === 0) open++; else if (s < 1) partial++;
  }
  return { done: sum / people.length, missing: open ? { kind: "persons", open, total: people.length } : partial ? { kind: "unbooked" } : null };
}

/** Unterkunft: je Person und Nacht der beste Stand der Unterkünfte für diese Nacht; Nächte im Flugzeug zählen als abgedeckt */
function stay(trip: Trip): Pick<BlockState, "done" | "missing"> {
  const items = live(trip, "stay");
  const pres = planPresences(trip);
  const pick = (it: Item) => activeOption(it, trip);
  let all = 0, sum = 0;
  const openNights = new Set<string>(), openPeople = new Set<string>();
  let partial = false;
  for (const t of trip.travelers.filter(isActive)) {
    const p = pres[t.id];
    if (!p) continue;
    const air = p.src === "flight" ? airNights(t, trip, pick) : new Set<string>();
    const mine = items.filter(it => participantsOf(it, trip).some(g => g.id === t.id));
    for (const x of nightsList(p.a, p.d)) {
      all++;
      if (air.has(x)) { sum++; continue; }
      // Unterkunft ohne Zeitraum gilt für die ganze Reise
      const w = mine.reduce((m, it) => (!okDate(it.from) || !okDate(it.to) || (it.from! <= x && x < it.to!) ? Math.max(m, STATUS_W[it.status]) : m), 0);
      sum += w;
      if (w === 0) { openNights.add(x); openPeople.add(t.id); } else if (w < 1) partial = true;
    }
  }
  if (!all) {
    // ohne bekannte Nächte: nur am Stand der Posten
    const b = best(items);
    return { done: b, missing: b ? (b < 1 ? { kind: "unbooked" } : null) : items.length ? { kind: "idea" } : { kind: "dates" } };
  }
  return { done: sum / all, missing: openNights.size ? { kind: "nights", nights: openNights.size, persons: openPeople.size } : partial ? { kind: "unbooked" } : null };
}

/** Vor Ort, Erlebnisse, Sonstiges: mindestens ein Posten, der beste Stand zählt */
function simpleBlock(trip: Trip, cat: CatKey): Pick<BlockState, "done" | "missing"> {
  const items = live(trip, cat).filter(it => !it.auto);
  const d = best(items);
  return { done: d, missing: d === 0 ? { kind: items.length ? "idea" : "empty" } : d < 1 ? { kind: "unbooked" } : null };
}

/** keine Übernachtung (Tagesausflug): Unterkunft braucht es nicht */
export const noNights = (trip: Trip) => okDate(trip.from) && okDate(trip.to) && trip.to === trip.from;

export function progress(trip: Trip): Progress {
  const off = new Set(trip.progressOff || []);
  const raw = BLOCKS.map((k): BlockState => {
    const offBy = off.has(k) ? "user" : k === "stay" && noNights(trip) ? "auto" : null;
    const cat = BLOCK_CAT[k];
    let r: Pick<BlockState, "done" | "missing">;
    if (!isDetailed(trip, cat)) r = estimated(trip, cat) ? { done: ESTIMATE_W, missing: { kind: "unbooked" } } : { done: 0, missing: { kind: "empty" } };
    else r = k === "travel" ? travel(trip) : k === "stay" ? stay(trip) : simpleBlock(trip, cat);
    // Verpflegung zählt bei Sonstiges als Schätzung; ohne Reisedaten fehlt bei der Unterkunft zuerst der Zeitraum
    if (k === "misc" && trip.food?.on && r.done < ESTIMATE_W) r = { done: ESTIMATE_W, missing: { kind: "unbooked" } };
    if (k === "stay" && r.missing?.kind === "empty" && !(okDate(trip.from) && okDate(trip.to))) r = { ...r, missing: { kind: "dates" } };
    return { k, w: 0, off: offBy, ...r };
  });
  const total = raw.filter(b => !b.off).reduce((s, b) => s + WEIGHTS[b.k], 0) || 1;
  for (const b of raw) b.w = b.off ? 0 : (WEIGHTS[b.k] / total) * 100;
  const pct = raw.reduce((s, b) => s + b.w * Math.max(0, Math.min(1, b.done)), 0);
  // ganz fertig nur, wenn wirklich alles abgedeckt ist (nicht durch Rundung)
  return { pct: raw.every(b => b.off || b.done >= 1) ? 100 : Math.min(99, Math.floor(pct)), blocks: raw };
}

/** Familien ohne Wohnort (für „Startorte ergänzen“) */
export function homesMissing(trip: Trip): number {
  const keys = [...new Set(trip.travelers.filter(isActive).map(hhKey))];
  return keys.filter(k => !trip.households?.[k]?.geo).length;
}

/** Ziel und Zeitraum stehen */
export const hasDestDates = (trip: Trip) => !!trip.place?.trim() && okDate(trip.from) && okDate(trip.to);
