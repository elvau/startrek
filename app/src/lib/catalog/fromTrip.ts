/*
 * Reise → Katalogeintrag (#642). Übernimmt nur den Reisekern am Ziel: Stationen, Unterkünfte, Mobilität und Verpflegung
 * vor Ort als Kosten pro Person, Touren getrennt, Tagesplan relativ (Tag 1, 2 …). Weg fallen Anreise (Flüge ab bzw.
 * nach Hause, Anreise ohne Flug, eigenes Auto), Namen, Alter, Wohnorte, Familien, Buchungsnummern, Notizen, Kasse,
 * Zahlungen, Anbieternamen, Bilder und Links. Freitexte (Titel, Tagesplan, Tourname) werden von Namen der Reisenden und
 * Familien, Anbietern, Buchungsnummern, E-Mail-Adressen, Telefonnummern und Links bereinigt.
 */
import { activeOption, ageClass, calcItem } from "../calc";
import { dayDiff, okDate } from "../calc/travel";
import { itinerary, stations } from "../itinerary";
import { isActive, uid, type Item, type Trip } from "../model";
import { isRoadTrip } from "../road/trip";
import type { CatalogBy, CatalogCost, CatalogDay, CatalogEntry, CatalogKind, CatalogMove, CatalogStop, CatalogTour } from "./types";

/** Ortsname → Lage und Land (in der App aus den Geodaten) */
export type PlaceResolver = (name: string) => { lat: number; lon: number; cc?: string } | null;

export interface FromTripOpts {
  lang: string;
  /** heute (JJJJ-MM-TT) für den Stand der Preise */
  today: string;
  resolve?: PlaceResolver;
  /** öffentlicher Benutzername (#650) */
  by?: string;
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
// Telefonnummern: beginnt mit + oder 0, mindestens 8 Ziffern (Daten wie 2027-06-05 bleiben)
const PHONE = /(?:\+|\b0)\d[\d /-]{6,}\d/g;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Freitext bereinigen: E-Mail, Links, Telefonnummern und die übergebenen Wörter (Namen, Anbieter, Buchungsnummern) */
export function scrub(s: string, words: string[]): string {
  let r = s.replace(EMAIL, "").replace(LINK, "").replace(PHONE, m => (m.replace(/\D/g, "").length >= 8 ? "" : m));
  for (const w of [...new Set(words.map(x => x.trim()).filter(x => x.length >= 2))].sort((a, b) => b.length - a.length))
    r = r.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}(?=$|[^\\p{L}\\p{N}])`, "giu"), "$1");
  return r.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "").trim();
}

/** Wörter, die nicht in den Katalog dürfen: Namen der Reisenden und Familien, Anbieter, Buchungsnummern */
export function privateWords(trip: Trip): string[] {
  const w: string[] = [];
  for (const x of trip.travelers) w.push(x.name, x.household, ...x.name.split(/\s+/), ...(x.group ? [x.group] : []));
  w.push(...Object.keys(trip.households || {}));
  for (const it of trip.items) {
    if (it.booking?.ref) w.push(it.booking.ref);
    if (it.booking?.provider) w.push(it.booking.provider);
    for (const o of it.options) {
      if (o.source?.name) w.push(o.source.name);
      for (const l of o.legs || []) if (l.carrier) w.push(l.carrier);
    }
  }
  if (trip.offer?.provider) w.push(trip.offer.provider);
  if (trip.campaign) w.push(...Object.values(trip.campaign).filter((v): v is string => typeof v === "string" && v.length < 60));
  return w.filter(Boolean);
}

/** Anreise: Flug mit Hin- oder Rückflug (nur Flüge zwischen Stationen bleiben), Anreise ohne Flug, eigenes Auto */
export function isArrival(it: Item, trip: Trip): boolean {
  if (it.arrival || it.hint === "road:car") return true;
  if (it.cat !== "flights") return false;
  const legs = activeOption(it, trip)?.legs || [];
  return !legs.length || legs.some(l => l.dir !== "via");
}

const r0 = (n: number) => Math.round(n);

export function tripToCatalog(trip: Trip, o: FromTripOpts): CatalogEntry {
  const words = privateWords(trip);
  const clean = (s?: string) => scrub(s || "", words);
  const act = trip.travelers.filter(isActive);
  const n = act.length || 1;
  const group = { adults: 0, children: 0, infants: 0 };
  for (const x of act) {
    const c = ageClass(x.age, trip.settings, x.kind);
    if (c === "adult") group.adults++; else if (c === "child") group.children++; else group.infants++;
  }
  if (!act.length) group.adults = 1;

  const live = trip.items.filter(i => i.status !== "dropped");
  const days = itinerary(trip);
  const first = okDate(trip.from) ? trip.from! : days[0]?.date;
  const dayNo = (d?: string) => (first && d && okDate(d) ? dayDiff(first, d.slice(0, 10)) + 1 : undefined);

  // Stationen mit Lage: Unterkunft aus der Suche, sonst der Ort
  const stopLoc = (place: string, from?: string) => {
    const st = from ? live.find(i => i.cat === "stay" && i.from && i.to && i.from <= from && from < i.to) : undefined;
    const loc = st ? activeOption(st, trip)?.loc : undefined;
    const hit = o.resolve?.(place) || null;
    if (loc?.lat != null && loc?.lon != null) return { lat: loc.lat, lon: loc.lon, cc: hit?.cc };
    // Kreuzfahrt: Lage des Hafens aus der Route
    const port = live.flatMap(i => i.cruise?.ports || []).find(p => p.place?.trim() === place && p.lat != null && p.lon != null);
    if (port) return { lat: port.lat!, lon: port.lon!, cc: port.cc || hit?.cc };
    return hit;
  };
  let stops: CatalogStop[] = stations(days).map(s => {
    const loc = stopLoc(s.place, s.from);
    return { place: clean(s.place) || s.place, nights: s.nights, ...(loc ? { lat: loc.lat, lon: loc.lon, ...(loc.cc ? { cc: loc.cc } : {}) } : {}) };
  });
  if (!stops.length && trip.place) {
    const loc = stopLoc(trip.place);
    stops = [{ place: trip.place, nights: Math.max(0, days.length - 1), ...(loc ? { lat: loc.lat, lon: loc.lon, ...(loc.cc ? { cc: loc.cc } : {}) } : {}) }];
  }
  // Verkehrsmittel zwischen den Stationen: Flug zwischen Stationen, Kreuzfahrt, Camper, sonst Auto bzw. Bahn
  const viaDays = live.filter(i => i.cat === "flights").flatMap(i => (activeOption(i, trip)?.legs || []).filter(l => l.dir === "via").map(l => l.dep.slice(0, 10)));
  const cruise = live.some(i => i.cruise);
  const ground: CatalogBy = trip.camper ? "camper" : live.some(i => i.rental || i.hint === "rental" || i.hint === "road:car") ? "car" : "train";
  const st = stations(days);
  stops.forEach((s, i) => {
    if (i === 0) return;
    const from = st[i - 1]?.from, to = st[i]?.from;
    s.by = cruise ? "ship" : from && to && viaDays.some(d => d >= from && d <= to) ? "plane" : ground;
  });
  const nights = okDate(trip.from) && okDate(trip.to) ? Math.max(0, dayDiff(trip.from!, trip.to!)) : stops.reduce((a, s) => a + s.nights, 0);

  // geschätzte Nebenkosten (Kurtaxe …) nicht speichern: die Ansicht schätzt sie neu (fees.ts); eingetragene bleiben
  const pp = (it: Item) => { const c = calcItem(it, trip); return (c.net - (c.extras?.est || 0)) / n; };
  const costs: CatalogCost[] = [], tours: CatalogTour[] = [];
  for (const it of live) {
    if (isArrival(it, trip) || it.auto === "souvenir") continue;
    if (it.cat === "attractions" && !it.auto) {
      const d = dayNo(it.day), time = it.day && it.day.length >= 16 ? it.day.slice(11, 16) : undefined;
      tours.push({ name: clean(it.name) || clean(activeOption(it, trip)?.label) || "–", pp: r0(pp(it)), ...(d ? { day: d } : {}), ...(time ? { time } : {}) });
      continue;
    }
    const opt = activeOption(it, trip);
    const c: CatalogCost = { cat: it.cat, pp: r0(pp(it)) };
    if (it.cat === "stay") {
      const place = it.private?.place || opt?.query?.place;
      if (place) c.place = clean(place) || undefined;
      if (it.from && it.to && okDate(it.from) && okDate(it.to)) c.nights = dayDiff(it.from, it.to);
      if (opt?.stay?.board) c.board = opt.stay.board;
      if (!c.place) delete c.place;
    }
    if (it.auto === "food" || it.auto === "local") c.auto = it.auto;
    costs.push(c);
  }

  const move: CatalogMove[] = [];
  if (trip.camper) move.push("camper");
  else if (live.some(i => i.rental || i.hint === "rental")) move.push("car");
  if (live.some(i => i.auto === "local" && i.hh === "daily")) move.push("transit");

  // ausdrücklich ohne Flug: kein Flug und Anreise am Boden (Auto, Bahn, Camper); fehlt der Flug nur, entscheidet die Entfernung
  const noFly = !live.some(i => i.cat === "flights") && (!!trip.camper || live.some(i => i.arrival || i.hint === "road:car"));
  const kind: CatalogKind = live.some(i => i.cruise) ? "cruise"
    : live.some(i => i.options.some(x => x.pkg && !x.pkg.off)) ? "package"
    : trip.event ? "event"
    : trip.camper || (!live.some(i => i.cat === "flights") && stops.length >= 2 && isRoadTrip(trip, stops.length)) ? "road"
    : stops.length >= 2 ? "round" : "stay";

  const plan: CatalogDay[] = [];
  for (const [date, d] of Object.entries(trip.days || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const no = dayNo(date);
    if (!no) continue;
    const notes = (d.notes || []).map(x => ({ text: clean(x.text), ...(x.kind ? { kind: x.kind } : {}), ...(x.time ? { time: x.time } : {}) })).filter(x => x.text);
    const title = clean(d.title);
    if (title || notes.length) plan.push({ n: no, ...(title ? { title } : {}), notes });
  }

  const months = [...new Set([trip.from, trip.to].filter(okDate).map(d => +d!.slice(5, 7)))];
  const styles = trip.prefs?.styles?.length ? [...trip.prefs.styles] : undefined;
  return {
    v: 1, id: uid(), source: "user", ...(o.by ? { by: o.by } : {}), lang: o.lang,
    title: clean(trip.name) || stops[0]?.place || trip.place || "–",
    kind, ...(styles ? { styles } : {}), ...(noFly ? { noFly } : {}), ...(trip.event ? { event: clean(trip.event.name) } : {}),
    group, months, nights, stops, ...(move.length ? { move } : {}), ...(trip.food?.style ? { food: trip.food.style } : {}),
    costs, tours, days: plan, stand: o.today.slice(0, 7)
  };
}
