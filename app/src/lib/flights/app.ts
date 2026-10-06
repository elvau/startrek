/* Flugsuche in der App: Anfrage aus der Reise, Ergebnis als Angebot in einen Flug-Posten */
import { noteError } from "../bugs/log";
import { t, tn } from "../i18n/index.svelte";
import { addOffer, hhKey, isActive, uid, type FlightLeg, type Item, type Option, type Traveler, type Trip } from "../model";
import { dayShort, nights } from "../format";
import { accessFor, airportsOf, roadKm } from "../calc/travel";
import { activeOption } from "../calc";
import type { FlightOffer, FlightQuery, OfferLeg, SearchResult } from "./types";
import type { RoundTrip } from "./roundtrip";
import { guessAirports, type Guess } from "./origin";
import { origin } from "./origin.svelte";
import { airportData } from "../geo/geo.svelte";
import { addOnExtras, addOns, type AddOns, type BagNeed } from "./addons";

/** Adresse des Such-Dienstes (Cloudflare Worker); leer: noch nicht eingerichtet */
export const FLIGHTS_URL = (import.meta.env.VITE_FLIGHTS_URL as string | undefined)?.replace(/\/$/, "") || "";

/** Personen der Reise für die Suche: Babys (unter 2, nur mit bekanntem Alter) auf dem Schoß, sonst Kinder mit Sitz */
/**
 * Fluggäste nach den Regeln der Airlines (nicht nach den Altersgrenzen der Reise): ab 12 Erwachsene, unter 2 Babys auf dem
 * Schoß, dazwischen Kinder. Ohne Alter zählt die Klasse des Platzhalters (Kleinkind bekommt sicherheitshalber einen Sitz).
 * Mehr Babys als Erwachsene: die übrigen brauchen einen eigenen Sitz und zählen als Kinder.
 */
export function passengers(trip: Trip, ids?: string[]): Pick<FlightQuery, "adults" | "children" | "infants"> {
  let adults = 0, children = 0, infants = 0;
  for (const t of flyers(trip, ids)) {
    const age = t.age != null && (t.age as unknown) !== "" && isFinite(Number(t.age)) ? Number(t.age) : null;
    if (age == null ? (t.kind || "adult") === "adult" : age >= 12) adults++;
    else if (age != null && age < 2) infants++;
    else children++;
  }
  adults = Math.max(1, adults);
  const lap = Math.min(infants, adults);
  return { adults, children: children + infants - lap, infants: lap };
}

type Pax = Pick<FlightQuery, "adults" | "children" | "infants">;

/** Höchstzahl der Fluggäste je Suche bei den Anbietern */
export const MAX_PAX = 9;
/** ab so vielen Sitzen wird vorgeschlagen aufzuteilen, dann in Buchungen zu höchstens BOOKING_SIZE */
export const SPLIT_FROM = 10;
export const BOOKING_SIZE = 5;

export interface PaxSplit { q: Pax; bookings: number; size: number; factor: number }

/**
 * Große Gruppen in Buchungen aufteilen: günstige Tarife gibt es je Flug nur in kleinen Kontingenten, und die Anbieter
 * suchen höchstens 9 Personen. Gesucht wird für die größte Buchung (Erwachsene und Kinder anteilig, Babys bei
 * Erwachsenen), der Preis wird nach Köpfen auf alle hochgerechnet.
 */
export function splitPax(p: Pax, size: number): PaxSplit {
  const seats = p.adults + p.children;
  const bookings = Math.ceil(seats / Math.max(1, Math.min(MAX_PAX, size)));
  if (bookings <= 1) return { q: p, bookings: 1, size: seats, factor: 1 };
  const per = Math.ceil(seats / bookings);
  const adults = Math.max(1, Math.min(per, Math.ceil(p.adults / bookings)));
  const children = Math.min(p.children, per - adults);
  const infants = Math.min(adults, Math.ceil(p.infants / bookings));
  return { q: { adults, children, infants }, bookings, size: adults + children, factor: (seats + p.infants) / (adults + children + infants) };
}

/** Preise einer Suche für eine Buchung auf die ganze Gruppe hochrechnen */
export function scaleResult(r: SearchResult, factor: number): SearchResult {
  if (factor === 1) return r;
  const k = (n: number) => Math.round(n * factor);
  return { ...r, offers: r.offers.map(o => ({ ...o, price: k(o.price), ...(o.orig ? { orig: { ...o.orig, amount: k(o.orig.amount) } } : {}),
    ...(o.baggage ? { baggage: { personal: k(o.baggage.personal), cabin: k(o.baggage.cabin), checked: k(o.baggage.checked) } } : {}) })) };
}

/** Wer fliegt: diese Personen (fehlt: alle, die dabei sind) */
export const flyers = (trip: Trip, ids?: string[]) => trip.travelers.filter(t => isActive(t) && (!ids || ids.includes(t.id)));

/**
 * Reisezeitraum an die Flüge anpassen (nach dem Übernehmen): haben alle einen Flug, gilt genau Hinflug bis Rückflug
 * (Rundreise vom 20.08. bis 02.09. statt der geschätzten 01.–22.08.); sonst nur erweitern, falls ein Flug außerhalb liegt.
 * Gibt den neuen Zeitraum zurück, wenn er sich geändert hat.
 */
export function fitTripDates(trip: Trip): { from: string; to: string } | null {
  const fl = trip.items.filter(i => i.cat === "flights" && i.status !== "dropped" && !i.follow);
  const legs = fl.flatMap(i => activeOption(i, trip)?.legs || []).filter(l => l.dep && l.arr);
  const outs = legs.filter(l => l.dir === "out").map(l => l.dep.slice(0, 10)).sort();
  const backs = legs.filter(l => l.dir === "back").map(l => l.arr.slice(0, 10)).sort();
  if (!outs.length || !backs.length) return null;
  const a = outs[0], b = backs.at(-1)!;
  if (b < a) return null;
  const act = trip.travelers.filter(isActive);
  const cov = covered(trip);
  const all = act.length > 0 && act.every(t => cov.has(t.id));
  const from = all || !trip.from || a < trip.from ? a : trip.from;
  const to = all || !trip.to || b > trip.to ? b : trip.to;
  if (from === trip.from && to === trip.to) return null;
  trip.from = from; trip.to = to;
  return { from, to };
}

/** wer schon einen eigenen Flug-Posten hat (Posten ohne Beteiligte gelten für alle) */
export function covered(trip: Trip): Set<string> {
  // Flüge und eigene Anreisen (Auto, Bahn); ohne Teilnehmer gilt ein Posten für alle
  const fl = trip.items.filter(i => (i.cat === "flights" || i.arrival) && i.status !== "dropped");
  if (fl.some(i => !i.participants)) return new Set(trip.travelers.map(t => t.id));
  return new Set(fl.flatMap(i => i.participants || []));
}

/**
 * Wer hat noch keinen Flug und keine Anreise? Nur, wenn schon etwas geplant ist (sonst fehlt allen alles).
 * Babys unter 2 fliegen auf dem Schoß mit und zählen nicht.
 */
export function withoutTravel(trip: Trip): Traveler[] {
  const planned = trip.items.some(i => (i.cat === "flights" || i.arrival) && i.status !== "dropped");
  if (!planned) return [];
  const cov = covered(trip);
  return trip.travelers.filter(t => isActive(t) && !cov.has(t.id) && !(t.age != null && (t.age as unknown) !== "" && t.age < 2));
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
 * Flexibel: Reisezeitraum als Fenster, Nächte von (Dauer − ein Viertel, mindestens − 1) bis Dauer; ohne Daten 7 bis 14 Nächte.
 * Kurze Reisen bis 3 Nächte (Wochenende, JGA) ganz, sonst kommen Gruppen an verschiedenen Tagen (7 Nächte: 6–7, 14: 11–14).
 */
/** eigene Daten der Familien („Wer fährt mit“: erste Nacht, Abreise), wenn alle Fliegenden dieselben haben */
export function ownDates(trip: Trip, ids?: string[]): { from: string; to: string } | null {
  const hs = [...new Set(flyers(trip, ids).map(hhKey))].map(h => trip.households?.[h]);
  const a = hs[0]?.arrive, d = hs[0]?.depart;
  if (!hs.length || !a || !d || d <= a || hs.some(h => h?.arrive !== a || h?.depart !== d)) return null;
  return { from: a, to: d };
}

export function defaultQuery(trip: Trip, lastFrom = "", ids?: string[]): FlightQuery {
  const first = flyers(trip, ids)[0];
  const home = first ? trip.households?.[hhKey(first)]?.geo?.ort : undefined;
  // kommt später oder fährt früher (Oma und Opa ab der zweiten Woche): deren Daten statt des Reisezeitraums
  const own = ownDates(trip, ids);
  const from = own?.from || trip.from || "", to = own?.to || trip.to || "";
  const n = nights(from, to);
  return {
    from: lastFrom || home || "", to: trip.place || "", depart: from, ret: to || undefined,
    latest: to, nightsMin: n ? (n <= 3 ? n : n - Math.max(1, Math.floor(n / 4))) : 7, nightsMax: n || 14,
    ...passengers(trip, ids), currency: "EUR"
  };
}

export const legOf = (dir: FlightLeg["dir"], l: OfferLeg): FlightLeg => ({ dir, from: l.from, to: l.to, dep: l.dep.slice(0, 16), arr: l.arr.slice(0, 16), carrier: l.carriers.join(" / "), stops: l.stops, ...(l.minutes > 0 ? { minutes: l.minutes } : {}), ...(l.toCity ? { toCity: l.toCity } : {}) });

export const stopsText = (n: number) => (n ? tn("n.stops", n) : t("fs.th.direct"));

/** Suchergebnis als Angebot: Gesamtpreis für alle, gleich verteilt; mit Quelle und Link */
/** aufgeteilt gesucht: Größe einer Buchung und Hinweis am Angebot */
export interface SplitInfo { size: number; note: string }

/** Zusätze aus der Bewertung (Koffer, Sitzplätze, Hinweise) für das Angebot im Posten */
export interface OfferExtras { add?: AddOns; hints?: Option["hints"] }

export function offerToOption(o: FlightOffer, split?: SplitInfo, more: OfferExtras = {}): Option {
  const extras = more.add ? addOnExtras(more.add, { bags: t("fl.addBags", { n: tn("n.bags", more.add.missing) }), seats: t("fl.addSeats") }) : [];
  return {
    id: uid(),
    label: `${o.out.carriers.join(" / ")} ${t("fs.from", { ap: o.out.from })}, ${stopsText(o.out.stops)}`,
    detail: [o.out.route.join(" → "), o.back ? o.back.route.join(" → ") : "", split?.note || ""].filter(Boolean).join(" · "),
    ...(split ? { split: split.size } : {}),
    price: { mode: "unit", currency: o.currency, unit: o.price },
    source: { name: o.sourceName, at: new Date().toISOString().slice(0, 10), url: o.url, ...(o.sponsored ? { sponsored: true } : {}), ...(o.test ? { test: true } : {}) },
    legs: [legOf("out", o.out), ...(o.back ? [legOf("back", o.back)] : [])],
    ...(o.baggage ? { baggage: { ...o.baggage } } : {}),
    ...(extras.length ? { extras } : {}),
    ...(more.hints?.length ? { hints: [...more.hints] } : {})
  };
}

/** Übernehmen: erstes Ergebnis legt einen Flug-Posten an, weitere kommen als Angebote zum Vergleichen dazu */
export function takeOffer(trip: Trip, o: FlightOffer, into?: string, ids?: string[], split?: SplitInfo, more?: OfferExtras): Item {
  const opt = offerToOption(o, split, more);
  const target = into ? trip.items.find(i => i.id === into) : undefined;
  // wer bisher mitflog und einen eigenen Flug übernimmt, fliegt ab jetzt selbst
  if (target?.follow) { target.follow = undefined; target.options = [opt]; target.chosen = undefined; return target; }
  if (target) { addOffer(target, opt); return target; }
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
export function roundToOption(rt: RoundTrip, home: boolean, split?: SplitInfo): Option {
  const n = rt.legs.length;
  const route = [rt.legs[0].out.from, ...rt.legs.map(l => l.out.to)];
  return {
    id: uid(),
    label: `${t("fs.round")} ${route.join(" → ")}`,
    detail: `${n === 1 ? tn("n.tickets", 1) : t("round.separate", { n: tn("n.tickets", n) })}${rt.stays?.length ? ` · ${rt.stays.map(s => (s.hours != null ? `${s.name} ${Math.round(s.hours)} h` : `${s.name} ${t("round.nightsShort", { n: s.nights ?? 0 })}`)).join(" / ")}` : ""}${split ? ` · ${split.note}` : ""}`,
    ...(split ? { split: split.size } : {}),
    price: { mode: "unit", currency: rt.legs[0].currency, unit: rt.price },
    source: { name: [...new Set(rt.legs.map(l => l.sourceName))].join(", "), at: new Date().toISOString().slice(0, 10), url: rt.legs[0].url, ...(rt.legs[0].sponsored ? { sponsored: true } : {}), ...(rt.legs.some(l => l.test) ? { test: true } : {}) },
    legs: rt.legs.map((l, i) => legOf(i === 0 ? "out" : i === n - 1 && home ? "back" : "via", l.out))
  };
}

/** Rundreise übernehmen: neuer Posten „Rundreise …“ oder weiteres Angebot im gewählten Posten */
export function takeRound(trip: Trip, rt: RoundTrip, home: boolean, into?: string, ids?: string[], split?: SplitInfo): Item {
  const opt = roundToOption(rt, home, split);
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

/**
 * Keine Flüge, aber eine Quelle ist erst nach einer Weile gescheitert (z. B. Kiwi überlastet oder zu langsam):
 * lohnt einen zweiten Versuch. Sofortige Absagen (fehlende Flughafencodes u. Ä., ms 0) ändern sich dadurch nicht.
 */
/** Anbieter melden Treffer, die Liste ist aber leer: sie wurden beim Zusammenführen ausgeblendet (andere Flughäfen, Zeitraum, unplausible Preise) */
export const hitsHidden = (sources: { ok: boolean; count: number }[], shown: number) => shown === 0 && sources.some(s => s.ok && s.count > 0);
/** Ein eingerichteter Anbieter ist ausgefallen (z. B. 503): „keine Flüge“ heißt dann nicht „gibt es nicht“ */
export const providerDown = (sources: { configured: boolean; ok: boolean }[]) => sources.some(s => s.configured && !s.ok);

export const worthRetry = (r: SearchResult) => !r.offers?.length && !!r.sources?.some(s => s.configured && !s.ok && (s.ms || 0) > 0);

/**
 * Unplausible Preise (Fehler der Anbieter, live gesehen: Los Angeles → San Diego 8.117 € pro Person) aussortieren:
 * höchstens 600 € plus 400 € je Flugstunde pro Person. Business-Tarife auf Langstrecken bleiben darunter.
 */
export function saneOffer(o: FlightOffer, pax: number): boolean {
  const hours = ((o.out.minutes || 0) + (o.back?.minutes || 0)) / 60;
  if (!(hours > 0)) return true;
  return o.price / Math.max(1, pax) <= 600 + 400 * hours;
}

export async function searchFlights(q: FlightQuery, signal?: AbortSignal): Promise<SearchResult> {
  if (!FLIGHTS_URL) throw new Error(t("search.notReady"));
  let data: SearchResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${FLIGHTS_URL}/flights/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q), signal });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 429 ? t("search.tooMany") : body.error || t("search.status", { s: res.status }));
    data = body as SearchResult;
    const pax = (q.adults || 0) + (q.children || 0) || 1;
    const bad = (data.offers || []).filter(o => !saneOffer(o, pax));
    if (bad.length) {
      noteError(`Flugsuche ${q.from}→${q.to}: ${bad.length} unplausible Preise aussortiert (z. B. ${Math.round(bad[0].price / pax)} € p. P., ${bad[0].sourceName})`);
      data = { ...data, offers: data.offers.filter(o => saneOffer(o, pax)) };
    }
    if (!worthRetry(data)) break;
    // für Fehlermeldungen: welche Quelle woran gescheitert ist
    noteError(`Flugsuche ${q.from}→${q.to}${attempt ? "" : " (neuer Versuch)"}: ${data.sources.filter(s => s.configured && !s.ok).map(s => `${s.id} ${s.error || "ohne Antwort"} (${s.ms} ms)`).join(", ")}`);
  }
  return data!;
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
/** ohne Wohnort: Vorschlag aus dem ungefähren Ort der Verbindung bzw. dem Land (null: Standardliste) */
export const homeGuess = (n = 4): Guess | null => guessAirports(origin.where, airportData, n);

export function nearestAirports(trip: Trip, n = 4, ids?: string[]): string[] {
  const aps = airportsOf(trip);
  const geos = [...new Set(flyers(trip, ids).map(hhKey))].map(h => trip.households?.[h]?.geo).filter(g => !!g);
  if (!geos.length) return homeGuess(n)?.codes ?? aps.slice(0, n).map(a => a.code);
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
  /** Flug plus Anfahrt (wenn eingerechnet) plus Koffer und Sitzplätze (geschätzt) */
  total: number;
  /** Koffer und Sitzplätze dazubuchen (mit Bedarf der Gruppe bewertet) */
  add?: AddOns;
  /** wieder zu Hause (Minuten seit Epoche), nur mit Rückflug */
  home: number;
  nights: number | null;
}

/** Anfahrt der Familien, die fliegen, zum Flughafen (hin und zurück, Parken für die Reisetage), dazu „zuhause ca.“ */
export function rate(trip: Trip, o: FlightOffer, origin: string, withAccess: boolean, ids?: string[], need?: BagNeed): Rated {
  const ap = airportsOf(trip).find(a => a.code === (o.out.from || origin)) ?? airportsOf(trip).find(a => a.code === origin);
  const counts: Record<string, number> = {};
  flyers(trip, ids).forEach(t => (counts[hhKey(t)] = (counts[hhKey(t)] || 0) + 1));
  const days = o.back ? Math.max(1, nights(o.out.dep.slice(0, 10), o.back.arr.slice(0, 10)) + 1) : Math.max(1, nights(trip.from, trip.to) + 1);
  let cost = 0, hours = 0;
  if (ap) for (const hh in counts) { const a = accessFor(hh, ap, counts[hh], days, trip); cost += a.cost; hours = Math.max(hours, a.hours); }
  const add = need ? addOns(o, need) : undefined;
  return {
    ...o, origin, access: Math.round(cost), accessHours: hours, total: o.price + (withAccess ? Math.round(cost) : 0) + Math.round(add?.total || 0), ...(add ? { add } : {}),
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
