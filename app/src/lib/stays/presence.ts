/*
 * Unterkunft aus der Anwesenheit (wie im Artefakt): wer ist wann vor Ort, laut Flügen oder eigenen Daten,
 * welche Nächte haben noch kein Bett, und wer schläft in einem Zeitraum wo.
 */
import { t } from "../i18n/index.svelte";
import { hhKey, isActive, type Item, type Traveler, type Trip } from "../model";
import { activeOption, participantsOf, presences } from "../calc";
import { addDays, flightLegs, needs, nightsList, okDate, type Presence } from "../calc/travel";
import { dayShort, time } from "../format";

/** Personen mit gleicher An- und Abreise in einem Haushalt */
export interface Arrival {
  hh: string;
  /** Haushaltsname, wenn alle der Familie so reisen, sonst die Vornamen */
  who: string;
  ids: string[];
  p: Presence | null;
  /** Landung am Ziel und Abflug zurück (ISO lokal), nur aus Flügen */
  arr?: string;
  dep?: string;
  /** Ankunfts- und Abflughafen am Ziel */
  arrAp?: string;
  depAp?: string;
}

const stayItems = (trip: Trip) =>
  trip.items.filter(it => it.cat === "stay" && it.status !== "dropped" && okDate(it.from) && okDate(it.to) && it.to! > it.from!);

/** Landung und Rückflug einer Person aus ihrem Flug */
function flightTimes(t: Traveler, trip: Trip): Pick<Arrival, "arr" | "dep" | "arrAp" | "depAp"> {
  const { out, back } = flightLegs(t, trip, it => activeOption(it, trip));
  return { arr: out?.arr || undefined, dep: back?.dep || undefined, arrAp: out?.to || undefined, depAp: back?.from || undefined };
}

export function arrivals(trip: Trip): Arrival[] {
  const pres = presences(trip);
  const act = trip.travelers.filter(isActive);
  const map = new Map<string, Arrival>();
  for (const t of act) {
    const p = pres[t.id];
    const ft = p?.src === "flight" ? flightTimes(t, trip) : {};
    const k = [hhKey(t), p?.a, p?.d, ft.arr, ft.dep, ft.arrAp, ft.depAp].join("|");
    if (!map.has(k)) map.set(k, { hh: hhKey(t), who: "", ids: [], p, ...ft });
    map.get(k)!.ids.push(t.id);
  }
  const size = (h: string) => act.filter(t => hhKey(t) === h).length;
  return [...map.values()].map(a => ({ ...a, who: a.ids.length === size(a.hh) ? a.hh : a.ids.map(id => act.find(t => t.id === id)!.name).join(", ") }))
    .sort((a, b) => (a.p?.a || "~").localeCompare(b.p?.a || "~"));
}

/** Hinweise zu An- und Abreise: Check-in, Check-out, sehr früher Abflug (mit Art, damit die Oberfläche filtern kann) */
export function hintList(a: Arrival): { kind: "checkin" | "checkout" | "early"; text: string }[] {
  const out: { kind: "checkin" | "checkout" | "early"; text: string }[] = [];
  const h = (s: string) => +s.slice(11, 13) + +s.slice(14, 16) / 60;
  if (a.arr && a.arr.length >= 16 && h(a.arr) < 14) out.push({ kind: "checkin", text: t("hint.checkin", { day: dayShort(a.arr), time: time(a.arr) }) });
  if (a.dep && a.dep.length >= 16) {
    const d = h(a.dep);
    if (d >= 15) out.push({ kind: "checkout", text: t("hint.checkout", { day: dayShort(a.dep), time: time(a.dep), h: Math.round(d - 11) }) });
    else if (d < 9) out.push({ kind: "early", text: t("hint.early", { day: dayShort(a.dep), time: time(a.dep) }) });
  }
  return out;
}
export const hints = (a: Arrival): string[] => hintList(a).map(x => x.text);

/** Zeitraum, in dem jemand vor Ort ist (erste Ankunft bis letzte Abreise); sonst Reisedaten */
export function stayWindow(trip: Trip, ids?: string[]): { from: string; to: string } | null {
  const pres = presences(trip);
  const ps = trip.travelers.filter(t => isActive(t) && (!ids || ids.includes(t.id))).map(t => pres[t.id]).filter(Boolean) as Presence[];
  if (ps.length) return { from: ps.map(p => p.a).sort()[0], to: ps.map(p => p.d).sort().at(-1)! };
  return okDate(trip.from) && okDate(trip.to) && trip.to > trip.from ? { from: trip.from, to: trip.to } : null;
}

/** Wer in diesem Zeitraum eine Unterkunft braucht, mit Zahl der Nächte (ohne Anwesenheit: alle Nächte) */
export function guestsIn(trip: Trip, from: string, to: string, ids?: string[]): { t: Traveler; nights: number }[] {
  const pres = presences(trip);
  const ns = nightsList(from, to);
  return trip.travelers.filter(t => isActive(t) && (!ids || ids.includes(t.id)))
    .map(t => ({ t, nights: ns.filter(x => needs(pres[t.id], x)).length }))
    .filter(g => g.nights > 0);
}

export interface Gap { from: string; to: string; nights: number; ids: string[]; who: string }

/** Nächte ohne Unterkunft, zusammengefasst nach gleichem Zeitraum (nur wer bekannte Anwesenheit hat) */
export function gaps(trip: Trip): Gap[] {
  const pres = presences(trip);
  const stays = stayItems(trip);
  const act = trip.travelers.filter(isActive);
  const map = new Map<string, Gap>();
  for (const t of act) {
    const p = pres[t.id];
    if (!p) continue;
    let start = "";
    const ns = nightsList(p.a, p.d);
    ns.forEach((x, i) => {
      const covered = stays.some(s => s.from! <= x && x < s.to! && participantsOf(s, trip).some(g => g.id === t.id));
      if (!covered && !start) start = x;
      const endHere = start && (covered || i === ns.length - 1);
      if (endHere) {
        const to = covered ? x : addDays(x, 1);
        const k = start + "|" + to;
        if (!map.has(k)) map.set(k, { from: start, to, nights: nightsList(start, to).length, ids: [], who: "" });
        map.get(k)!.ids.push(t.id);
        start = "";
      }
    });
  }
  const size = (h: string) => act.filter(t => hhKey(t) === h).length;
  return [...map.values()].map(g => {
    const byHh = new Map<string, Traveler[]>();
    g.ids.forEach(id => { const t = act.find(x => x.id === id)!; byHh.set(hhKey(t), [...(byHh.get(hhKey(t)) || []), t]); });
    const who = [...byHh].map(([h, ts]) => (ts.length === size(h) ? h : ts.map(t => t.name).join(", "))).join(", ");
    return { ...g, who };
  }).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** Suche für einen Posten: dessen Zeitraum und Beteiligte */
export const itemScope = (it: Item) => ({ from: it.from, to: it.to, ids: it.participants });
