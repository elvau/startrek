/*
 * Rechenkern. Reine Funktionen ohne Oberfläche.
 * Übernimmt das Verhalten der bisherigen App (public/index.html, calcItem und totals):
 * Altersklassen, Kinder- und Kleinkindpreise, Gruppenrabatt-Stufen, Verteilung auf
 * Beteiligte, Währungsumrechnung.
 */
import { flightAccess, needs, nightsList, okDate, presenceOf, type AccessCalc, type Presence } from "./travel";
import { CAT_KEYS, FIXED, hhKey, isActive, isDetailed, type AgeClass, type CatKey, type Item, type Option, type Settings, type Tier, type Traveler, type Trip } from "../model";

export function ageClass(age: number | null | undefined, s: Settings, kind?: AgeClass): AgeClass {
  // ohne Altersangabe: angegebene Klasse (Platzhalter), sonst erwachsen
  if (age == null || (age as unknown) === "") return kind || "adult";
  if (age >= s.adultAge) return "adult";
  if (age >= s.childAge) return "child";
  return "infant";
}

/** Höchster Rabatt, dessen Mindestanzahl erreicht ist */
export function bestTier(tiers: Tier[] | undefined, n: number): Tier | null {
  let best: Tier | null = null;
  for (const t of tiers || []) {
    if (t.min > 0 && t.pct > 0 && n >= t.min && (!best || t.pct > best.pct)) best = t;
  }
  return best;
}

export const participantsOf = (it: Item, trip: Trip): Traveler[] =>
  trip.travelers.filter(t => isActive(t) && (!it.participants || it.participants.includes(t.id)));

export const activeTravelers = (trip: Trip) => trip.travelers.filter(isActive);

const rateOf = (cur: string, s: Settings) => (cur === "EUR" ? 1 : s.rates[cur] || 1);

export interface StayCalc {
  nights: string[];
  /** Personen je Nacht */
  occ: Record<string, number>;
  /** Nächte je Person */
  w: Record<string, number>;
  maxOcc: number;
  /** mehr Gäste als Plätze in mindestens einer Nacht */
  over: boolean;
}

export interface OptionCalc {
  /** Anzahl Beteiligte */
  n: number;
  /** gebuchte Einheiten (mode "unit") */
  units: number;
  gross: number;
  net: number;
  saved: number;
  tier: Tier | null;
  /** Anteil je Person nach Rabatt, in € */
  per: Record<string, number>;
  /** Flug: Anreise zum Abflughafen, in gross und net enthalten */
  access?: AccessCalc | null;
  /** Unterkunft mit Zeitraum */
  stay?: StayCalc;
}

const hasStayDates = (it: Item) => it.cat === "stay" && okDate(it.from) && okDate(it.to) && it.to! > it.from!;

export function calcOption(opt: Option, it: Item, trip: Trip): OptionCalc {
  if (hasStayDates(it)) return calcStay(opt, it, trip);
  const people = participantsOf(it, trip);
  const n = people.length;
  const p = opt.price;
  const fx = 1 / rateOf(p.currency, trip.settings);
  const qty = p.qty ?? 1;
  const tier = it.tier ? bestTier([it.tier], n) : bestTier(trip.tiers[it.cat], n);
  const d = tier ? tier.pct / 100 : 0;
  const per: Record<string, number> = {};
  let gross = 0, units = 0;
  if (p.mode === "unit") {
    const cap = p.capacity || 0;
    units = n === 0 ? 0 : cap > 0 && p.multiply ? Math.ceil(n / cap) : 1;
    gross = (p.unit || 0) * units * qty * fx;
    people.forEach(t => (per[t.id] = n ? (gross * (1 - d)) / n : 0));
  } else {
    people.forEach(t => {
      const g = priceFor(t, p, trip) * qty * fx;
      gross += g;
      per[t.id] = g * (1 - d);
    });
  }
  const access = it.cat === "flights" && it.access !== false ? flightAccess(opt, people, trip) : null;
  const acc = access?.cost || 0;
  if (access) for (const id in access.per) per[id] = (per[id] || 0) + access.per[id];
  return { n, units, gross: gross + acc, net: gross * (1 - d) + acc, saved: gross * d, tier, per, access };
}

function priceFor(t: Traveler, p: Option["price"], trip: Trip): number {
  const c = ageClass(t.age, trip.settings, t.kind);
  let pr = p.adult ?? 0;
  if (c !== "adult" && p.child != null) pr = p.child;
  if (c === "infant" && p.infant != null) pr = p.infant;
  return pr;
}

/** Anwesenheit aller Reisenden (aus eigenen Daten oder dem gewählten Flug) */
export function presences(trip: Trip): Record<string, Presence | null> {
  const out: Record<string, Presence | null> = {};
  trip.travelers.forEach(t => (out[t.id] = presenceOf(t, trip, x => activeOption(x, trip))));
  return out;
}

/**
 * Unterkunft mit Zeitraum: jede Nacht zählt nur für die, die da sind.
 * Pauschalen werden je Nacht auf die Anwesenden verteilt, Personenpreise gelten pro Nacht.
 */
function calcStay(opt: Option, it: Item, trip: Trip): OptionCalc {
  const pres = presences(trip);
  const nights = nightsList(it.from, it.to);
  const people = participantsOf(it, trip);
  const w: Record<string, number> = {}, occ: Record<string, number> = {}, here: Record<string, Traveler[]> = {};
  nights.forEach(x => (here[x] = []));
  people.forEach(t => {
    const ns = nights.filter(x => needs(pres[t.id], x));
    if (ns.length) { w[t.id] = ns.length; ns.forEach(x => { occ[x] = (occ[x] || 0) + 1; here[x].push(t); }); }
  });
  const guests = people.filter(t => w[t.id]);
  const n = guests.length, sumW = guests.reduce((a, t) => a + w[t.id], 0);
  const maxOcc = Math.max(0, ...Object.values(occ));
  const p = opt.price, fx = 1 / rateOf(p.currency, trip.settings), qty = p.qty ?? 1;
  const cap = p.capacity || 0, multi = p.mode === "unit" && !!p.multiply;
  const tier = it.tier ? bestTier([it.tier], n) : bestTier(trip.tiers[it.cat], n);
  const d = tier ? tier.pct / 100 : 0;
  const per: Record<string, number> = {};
  let gross = 0, units = 0;
  if (p.mode === "unit") {
    units = n === 0 ? 0 : cap > 0 && multi ? Math.ceil(maxOcc / cap) : 1;
    gross = (p.unit || 0) * (p.basis === "stay" ? 1 : nights.length) * units * qty * fx;
    const perNight = nights.length ? (gross * (1 - d)) / nights.length : 0;
    let rest = 0;
    guests.forEach(t => (per[t.id] = 0));
    nights.forEach(x => { const hs = here[x]; if (hs.length) hs.forEach(t => (per[t.id] += perNight / hs.length)); else rest += perNight; });
    if (rest && sumW) guests.forEach(t => (per[t.id] += (rest * w[t.id]) / sumW));
  } else {
    guests.forEach(t => {
      const g = priceFor(t, p, trip) * w[t.id] * qty * fx;
      gross += g;
      per[t.id] = g * (1 - d);
    });
  }
  const over = cap > 0 && !multi && maxOcc > cap;
  return { n, units, gross, net: gross * (1 - d), saved: gross * d, tier, per, stay: { nights, occ, w, maxOcc, over } };
}

/** Flug-Posten, dem dieser Posten folgt (nur eine Stufe, nie sich selbst) */
export function followed(it: Item, trip: Trip): Item | null {
  if (it.cat !== "flights" || !it.follow || it.follow === it.id) return null;
  const m = trip.items.find(x => x.id === it.follow && x.cat === "flights" && !x.follow && x.status !== "dropped");
  return m || null;
}

/**
 * Mitfliegen: gleicher Flug wie der andere Posten, Preis pro Person daraus
 * (pauschal geteilt durch dessen Mitfliegende, sonst dessen Erwachsenen-, Kinder- und Babypreis).
 */
function followOption(main: Item, trip: Trip): Option | null {
  const o = activeOption(main, trip);
  if (!o) return null;
  const p = o.price, n = participantsOf(main, trip).length || 1;
  const price: Option["price"] = p.mode === "unit"
    ? { mode: "person", currency: p.currency, adult: Math.round(((p.unit || 0) * (p.qty ?? 1) / n) * 100) / 100 }
    : { mode: "person", currency: p.currency, adult: p.adult, child: p.child, infant: p.infant, qty: p.qty };
  return { id: `follow:${main.id}`, label: `wie ${main.name || "anderer Flug"}`, detail: o.detail, price, source: o.source, legs: o.legs };
}

/** Die Option, die in die Summe eingeht: gewählt, sonst die günstigste; beim Mitfliegen der Flug des anderen Postens */
export function activeOption(it: Item, trip: Trip): Option | null {
  const main = followed(it, trip);
  if (main) return followOption(main, trip);
  if (!it.options.length) return null;
  const chosen = it.chosen && it.options.find(o => o.id === it.chosen);
  if (chosen) return chosen;
  return it.options.reduce((a, b) => (calcOption(b, it, trip).net < calcOption(a, it, trip).net ? b : a));
}

export interface ItemCalc extends OptionCalc {
  option: Option | null;
  paid: number;
  counts: boolean;
}

const EMPTY: OptionCalc = { n: 0, units: 0, gross: 0, net: 0, saved: 0, tier: null, per: {} };

export function calcItem(it: Item, trip: Trip): ItemCalc {
  const option = activeOption(it, trip);
  const r = option ? calcOption(option, it, trip) : { ...EMPTY };
  const paid = it.status === "paid" ? r.net : (it.payments || []).reduce((a, x) => a + (x.amount || 0), 0);
  return { ...r, option, paid, counts: it.status !== "dropped" };
}

export interface Totals {
  total: number;
  saved: number;
  /** gebucht oder bezahlt */
  fixed: number;
  /** Idee oder gewählt, dazu alle einfachen Beträge */
  open: number;
  paid: number;
  byCat: Record<CatKey, number>;
  byPerson: Record<string, number>;
  byHousehold: Record<string, number>;
  items: Record<string, ItemCalc>;
  /** einfacher Modus: Betrag je Bereich (nur Bereiche, die nicht detailliert sind) */
  simple: Partial<Record<CatKey, number>>;
  /** Anzahl Aktive, auf die einfache Beträge verteilt werden */
  active: number;
}

export function totals(trip: Trip): Totals {
  const byCat = { flights: 0, stay: 0, transport: 0, attractions: 0, misc: 0 } as Record<CatKey, number>;
  const byPerson: Record<string, number> = {};
  const byHousehold: Record<string, number> = {};
  const items: Record<string, ItemCalc> = {};
  const simple: Partial<Record<CatKey, number>> = {};
  trip.travelers.forEach(t => (byPerson[t.id] = 0));
  const act = activeTravelers(trip);
  let total = 0, saved = 0, fixed = 0, paid = 0;
  for (const cat of CAT_KEYS) {
    if (isDetailed(trip, cat)) continue;
    // einfacher Modus: ein Betrag, gleich auf alle Aktiven verteilt
    const v = Math.max(0, trip.simple?.[cat] || 0);
    simple[cat] = v;
    if (!v) continue;
    total += v;
    byCat[cat] += v;
    act.forEach(t => (byPerson[t.id] += v / act.length));
  }
  for (const it of trip.items) {
    const r = calcItem(it, trip);
    // Posten in einfachen Bereichen bleiben erhalten, zählen aber nicht
    if (!isDetailed(trip, it.cat)) r.counts = false;
    items[it.id] = r;
    if (!r.counts) continue;
    total += r.net;
    saved += r.saved;
    paid += Math.min(r.paid, r.net);
    if (FIXED.includes(it.status)) fixed += r.net;
    byCat[it.cat] += r.net;
    for (const id in r.per) byPerson[id] = (byPerson[id] || 0) + r.per[id];
  }
  trip.travelers.forEach(t => {
    if (!isActive(t)) return;
    const h = t.household.trim() || "Ohne Haushalt";
    byHousehold[h] = (byHousehold[h] || 0) + (byPerson[t.id] || 0);
  });
  return { total, saved, fixed, open: total - fixed, paid, byCat, byPerson, byHousehold, items, simple, active: act.length };
}

/** Zahl aus deutscher oder englischer Eingabe, wie in der alten App */
export function parseNum(v: unknown): number {
  if (v == null) return NaN;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s|€|¥/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

const fmt = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
export const eur = (v: number) => fmt.format(Math.round(v || 0)) + " €";

/* ---------- Abrechnung pro Haushalt ---------- */

export interface ShareLine {
  /** fehlt bei einfachen Beträgen */
  item?: Item;
  label: string;
  /** Anteil des Haushalts */
  v: number;
  /** wie viele aus dem Haushalt dabei sind */
  who: number;
  /** z. B. "2 × Erwachsen 389 € · 2 × Kind 290 €", wenn sich die Anteile unterscheiden */
  detail: string;
  fixed: boolean;
}
export interface HouseholdShare {
  name: string;
  members: { t: Traveler; v: number }[];
  total: number;
  fixed: number;
  open: number;
  cats: { cat: CatKey; sum: number; lines: ShareLine[] }[];
}

const AGE_L: Record<AgeClass, string> = { adult: "Erwachsen", child: "Kind", infant: "Kleinkind" };

export function householdShares(trip: Trip, T: Totals = totals(trip)): HouseholdShare[] {
  const names = [...new Set(activeTravelers(trip).map(hhKey))];
  return names.map(name => {
    const ms = activeTravelers(trip).filter(t => hhKey(t) === name);
    const cats = CAT_KEYS.map(cat => {
      const lines: ShareLine[] = [];
      const sv = T.simple[cat];
      if (sv && T.active) {
        lines.push({ label: "Gesamtbetrag, gleich verteilt", v: (sv / T.active) * ms.length, who: ms.length, detail: `${eur(sv / T.active)} pro Person`, fixed: false });
      }
      for (const it of trip.items) {
        if (it.cat !== cat) continue;
        const r = T.items[it.id];
        if (!r || !r.counts) continue;
        const inn = ms.filter(t => r.per[t.id] != null && r.per[t.id] > 0.005);
        const v = inn.reduce((a, t) => a + r.per[t.id], 0);
        if (v < 0.5) continue;
        const grp: Partial<Record<AgeClass, { n: number; v: number }>> = {};
        inn.forEach(t => { const c = ageClass(t.age, trip.settings, t.kind); (grp[c] ||= { n: 0, v: Math.round(r.per[t.id]) }).n++; });
        const keys = (["adult", "child", "infant"] as AgeClass[]).filter(c => grp[c]);
        const differ = new Set(inn.map(t => Math.round(r.per[t.id]))).size > 1;
        const detail = differ && keys.length > 1 && new Set(keys.map(c => grp[c]!.v)).size > 1
          ? keys.map(c => `${grp[c]!.n} × ${AGE_L[c]} ${eur(grp[c]!.v)}`).join(" · ")
          : "";
        lines.push({ item: it, label: it.name || "Ohne Namen", v, who: inn.length, detail, fixed: FIXED.includes(it.status) });
      }
      return { cat, sum: lines.reduce((a, l) => a + l.v, 0), lines };
    }).filter(c => c.lines.length);
    const total = cats.reduce((a, c) => a + c.sum, 0);
    const fixed = cats.reduce((a, c) => a + c.lines.filter(l => l.fixed).reduce((x, l) => x + l.v, 0), 0);
    return { name, members: ms.map(t => ({ t, v: T.byPerson[t.id] || 0 })), total, fixed, open: total - fixed, cats };
  });
}
