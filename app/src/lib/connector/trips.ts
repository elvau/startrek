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
import { ACCESS_MODES, CAT_KEYS, DEFAULT_SETTINGS, hhKey, type AccessMode, type Household, isActive, uid, type CatKey, type Item, type Option, type Person, type Status, type Traveler, type Trip } from "../model";
import { applyPeople } from "../people";
import type { FlightOffer, OfferLeg } from "../flights/types";
import { plainLink } from "../partner";
import { locOf } from "../geo/maps";

const withLoc = <T>(loc: T | undefined) => (loc ? { loc } : {});
import type { StayOffer, StayQuery } from "../stays/types";
import { feeToExtra } from "../stays/fees";

/** Flug aus der Suche als Teilstrecke; Dauer aus der Suche, weil Abflug und Landung Ortszeiten sind */
const legOf = (dir: "out" | "back", l: OfferLeg) => ({ dir, from: l.from, to: l.to, dep: l.dep.slice(0, 16), arr: l.arr.slice(0, 16), carrier: l.carriers.join(" / "), stops: l.stops, ...(l.minutes > 0 ? { minutes: l.minutes } : {}), ...(l.toCity ? { toCity: l.toCity } : {}) });

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
  /** echte Reisende aus dem Konto (#595) statt Platzhaltern; people: gespeicherte Personen für Wohnort und Alter */
  travelers?: Traveler[];
  people?: Person[];
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
    // Preisstufe aus dem Alter wie in der App (ab adultAge Erwachsenentarif); Jugendliche heißen trotzdem Kind und
    // zählen nicht als Erwachsene der Gruppe (z. B. Fahrer)
    const k = ageClassOf(age);
    if (age >= 18) out.push(mk(tr(lang, "ph.adult", { a, k: ++ad }), "adult", age));
    else if (k === "infant") out.push(mk(tr(lang, "ph.infant", { a, k: ++i }), "infant", age));
    else out.push(mk(tr(lang, "ph.child", { a, k: ++c }), "child", age));
  }
  return out;
}

export function newTrip(o: NewTrip): Trip {
  const travelers = o.travelers?.length ? o.travelers : placeholders(Math.max(1, Math.min(20, o.adults)), (o.childAges || []).slice(0, 10), o.lang);
  const name = (o.name || "").trim().slice(0, 120) || o.place.trim().slice(0, 120);
  const trip: Trip = {
    id: uid() + uid(), name, autoName: false, place: o.place.trim().slice(0, 80), country: (o.country || "").trim().slice(0, 60),
    ...(o.from ? { from: o.from } : {}), ...(o.to ? { to: o.to } : {}),
    travelers, items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, detail: {}
  };
  // Wohnort der Familien und Alter zum Reisebeginn wie in der App
  if (o.people) applyPeople(trip, o.people);
  return trip;
}

const at = () => new Date().toISOString();
const day = () => new Date().toISOString().slice(0, 10);


/**
 * Flug aus der Suche als Posten. Ohne seats: Gesamtpreis für alle, gleich verteilt. Mit seats (so viele Plätze hatte
 * die Suche): für `travelers` Reisende, die noch keinen eigenen Flug haben, in Buchungen zu höchstens `seats` Plätzen,
 * je Buchung ein Posten mit ihren Reisenden und Preis pro Platz mal Personen. Mit ids genau diese Reisenden (z. B. Zubringer
 * nur für die Mutter), auch wenn sie schon einen anderen Flug haben.
 */
export function addFlight(trip: Trip, o: FlightOffer, lang: string, split?: { seats: number; travelers?: number; ids?: string[] }): Item[] {
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
  if (!split || (!split.ids && seats >= free.length && (split.travelers ?? free.length) >= free.length && !taken.size)) {
    return [push(trip, { id: uid(), cat: "flights", status: "idea", options: [opt(o.price)], ai: { at: at(), kind: "suggested" }, name })];
  }
  const ids = split.ids || free.slice(0, Math.max(1, split.travelers ?? free.length));
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
    ...withLoc(locOf(o.name, q.place, o)),
    query: { place: q.place, country: q.country, checkin: q.checkin, checkout: q.checkout, adults: q.adults, childAges: [...q.childAges], rooms: q.rooms },
    ...(o.fees?.length ? { extras: o.fees.map(f => feeToExtra(f, o.sourceName)) } : {})
  };
  const item: Item = {
    id: uid(), cat: "stay", status: "idea", from: q.checkin, to: q.checkout, options: [opt], ai: { at: at(), kind: "suggested" },
    name: tr(lang, "st.itemName", { place: q.place })
  };
  return push(trip, item);
}

export interface Cost {
  cat: CatKey; name: string; eur: number; perPerson?: boolean; url?: string; arrival?: boolean; estimate?: boolean;
  /** schon gewählt, gebucht oder bezahlt (fehlt: Idee); bezahlt von dieser Familie (Kasse) mit Datum, Buchungsnummer */
  status?: Status; paidBy?: string; paidAt?: string; bookingRef?: string;
}

/** eigener Kostenposten (Mietwagen, Tickets, Schätzung): für alle oder pro Person */
export function addCost(trip: Trip, c: Cost): Item {
  const opt: Option = {
    id: uid(), label: "",
    price: c.perPerson ? { mode: "person", currency: "EUR", adult: c.eur } : { mode: "unit", currency: "EUR", unit: c.eur },
    ...(c.estimate ? { estimate: true } : {}),
    ...(c.url ? { source: { name: new URL(c.url).hostname, at: day(), url: c.url } } : {})
  };
  return push(trip, {
    id: uid(), cat: c.cat, name: c.name, status: c.status || "idea", options: [opt], ai: { at: at(), kind: "created" }, ...(c.arrival ? { arrival: true } : {}),
    ...(c.bookingRef ? { booking: { ref: c.bookingRef } } : {}),
    ...(c.paidBy ? { payments: [{ amount: c.eur, by: c.paidBy, at: c.paidAt || day() }] } : {})
  });
}

function push(trip: Trip, item: Item): Item {
  trip.items.push(item);
  trip.detail = { ...(trip.detail || {}), [item.cat]: true };
  trip.ai = { at: at() };
  return item;
}

/* ---------- Stand der KI (#603): was wurde seitdem in der App geändert? ---------- */

type Seen = NonNullable<Trip["aiSeen"]>;
function hash(v: unknown): string {
  const s = JSON.stringify(v);
  let h = 2166136261;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
/** nur, was der Nutzer ändert (keine Alter, Kurse, Preisbeobachtung: die schreibt die App selbst) */
const metaSig = (t: Trip) => hash([t.name, t.place, t.country || "", t.from || "", t.to || "", t.travelers.filter(isActive).map(p => p.id)]);
const itemSig = (i: Item) => hash([i.cat, i.name || "", i.status, i.chosen || "", i.from || "", i.to || "", i.participants || [], i.options.map(o => [o.id, o.label, o.price])]);
const own = (t: Trip) => t.items.filter(i => !i.auto);
const stateOf = (t: Trip): Seen => ({ m: metaSig(t), i: Object.fromEntries(own(t).map(i => [i.id, itemSig(i)])) });

/** als von der KI angelegt markieren bzw. nach Rückfrage den jetzigen Stand übernehmen */
export function aiKnows(t: Trip) { t.aiSeen = stateOf(t); }

/**
 * Änderungen seit dem Stand der KI, für die Rückfrage beim Nutzer; null: Reise nicht von der KI angelegt.
 * Kennung „meta“ für Name, Ziel, Zeitraum, Reisende, sonst die Posten.
 */
export function changesSinceAi(t: Trip): { id: string; what: "added" | "changed" | "removed"; name: string }[] | null {
  const s = t.aiSeen;
  if (!s) return null;
  const out: { id: string; what: "added" | "changed" | "removed"; name: string }[] = [];
  if (metaSig(t) !== s.m) out.push({ id: "meta", what: "changed", name: "name, destination, dates or travelers" });
  const cur = own(t);
  for (const i of cur) {
    const name = i.name || i.options[0]?.label || i.cat;
    if (!s.i[i.id]) out.push({ id: i.id, what: "added", name });
    else if (s.i[i.id] !== itemSig(i)) out.push({ id: i.id, what: "changed", name });
  }
  for (const id of Object.keys(s.i)) if (!cur.some(i => i.id === id)) out.push({ id, what: "removed", name: id });
  return out;
}

/**
 * Stand fortschreiben nach einer Änderung der KI: was sie gerade geschrieben hat, kennt sie; was der Nutzer vorher
 * geändert hatte, bleibt als geändert stehen (before: Stand der Reise vor der Änderung der KI)
 */
export function aiWrote(t: Trip, before: Seen) {
  const s = t.aiSeen;
  if (!s) return;
  const now = stateOf(t), i: Record<string, string> = {};
  for (const [id, h] of Object.entries(now.i)) {
    if (!(id in before.i)) i[id] = h;                      // gerade von der KI angelegt
    else if (s.i[id] && s.i[id] === before.i[id]) i[id] = h; // unverändert seit der KI
    else if (s.i[id]) i[id] = s.i[id];                      // in der App geändert: bleibt geändert
  }
  for (const id of Object.keys(s.i)) if (!(id in before.i)) i[id] = s.i[id]; // in der App entfernt
  t.aiSeen = { m: s.m === before.m ? now.m : s.m, i };
}
export const aiState = stateOf;

export interface TripChange { name?: string; place?: string; country?: string; from?: string; to?: string }

/** Eckdaten ändern; gibt Flüge und Unterkünfte zurück, die nicht mehr in den Zeitraum passen (bleiben stehen) */
export function updateTrip(t: Trip, u: TripChange): { id: string; name: string }[] {
  if (u.name) { t.name = u.name.trim().slice(0, 120); t.autoName = false; }
  if (u.place) t.place = u.place.trim().slice(0, 80);
  if (u.country != null) t.country = u.country.trim().slice(0, 60);
  if (u.from) t.from = u.from;
  if (u.to) t.to = u.to;
  const lo = t.from, hi = t.to;
  if (!lo && !hi) return [];
  const out = (d?: string) => !!d && ((!!lo && d.slice(0, 10) < lo) || (!!hi && d.slice(0, 10) > hi));
  return own(t).filter(i => {
    const o = i.options.find(x => x.id === i.chosen) || i.options[0];
    return out(i.from) || out(i.to) || (o?.legs || []).some(l => out(l.dep));
  }).map(i => ({ id: i.id, name: i.name || i.options[0]?.label || i.cat }));
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

/**
 * Posten, mit denen neue doppelt sein könnten: Flüge derselben Reisenden (ohne participants: alle) in dieselbe Richtung ab
 * oder nach demselben Flughafen; Unterkünfte mit überschneidendem Zeitraum. Zubringer (DTM → KTW, dann KTW → AGP) zählen nicht.
 */
export function clashes(trip: Trip, added: Item[]): Item[] {
  const all = trip.travelers.filter(isActive).map(t => t.id);
  const who = (i: Item) => new Set(i.participants?.length ? i.participants : all);
  const legs = (i: Item) => i.options.flatMap(o => o.legs || []);
  const fresh = new Set(added.map(i => i.id));
  return trip.items.filter(x => !fresh.has(x.id) && x.status !== "dropped" && x.cat === added[0]?.cat && added.some(n => {
    if (n.cat === "stay") return !!(x.from && x.to && n.from && n.to && x.from < n.to && n.from < x.to);
    if (n.cat !== "flights") return false;
    const a = who(x);
    if (![...who(n)].some(id => a.has(id))) return false;
    return legs(n).some(l => legs(x).some(m => m.dir === l.dir && (m.from === l.from || m.to === l.to)));
  }));
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

/** Reise für den Assistenten: Reisende (Vorname, Familie, Alter, Wohnort der Familie, #608), Posten mit Kennung, Status und Betrag */
export function tripSummary(trip: Trip, role: string, partner = false) {
  const act = trip.travelers.filter(isActive);
  const items = trip.items.filter(i => !i.auto).map(i => {
    const o = i.options.find(x => x.id === i.chosen) || i.options[0];
    const eur = itemEur(trip, i);
    const name = i.name || o?.label || "";
    return {
      id: i.id, category: i.cat, name, status: i.status,
      // Angebot (z. B. Hotelname) und Verpflegung, sonst sieht Claude bei Unterkünften nur „Unterkunft in …“
      ...(o?.label && o.label !== name ? { offer: o.label } : {}), ...(o?.stay?.board ? { board: o.stay.board } : {}), ...(o?.stay?.stars ? { stars: o.stay.stars } : {}),
      ...(eur != null ? { eur } : {}), ...(o?.estimate ? { estimate: true } : {}), ...(i.arrival ? { arrival: true } : {}),
      ...(i.from ? { from: i.from, to: i.to } : {}), ...(o?.source?.url ? { link: partner ? o.source.url : plainLink(o.source.url) } : {}),
      ...(i.options.length > 1 ? { offers: i.options.length } : {}),
      // Nebenkosten (nicht enthalten, nicht weggeklickt) und Kaution: die genaue Summe rechnet die App
      ...(o?.extras?.some(x => !x.off && x.pay !== "included") ? { extraCosts: o.extras.filter(x => !x.off && x.pay !== "included").map(x => ({ kind: x.kind, amount: x.amount, per: x.basis, pay: x.pay, ...(x.est ? { estimate: true } : {}) })) } : {}),
      ...(o?.deposit?.amount ? { deposit: { amount: o.deposit.amount, currency: o.price.currency, ...(o.deposit.how ? { how: o.deposit.how } : {}) } } : {})
    };
  });
  const cnt = (k: string) => act.filter(t => ageClassOf(t.age, t.kind) === k).length;
  const teens = act.filter(t => t.age != null && t.age < 18 && ageClassOf(t.age) === "adult").length;
  const total = items.reduce((s, i) => s + (i.status !== "dropped" && "eur" in i ? (i.eur as number) : 0), 0);
  return {
    id: trip.id, name: trip.name, place: trip.place, country: trip.country || undefined, from: trip.from, to: trip.to, role,
    travelers: { adults: cnt("adult"), children: cnt("child"), infants: cnt("infant"), ...(teens ? { teens, note: "Teens (12-17) pay adult fares and are counted in adults" } : {}) }, ...tripPeople(trip),
    items, approxTotalEur: total, ...(trip.prefs && Object.keys(trip.prefs).length ? { preferences: trip.prefs } : {}),
    note: "Approximate total of the items (chosen or cheapest offer), without extraCosts (tourist tax, cleaning, baggage … paid on site or extra; add them when comparing) and without deposits (only blocked, credit card only if how = credit). The way to the departure airport and back (car incl. parking or train, per household) and meals are added automatically by the Split&Fly app and are not listed here; do not add them. Exact split per person is calculated in the app."
  };
}

/* ---------- Reisende einer Reise (Namen, Familien, Wohnorte), #608 ---------- */

type Home = NonNullable<Person["home"]>;
const homeOf = (h: { plz?: string; geo?: { ort: string }; cc?: string } | undefined) =>
  h?.geo?.ort ? [[h.plz, h.geo.ort].filter(Boolean).join(" "), h.cc && h.cc !== "DE" ? h.cc : ""].filter(Boolean).join(", ") : undefined;

/** Reisende für den Assistenten: Kennung, Vorname, Familie, Alter bzw. Altersklasse; Familien mit Wohnort */
export function tripPeople(trip: Trip) {
  const act = trip.travelers.filter(isActive);
  return {
    people: act.map(t => ({
      id: t.id, first: t.name, family: hhKey(t), ...(t.age != null ? { age: t.age } : { kind: ageClassOf(t.age, t.kind) }),
      ...(t.placeholder ? { placeholder: true } : {}), ...(t.personId ? { saved: t.personId } : {})
    })),
    families: [...new Set(act.map(hhKey))].map(name => {
      const h = trip.households?.[name], home = homeOf(h);
      return { name, ...(home ? { home } : {}), ...(h ? householdView(h) : {}) };
    })
  };
}

/** Einstellungen einer Familie, wie der Assistent sie setzt (update_travelers households) */
export interface HouseholdInput {
  toAirport?: AccessMode; carpoolWith?: string; cars?: number; parkingFree?: boolean; parkingEur?: number | null; rideEur?: number | null;
  purse?: "joint" | "each"; arrive?: string | null; depart?: string | null;
}

function householdView(h: Household): HouseholdInput {
  return {
    ...(h.mode ? { toAirport: h.mode } : {}), ...(h.link ? { carpoolWith: h.link } : {}), ...(h.cars ? { cars: h.cars } : {}),
    ...(h.parking?.off ? { parkingFree: true } : {}), ...(h.parking?.paid != null ? { parkingEur: h.parking.paid } : {}), ...(h.ride ? { rideEur: h.ride } : {}),
    ...(h.kasse ? { purse: h.kasse } : {}), ...(h.arrive ? { arrive: h.arrive } : {}), ...(h.depart ? { depart: h.depart } : {})
  };
}

/**
 * Anreise zum Flughafen, Kasse und eigene Anwesenheit einer Familie wie in den Familien-Einstellungen der App.
 * Gibt einen Fehlertext zurück, sonst null. null bei Beträgen und Tagen: Angabe entfernen.
 */
export function setHousehold(trip: Trip, family: string, s: HouseholdInput): string | null {
  const fams = new Set(trip.travelers.filter(isActive).map(hhKey));
  if (!fams.has(family)) return `Unknown family "${family}" in this trip: use a family name from get_trip`;
  trip.households ||= {};
  const h: Household = { ...(trip.households[family] || {}) };
  if (s.toAirport != null) {
    if (!ACCESS_MODES.includes(s.toAirport)) return `toAirport must be one of ${ACCESS_MODES.join(", ")}`;
    h.mode = s.toAirport;
    if (s.toAirport !== "with") delete h.link;
  }
  if (s.carpoolWith != null) {
    if (!fams.has(s.carpoolWith) || s.carpoolWith === family) return `carpoolWith must be another family in this trip`;
    h.mode = "with"; h.link = s.carpoolWith;
  }
  if (h.mode === "with" && !h.link) return "toAirport with needs carpoolWith (the family they ride with)";
  if (s.cars != null) h.cars = Math.max(1, Math.min(5, Math.round(s.cars)));
  if (s.parkingFree != null || s.parkingEur !== undefined) {
    const paid = s.parkingEur === undefined ? h.parking?.paid : s.parkingEur ?? undefined;
    const off = s.parkingFree ?? (s.parkingEur != null ? false : h.parking?.off);
    h.parking = { ...(off ? { off: true } : {}), ...(paid != null && !off ? { paid: Math.max(0, paid) } : {}) };
    if (!h.parking.off && h.parking.paid == null) delete h.parking;
  }
  if (s.rideEur !== undefined) { if (s.rideEur == null) delete h.ride; else h.ride = Math.max(0, s.rideEur); }
  if (s.purse) h.kasse = s.purse;
  for (const k of ["arrive", "depart"] as const) {
    const v = s[k];
    if (v === undefined) continue;
    if (v == null) { delete h[k]; continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${k} must be YYYY-MM-DD`;
    h[k] = v;
  }
  if (h.arrive && h.depart && h.depart < h.arrive) return "depart is before arrive";
  trip.households[family] = h;
  return null;
}

/** Wohnort einer Familie in der Reise (Anfahrt zum Flughafen, Startort) */
export function setHome(trip: Trip, family: string, h: Home) {
  trip.households ||= {};
  const cur = trip.households[family] || {};
  trip.households[family] = { ...cur, plz: h.plz, geo: { lat: h.lat, lon: h.lon, ort: h.ort }, ...(h.cc && h.cc !== "DE" ? { cc: h.cc } : {}) };
  if (!h.cc || h.cc === "DE") delete trip.households[family].cc;
}

/**
 * Familie umbenennen (Tippfehler wie „Brink“ → „Brinck“): Reisende, Einstellungen der Familie, Zahlungen, Kasse, Verpflegung
 * und Gruppenbus. Gibt es die neue Familie schon, kommen die Reisenden dazu (ihre Einstellungen bleiben).
 */
export function renameFamily(trip: Trip, from: string, to: string): number {
  const f = from.trim(), n = to.trim();
  const hit = trip.travelers.filter(t => hhKey(t) === f);
  if (!hit.length || !n || n === f) return hit.length;
  const re = (k: string) => (k === f ? n : k);
  for (const t of hit) t.household = n;
  if (trip.households?.[f]) {
    if (!trip.households[n]) trip.households[n] = trip.households[f];
    delete trip.households[f];
  }
  for (const h of Object.values(trip.households || {})) if (h.link) h.link = re(h.link);
  for (const i of trip.items) {
    for (const p of i.payments || []) if (p.by) p.by = re(p.by);
    if (i.hh && i.hh !== "*") i.hh = i.hh.split("|").map(re).join("|");
  }
  for (const e of trip.expenses || []) { e.by = re(e.by); if (e.for) e.for = e.for.map(re); }
  for (const x of trip.transfers || []) { x.from = re(x.from); x.to = re(x.to); }
  if (trip.bus?.from) trip.bus.from = re(trip.bus.from);
  if (trip.food?.hh?.[f]) { trip.food.hh[n] ??= trip.food.hh[f]; delete trip.food.hh[f]; }
  return hit.length;
}

/** Vorname, Familie bzw. Alter eines Reisenden ändern; Platzhalter werden mit Vornamen zu echten Reisenden */
export function changeTraveler(trip: Trip, c: { id: string; first?: string; family?: string; age?: number }): boolean {
  const t = trip.travelers.find(x => x.id === c.id);
  if (!t) return false;
  if (c.first) t.name = c.first;
  if (c.family) t.household = c.family;
  if (c.age != null) { t.age = c.age; t.kind = undefined; }
  if (c.first) t.placeholder = undefined;
  return true;
}
