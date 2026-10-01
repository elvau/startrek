/*
 * KI-Konnektor: Reisen im Konto anlegen und ergänzen, ohne Svelte (läuft im Such-Dienst).
 * Posten entstehen wie in der App (Flug, Unterkunft, eigene Kosten) und sind als „von der KI“ markiert.
 */
import { ar } from "../i18n/ar";
import { de } from "../i18n/de";
import { en } from "../i18n/en";
import { es } from "../i18n/es";
import { fr } from "../i18n/fr";
import { pl } from "../i18n/pl";
import { ru } from "../i18n/ru";
import { CAT_KEYS, DEFAULT_SETTINGS, isActive, uid, type CatKey, type Item, type Option, type Traveler, type Trip } from "../model";
import type { FlightOffer, OfferLeg } from "../flights/types";
import { plainLink } from "../partner";
import type { StayOffer, StayQuery } from "../stays/types";

const DICTS: Record<string, Record<string, string | undefined>> = { de, en, es, fr, pl, ru, ar };
export const LANGS = Object.keys(DICTS);

/** Text in der Sprache der Reise (wie in der App: fehlt er, gilt Englisch, dann Deutsch) */
export function tr(lang: string, key: string, p: Record<string, string | number> = {}): string {
  const s = DICTS[lang]?.[key] ?? en[key as keyof typeof en] ?? de[key as keyof typeof de] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ""));
}
function trn(lang: string, key: string, n: number): string {
  let form = "other";
  try { form = new Intl.PluralRules(lang).select(n); } catch {}
  const d = DICTS[lang] || de;
  const k = d[`${key}.${form}`] != null ? `${key}.${form}` : `${key}.other`;
  return tr(lang, k, { n });
}

export interface NewTrip {
  name?: string;
  place: string;
  country?: string;
  from?: string;
  to?: string;
  adults: number;
  /** Alter der Kinder (unter 2: Kleinkind) */
  childAges?: number[];
  lang: string;
}

const ageClassOf = (age: number | null | undefined, kind?: Traveler["kind"]): "adult" | "child" | "infant" =>
  age == null ? kind || "adult" : age >= DEFAULT_SETTINGS.adultAge ? "adult" : age >= DEFAULT_SETTINGS.childAge ? "child" : "infant";

/** Reisende als Platzhalter einer Familie („Fuchs Erw. 1“, „Fuchs Kind 1“), wie beim schnellen Start in der App */
export function placeholders(adults: number, childAges: number[], lang: string): Traveler[] {
  const a = tr(lang, "animal.Fuchs"), color = "#D2693C";
  const mk = (name: string, kind: Traveler["kind"], age?: number): Traveler => ({ id: uid(), name, household: a, kind, color, placeholder: true, ...(age != null ? { age } : {}) });
  const out: Traveler[] = [];
  for (let k = 1; k <= adults; k++) out.push(mk(tr(lang, "ph.adult", { a, k }), "adult"));
  let c = 0, i = 0, ad = adults;
  for (const age of childAges) {
    // Altersklassen wie in der App: ab adultAge erwachsen, ab childAge Kind, darunter Kleinkind
    const k = ageClassOf(age);
    if (k === "adult") out.push(mk(tr(lang, "ph.adult", { a, k: ++ad }), "adult", age));
    else if (k === "child") out.push(mk(tr(lang, "ph.child", { a, k: ++c }), "child", age));
    else out.push(mk(tr(lang, "ph.infant", { a, k: ++i }), "infant", age));
  }
  return out;
}

export function newTrip(o: NewTrip): Trip {
  const travelers = placeholders(Math.max(1, Math.min(20, o.adults)), (o.childAges || []).slice(0, 10), o.lang);
  const name = (o.name || "").trim().slice(0, 120) || o.place.trim().slice(0, 120);
  return {
    id: uid() + uid(), name, autoName: false, place: o.place.trim().slice(0, 80), country: (o.country || "").trim().slice(0, 60),
    ...(o.from ? { from: o.from } : {}), ...(o.to ? { to: o.to } : {}),
    travelers, items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, detail: {}
  };
}

const at = () => new Date().toISOString();
const day = () => new Date().toISOString().slice(0, 10);

const legOf = (dir: "out" | "back", l: OfferLeg) => ({ dir, from: l.from, to: l.to, dep: l.dep.slice(0, 16), arr: l.arr.slice(0, 16), carrier: l.carriers.join(" / "), stops: l.stops, ...(l.toCity ? { toCity: l.toCity } : {}) });

/**
 * Flug aus der Suche als Posten. Ohne seats: Gesamtpreis für alle, gleich verteilt. Mit seats (so viele Plätze hatte
 * die Suche): für `travelers` Reisende, die noch keinen eigenen Flug haben, in Buchungen zu höchstens `seats` Plätzen,
 * je Buchung ein Posten mit ihren Reisenden und Preis pro Platz mal Personen.
 */
export function addFlight(trip: Trip, o: FlightOffer, lang: string, split?: { seats: number; travelers?: number }): Item[] {
  const stops = o.out.stops ? trn(lang, "n.stops", o.out.stops) : tr(lang, "fs.th.direct");
  const opt = (unit: number): Option => ({
    id: uid(),
    label: `${o.out.carriers.join(" / ")} ${tr(lang, "fs.from", { ap: o.out.from })}, ${stops}`,
    detail: [o.out.route.join(" → "), o.back ? o.back.route.join(" → ") : ""].filter(Boolean).join(" · "),
    price: { mode: "unit", currency: o.currency, unit },
    source: { name: o.sourceName, at: day(), ...(o.url ? { url: o.url } : {}) },
    legs: [legOf("out", o.out), ...(o.back ? [legOf("back", o.back)] : [])]
  });
  const name = tr(lang, "fl.nameRoute", { a: o.out.fromCity || o.out.from, b: o.out.toCity || o.out.to });
  // Reisende mit eigenem Sitz, die noch in keinem Flug für einen Teil der Gruppe stecken
  const taken = new Set(trip.items.filter(i => i.cat === "flights" && i.participants).flatMap(i => i.participants!));
  const free = trip.travelers.filter(p => isActive(p) && ageClassOf(p.age, p.kind) !== "infant" && !taken.has(p.id)).map(p => p.id);
  const seats = split ? Math.max(1, split.seats) : 0;
  if (!split || (seats >= free.length && (split.travelers ?? free.length) >= free.length && !taken.size)) {
    return [push(trip, { id: uid(), cat: "flights", status: "idea", options: [opt(o.price)], ai: { at: at(), kind: "suggested" }, name })];
  }
  const ids = free.slice(0, Math.max(1, split.travelers ?? free.length));
  const per = o.price / seats, out: Item[] = [], n = Math.ceil(ids.length / seats);
  for (let i = 0; i < ids.length; i += seats) {
    const part = ids.slice(i, i + seats);
    out.push(push(trip, {
      id: uid(), cat: "flights", status: "idea", options: [opt(Math.round(per * part.length * 100) / 100)], participants: part,
      ai: { at: at(), kind: "suggested" }, name: n > 1 ? `${name} (${out.length + 1}/${n})` : name
    }));
  }
  return out;
}

/** Unterkunft aus der Suche als Posten mit Zeitraum (Preis für den ganzen Aufenthalt) */
export function addStay(trip: Trip, o: StayOffer, q: StayQuery, lang: string): Item {
  const opt: Option = {
    id: uid(), label: o.name, ...(o.place ? { detail: o.place } : {}),
    price: { mode: "unit", basis: "stay", currency: o.currency, unit: Math.round(o.total), capacity: Math.max(1, q.adults + q.childAges.length) },
    source: { name: o.sourceName, at: day(), ...(o.url ? { url: o.url } : {}) },
    stay: { ...(o.stars ? { stars: o.stars } : {}), ...(o.score != null ? { rating: Math.round(o.score * 10) } : {}), ...(o.facts?.length ? { facts: o.facts } : {}), ...(o.board ? { board: o.board } : {}), ...(o.image && /^https:\/\//.test(o.image) ? { image: o.image } : {}) },
    query: { place: q.place, country: q.country, checkin: q.checkin, checkout: q.checkout, adults: q.adults, childAges: [...q.childAges], rooms: q.rooms }
  };
  const item: Item = {
    id: uid(), cat: "stay", status: "idea", from: q.checkin, to: q.checkout, options: [opt], ai: { at: at(), kind: "suggested" },
    name: tr(lang, "st.itemName", { place: q.place })
  };
  return push(trip, item);
}

export interface Cost { cat: CatKey; name: string; eur: number; perPerson?: boolean; url?: string; arrival?: boolean }

/** eigener Kostenposten (Mietwagen, Tickets, Schätzung): für alle oder pro Person */
export function addCost(trip: Trip, c: Cost): Item {
  const opt: Option = {
    id: uid(), label: "",
    price: c.perPerson ? { mode: "person", currency: "EUR", adult: c.eur } : { mode: "unit", currency: "EUR", unit: c.eur },
    ...(c.url ? { source: { name: new URL(c.url).hostname, at: day(), url: c.url } } : {})
  };
  return push(trip, { id: uid(), cat: c.cat, name: c.name, status: "idea", options: [opt], ai: { at: at(), kind: "created" }, ...(c.arrival ? { arrival: true } : {}) });
}

function push(trip: Trip, item: Item): Item {
  trip.items.push(item);
  trip.detail = { ...(trip.detail || {}), [item.cat]: true };
  trip.ai = { at: at() };
  return item;
}

/** Posten entfernen; gebuchte und bezahlte bleiben (die ändert man in der App) */
export function removeItem(trip: Trip, id: string): "ok" | "missing" | "fixed" {
  const it = trip.items.find(i => i.id === id);
  if (!it) return "missing";
  if (it.status === "booked" || it.status === "paid") return "fixed";
  trip.items = trip.items.filter(i => i !== it);
  for (const x of trip.items) if (x.follow === id) x.follow = undefined;
  return "ok";
}

export const isCat = (v: unknown): v is CatKey => (CAT_KEYS as unknown[]).includes(v);

/** Betrag eines Postens grob in Euro (gewählte oder günstigste Option); genaue Aufteilung rechnet die App */
function itemEur(trip: Trip, it: Item): number | null {
  const people = trip.travelers.filter(isActive).length || 1;
  const val = (o: Option) => {
    const p = o.price, rate = trip.settings.rates?.[p.currency] || (p.currency === "EUR" ? 1 : 0);
    if (!rate) return null;
    const q = p.qty || 1;
    const sum = p.mode === "unit" ? (p.unit || 0) * q : (p.adult || 0) * q * (it.participants?.length || people);
    return sum / rate;
  };
  const opts = it.options.map(val).filter((x): x is number => x != null);
  if (!opts.length) return null;
  const ch = it.chosen ? it.options.findIndex(o => o.id === it.chosen) : -1;
  return Math.round(ch >= 0 ? val(it.options[ch]) ?? Math.min(...opts) : Math.min(...opts));
}

/** Reise für Claude: ohne Namen der Reisenden (nur Altersklassen), Posten mit Kennung, Status und Betrag */
export function tripSummary(trip: Trip, role: string, partner = false) {
  const act = trip.travelers.filter(isActive);
  const items = trip.items.filter(i => !i.auto).map(i => {
    const o = i.options.find(x => x.id === i.chosen) || i.options[0];
    const eur = itemEur(trip, i);
    return {
      id: i.id, category: i.cat, name: i.name || o?.label || "", status: i.status,
      ...(eur != null ? { eur } : {}), ...(o?.estimate ? { estimate: true } : {}), ...(i.arrival ? { arrival: true } : {}),
      ...(i.from ? { from: i.from, to: i.to } : {}), ...(o?.source?.url ? { link: partner ? o.source.url : plainLink(o.source.url) } : {}),
      ...(i.options.length > 1 ? { offers: i.options.length } : {})
    };
  });
  const cnt = (k: string) => act.filter(t => ageClassOf(t.age, t.kind) === k).length;
  const total = items.reduce((s, i) => s + (i.status !== "dropped" && "eur" in i ? (i.eur as number) : 0), 0);
  return {
    id: trip.id, name: trip.name, place: trip.place, country: trip.country || undefined, from: trip.from, to: trip.to, role,
    travelers: { adults: cnt("adult"), children: cnt("child"), infants: cnt("infant") },
    items, approxTotalEur: total,
    note: "Approximate total of the items (chosen or cheapest offer); exact split per person and meals are calculated in the Split&Fly app."
  };
}
