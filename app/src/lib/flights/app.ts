/* Flugsuche in der App: Anfrage aus der Reise, Ergebnis als Angebot in einen Flug-Posten */
import { t, tn } from "../i18n/index.svelte";
import { ageClass } from "../calc";
import { hhKey, isActive, uid, type FlightLeg, type Item, type Option, type Trip } from "../model";
import { dayShort, nights } from "../format";
import { accessFor, airportsOf, roadKm } from "../calc/travel";
import type { FlightOffer, FlightQuery, OfferLeg, SearchResult } from "./types";
import type { RoundTrip } from "./roundtrip";

/** Adresse des Such-Dienstes (Cloudflare Worker); leer: noch nicht eingerichtet */
export const FLIGHTS_URL = (import.meta.env.VITE_FLIGHTS_URL as string | undefined)?.replace(/\/$/, "") || "";

/** Personen der Reise für die Suche: Babys (unter 2, nur mit bekanntem Alter) auf dem Schoß, sonst Kinder mit Sitz */
export function passengers(trip: Trip, ids?: string[]): Pick<FlightQuery, "adults" | "children" | "infants"> {
  let adults = 0, children = 0, infants = 0;
  for (const t of flyers(trip, ids)) {
    const c = ageClass(t.age, trip.settings, t.kind);
    if (c === "adult") adults++;
    else if (t.age != null && (t.age as unknown) !== "" && t.age < 2) infants++;
    else children++;
  }
  return { adults: Math.max(1, adults), children, infants: Math.min(infants, Math.max(1, adults)) };
}

/** Wer fliegt: diese Personen (fehlt: alle, die dabei sind) */
export const flyers = (trip: Trip, ids?: string[]) => trip.travelers.filter(t => isActive(t) && (!ids || ids.includes(t.id)));

/** wer schon einen eigenen Flug-Posten hat (Posten ohne Beteiligte gelten für alle) */
export function covered(trip: Trip): Set<string> {
  const fl = trip.items.filter(i => i.cat === "flights" && i.status !== "dropped");
  if (fl.some(i => !i.participants)) return new Set(trip.travelers.map(t => t.id));
  return new Set(fl.flatMap(i => i.participants || []));
}

/**
 * Wie im Artefakt: bei mehreren Familien sucht man je Familie (eigene Flughäfen, eigene Anfahrt).
 * Vorschlag: die erste Familie, die noch keinen Flug hat; bei einer Familie oder wenn alle einen haben: alle.
 */
export function defaultFlyers(trip: Trip): string[] | undefined {
  const act = trip.travelers.filter(isActive);
  const hhs = [...new Set(act.map(hhKey))];
  if (hhs.length < 2) return undefined;
  const cov = covered(trip);
  const free = hhs.find(h => act.some(t => hhKey(t) === h && !cov.has(t.id)));
  return free ? act.filter(t => hhKey(t) === free && !cov.has(t.id)).map(t => t.id) : undefined;
}

/**
 * Vorschlag für die Suche: Wohnort der ersten Familie, Ort und Daten der Reise.
 * Flexibel: Reisezeitraum als Fenster, Nächte von (Dauer − 2) bis Dauer; ohne Daten 7 bis 14 Nächte.
 */
export function defaultQuery(trip: Trip, lastFrom = "", ids?: string[]): FlightQuery {
  const first = flyers(trip, ids)[0];
  const home = first ? trip.households?.[hhKey(first)]?.geo?.ort : undefined;
  const n = nights(trip.from, trip.to);
  return {
    from: lastFrom || home || "", to: trip.place || "", depart: trip.from || "", ret: trip.to || undefined,
    latest: trip.to || "", nightsMin: n ? Math.max(1, n - 2) : 7, nightsMax: n || 14,
    ...passengers(trip, ids), currency: "EUR"
  };
}

const legOf = (dir: FlightLeg["dir"], l: OfferLeg): FlightLeg => ({ dir, from: l.from, to: l.to, dep: l.dep.slice(0, 16), arr: l.arr.slice(0, 16), carrier: l.carriers.join(" / "), stops: l.stops });

export const stopsText = (n: number) => (n ? tn("n.stops", n) : t("fs.th.direct"));

/** Suchergebnis als Angebot: Gesamtpreis für alle, gleich verteilt; mit Quelle und Link */
export function offerToOption(o: FlightOffer): Option {
  return {
    id: uid(),
    label: `${o.out.carriers.join(" / ")} ${t("fs.from", { ap: o.out.from })}, ${stopsText(o.out.stops)}`,
    detail: [o.out.route.join(" → "), o.back ? o.back.route.join(" → ") : ""].filter(Boolean).join(" · "),
    price: { mode: "unit", currency: o.currency, unit: o.price },
    source: { name: o.sourceName, at: new Date().toISOString().slice(0, 10), url: o.url },
    legs: [legOf("out", o.out), ...(o.back ? [legOf("back", o.back)] : [])]
  };
}

/** Übernehmen: erstes Ergebnis legt einen Flug-Posten an, weitere kommen als Angebote zum Vergleichen dazu */
export function takeOffer(trip: Trip, o: FlightOffer, into?: string, ids?: string[]): Item {
  const opt = offerToOption(o);
  const target = into ? trip.items.find(i => i.id === into) : undefined;
  // wer bisher mitflog und einen eigenen Flug übernimmt, fliegt ab jetzt selbst
  if (target?.follow) { target.follow = undefined; target.options = [opt]; target.chosen = undefined; return target; }
  if (target) { target.options.push(opt); return target; }
  // nur ein Teil fliegt (z. B. eine Familie): Posten gilt nur für sie, Name wie im Artefakt „Flug Klein“
  const act = trip.travelers.filter(isActive);
  const part = ids?.length && act.some(t => !ids.includes(t.id)) ? ids : undefined;
  const hhs = part ? [...new Set(act.filter(t => part.includes(t.id)).map(hhKey))] : [];
  const name = hhs.length === 1 ? t("fl.nameFor", { who: hhs[0] }) : t("fl.nameRoute", { a: o.out.fromCity || o.out.from, b: o.out.toCity || o.out.to });
  const item: Item = { id: uid(), cat: "flights", name, status: "idea", options: [opt], ...(part ? { participants: [...part] } : {}) };
  trip.items.push(item);
  return item;
}

/** Rundreise als ein Angebot: Hinflug, weitere Flüge, Rückflug (falls es nach Hause geht); getrennte Tickets */
export function roundToOption(rt: RoundTrip, home: boolean): Option {
  const n = rt.legs.length;
  const route = [rt.legs[0].out.from, ...rt.legs.map(l => l.out.to)];
  return {
    id: uid(),
    label: `${t("fs.round")} ${route.join(" → ")}`,
    detail: `${n === 1 ? tn("n.tickets", 1) : t("round.separate", { n: tn("n.tickets", n) })}${rt.stays?.length ? ` · ${rt.stays.map(s => (s.hours != null ? `${s.name} ${Math.round(s.hours)} h` : `${s.name} ${t("round.nightsShort", { n: s.nights ?? 0 })}`)).join(" / ")}` : ""}`,
    price: { mode: "unit", currency: rt.legs[0].currency, unit: rt.price },
    source: { name: [...new Set(rt.legs.map(l => l.sourceName))].join(", "), at: new Date().toISOString().slice(0, 10), url: rt.legs[0].url },
    legs: rt.legs.map((l, i) => legOf(i === 0 ? "out" : i === n - 1 && home ? "back" : "via", l.out))
  };
}

/** Rundreise übernehmen: neuer Posten „Rundreise …“ oder weiteres Angebot im gewählten Posten */
export function takeRound(trip: Trip, rt: RoundTrip, home: boolean, into?: string, ids?: string[]): Item {
  const opt = roundToOption(rt, home);
  const target = into ? trip.items.find(i => i.id === into) : undefined;
  if (target?.follow) { target.follow = undefined; target.options = [opt]; target.chosen = undefined; return target; }
  if (target) { target.options.push(opt); return target; }
  const act = trip.travelers.filter(isActive);
  const part = ids?.length && act.some(t => !ids.includes(t.id)) ? ids : undefined;
  const hhs = part ? [...new Set(act.filter(t => part.includes(t.id)).map(hhKey))] : [];
  const cities = rt.legs.map(l => l.out.toCity || l.out.to);
  const item: Item = { id: uid(), cat: "flights", name: `${t("fs.round")} ${(home ? cities.slice(0, -1) : cities).join(" – ")}${hhs.length === 1 ? ` (${hhs[0]})` : ""}`, status: "idea", options: [opt], ...(part ? { participants: [...part] } : {}) };
  trip.items.push(item);
  return item;
}

/** Rundreise mit Anfahrt bewerten: wie ein Flug vom ersten Abflug bis zur letzten Landung */
export function rateRound(trip: Trip, rt: RoundTrip, home: boolean, withAccess: boolean, ids?: string[]): Rated {
  const first = rt.legs[0], last = rt.legs.at(-1)!;
  return rate(trip, { ...first, id: rt.id, price: rt.price, back: home ? last.out : undefined }, first.out.from, withAccess, ids);
}

export async function searchFlights(q: FlightQuery, signal?: AbortSignal): Promise<SearchResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  const res = await fetch(`${FLIGHTS_URL}/flights/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t("search.status", { s: res.status }));
  return data as SearchResult;
}

/* ---------- Mehrere Abflughäfen vergleichen (wie im Artefakt) ---------- */

/** Mitfliegen wie im Artefakt: neuer Posten für diese Personen mit dem Flug eines anderen Postens */
export function followFlight(trip: Trip, mainId: string, ids: string[]): Item {
  const act = trip.travelers.filter(isActive);
  const hhs = [...new Set(act.filter(t => ids.includes(t.id)).map(hhKey))];
  const item: Item = { id: uid(), cat: "flights", name: t("fl.nameFor", { who: hhs.join(", ") || t("fl.companions") }), status: "idea", follow: mainId, participants: [...ids], options: [] };
  trip.items.push(item);
  return item;
}

/** Standard-Auswahl wie im Artefakt: je Familie der Fliegenden die n nächsten Flughäfen zum Wohnort, sonst die ersten der Liste */
export function nearestAirports(trip: Trip, n = 4, ids?: string[]): string[] {
  const aps = airportsOf(trip);
  const geos = [...new Set(flyers(trip, ids).map(hhKey))].map(h => trip.households?.[h]?.geo).filter(g => !!g);
  if (!geos.length) return aps.slice(0, n).map(a => a.code);
  const dist = (a: (typeof aps)[number]) => Math.min(...geos.map(g => roadKm(g, a) ?? Infinity));
  const set = new Set(geos.flatMap(g => [...aps].sort((a, b) => (roadKm(g, a) ?? 0) - (roadKm(g, b) ?? 0)).slice(0, n).map(a => a.code)));
  return aps.filter(a => set.has(a.code)).sort((a, b) => dist(a) - dist(b)).map(a => a.code);
}

/** Minuten seit Epoche für eine lokale Zeit (ohne Zeitzone) */
export const tMin = (iso: string) => {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000 : NaN;
};
/** Gepäck und Weg zum Auto oder Bahnsteig nach der Landung */
export const EXIT_H = 0.75;

export interface Rated extends FlightOffer {
  /** Abflughafen der Suche */
  origin: string;
  access: number;
  accessHours: number;
  /** Flug plus Anfahrt (wenn eingerechnet) */
  total: number;
  /** wieder zu Hause (Minuten seit Epoche), nur mit Rückflug */
  home: number;
  nights: number | null;
}

/** Anfahrt der Familien, die fliegen, zum Flughafen (hin und zurück, Parken für die Reisetage), dazu „zuhause ca.“ */
export function rate(trip: Trip, o: FlightOffer, origin: string, withAccess: boolean, ids?: string[]): Rated {
  const ap = airportsOf(trip).find(a => a.code === (o.out.from || origin)) ?? airportsOf(trip).find(a => a.code === origin);
  const counts: Record<string, number> = {};
  flyers(trip, ids).forEach(t => (counts[hhKey(t)] = (counts[hhKey(t)] || 0) + 1));
  const days = o.back ? Math.max(1, nights(o.out.dep.slice(0, 10), o.back.arr.slice(0, 10)) + 1) : Math.max(1, nights(trip.from, trip.to) + 1);
  let cost = 0, hours = 0;
  if (ap) for (const hh in counts) { const a = accessFor(hh, ap, counts[hh], days, trip); cost += a.cost; hours = Math.max(hours, a.hours); }
  return {
    ...o, origin, access: Math.round(cost), accessHours: hours, total: o.price + (withAccess ? Math.round(cost) : 0),
    home: o.back ? tMin(o.back.arr) + Math.round((hours + EXIT_H) * 60) : NaN,
    nights: o.back ? nights(o.out.arr.slice(0, 10), o.back.dep.slice(0, 10)) : null
  };
}

/** spätestens zu Hause: Datum und Uhrzeit als Minuten */
export const deadline = (date?: string, clock = "22:00") => (date ? tMin(`${date}T${/^\d{2}:\d{2}$/.test(clock) ? clock : "22:00"}`) : NaN);

export interface CompareRow { code: string; price: number; access: number; total: number; hours: number; direct: number | null; count: number; error?: string }

/** Vergleich je Flughafen: günstigster Treffer, Anfahrt, gesamt, Reisezeit (Flug + 2 × Anfahrt), günstigster Direktflug */
export function compareRow(code: string, list: Rated[], error?: string): CompareRow {
  if (!list.length) return { code, price: 0, access: 0, total: 0, hours: 0, direct: null, count: 0, error: error || t("fs.noConnection") };
  const cheap = list.reduce((a, b) => (b.total < a.total ? b : a));
  const dir = list.filter(o => !o.out.stops && !o.back?.stops);
  const flightH = (cheap.out.minutes + (cheap.back?.minutes || 0)) / 60;
  return {
    code, price: cheap.price, access: cheap.access, total: cheap.total, hours: flightH + 2 * cheap.accessHours,
    direct: dir.length ? dir.reduce((a, b) => (b.total < a.total ? b : a)).total : null, count: list.length
  };
}

/** Wochentag, Datum, Uhrzeit aus Minuten, z. B. „Mo 29.07. 18:10“ */
export function fmtMin(mins: number): string {
  const d = new Date(mins * 60000), p = (n: number) => String(n).padStart(2, "0");
  return `${dayShort(d.toISOString().slice(0, 10))} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
