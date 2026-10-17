/*
 * Transport vor Ort als versteckte Kosten (#420, Epic #417): Schätzung, solange nichts Eigenes geplant ist.
 * - Flughafentransfer hin und zurück (günstigste Möglichkeit aus transferChoices), wenn geflogen wird, kein Auto vor Ort
 *   ist und es noch keinen Transfer-Posten gibt.
 * - Unterwegs vor Ort (Ausflüge, Wege zu den Aktivitäten): ohne Auto Nahverkehr pro Person und Tag nach Preisniveau,
 *   mit Mietwagen, eigenem Auto oder Camper Sprit für LOCAL_KM pro Tag. Eigene Transport-Posten (Ticket, Pass,
 *   Schätzung der KI) ersetzen diesen Teil.
 * Zwei automatische Posten (auto "local") im Kapitel Vor Ort; ausschaltbar je Reise (trip.local).
 */
import { t, tn } from "./i18n/index.svelte";
import { ageClass } from "./calc";
import { okDate, dayDiff } from "./calc/travel";
import { isActive, uid, type Item, type Price, type Trip } from "./model";
import { isRental } from "./fees";
import { ccOf, findCity, kmBetween, type GeoData } from "./geo/places";
import { tripSpots } from "./geo/spots";
import { hasCoords } from "./geo/maps";
import type { AirportData } from "./geo/locations";
import { arrivals } from "./stays/presence";
import { GROUND_MAX_KM, homeOf, nearestAirport } from "./ground";
import { transferLegs, transferPlan, type TransferPlan } from "./transfer";
import { transferChoices, type TransferChoice, type Group } from "./transit";
import { eventWindow } from "./activities/window";
import { stationName } from "./stays/stationName";

/** Kilometer pro Tag vor Ort mit dem Auto (Ausflüge, Einkauf, Wege zu den Aktivitäten) */
export const LOCAL_KM = 40;
/** Sprit je km beim Mietwagen (ca. 7 l/100 km × 1,85 €/l); eigenes Auto: km-Satz der Reise */
export const FUEL_KM = 0.13;
/** Nahverkehr je Erwachsenem und Tag in Deutschland (Preisniveau 1); Kinder die Hälfte, Kleinkinder frei */
export const TRANSIT_DAY = 5;

export interface TransferLegPlan { plan: TransferPlan; ap: { code: string; lat: number; lon: number }; dest: { name: string; lat: number; lon: number }; choices: TransferChoice[] }

/** Fahrpreise Bahn/Bus: Kinder die Hälfte, Kleinkinder frei */
export function fareGroup(trip: Trip): Group {
  const g = { adults: 0, children: 0 };
  for (const x of trip.travelers.filter(isActive)) { const c = ageClass(x.age, trip.settings, x.kind); if (c === "adult") g.adults++; else if (c === "child") g.children++; }
  if (!g.adults && !g.children) g.adults = 1;
  return g;
}

export const flying = (trip: Trip) => trip.items.some(i => i.cat === "flights" && i.status !== "dropped");

/**
 * Flughafentransfers der Reise: vom Ankunftsflughafen (aus den Flügen, sonst dem nächsten großen am Ziel) zu jeder
 * Unterkunft mit Lage, sonst zum Event bzw. in die Ortsmitte; mit den Möglichkeiten (Bahn, Bus, Taxi), günstigste zuerst.
 */
export function tripTransferLegs(trip: Trip, geo: GeoData, airportData: AirportData, city: string): TransferLegPlan[] {
  const stays = tripSpots(trip, geo).filter(s => s.kind === "stay").map(s => ({ name: s.name, lat: s.lat, lon: s.lon }));
  let dests = stays;
  if (!dests.length) {
    const ev = trip.event;
    if (ev && hasCoords(ev)) dests = [{ name: city || ev.name, lat: ev.lat!, lon: ev.lon! }];
    else {
      const c = city ? findCity(geo, city, ccOf(geo, trip.country)) || findCity(geo, city) : null;
      dests = c ? [{ name: city, lat: c.lat, lon: c.lon }] : [];
    }
  }
  const fly = flying(trip);
  const codes = new Set(arrivals(trip).flatMap(a => [a.arrAp, a.depAp]).filter((c): c is string => !!c));
  const aps = airportData.airports.filter(x => codes.has(x[0])).map(a => ({ code: a[0], lat: a[4], lon: a[5] }));
  const persons = trip.travelers.filter(isActive).length;
  const h = homeOf(trip);
  // nahes Ziel ohne Flug (Bahn, Bus, Auto): kein Flughafentransfer
  const ds = dests.filter(d => fly || !h || kmBetween(h, d) > GROUND_MAX_KM);
  const fb = (d: { lat: number; lon: number }) => nearestAirport(airportData, d);
  const ccOfAp = (code: string) => airportData.airports.find(x => x[0] === code)?.[3];
  const group = fareGroup(trip);
  return transferLegs(ds, aps, fb, persons, 1).map(l => {
    const cc = ccOfAp(l.ap.code) || ccOf(geo, trip.country);
    const pli = geo.world.find(x => x.k === cc)?.pli;
    const plan = transferPlan(l.ap, l.dest, persons, pli);
    return { ...l, plan, choices: transferChoices(plan.ap, plan.km, group, plan.perRide, pli) };
  });
}

const live = (i: Item) => i.status !== "dropped";
/** Transfer-Posten (aus dem Kasten „Flughafentransfer“; ältere ohne Kennung am Namen erkannt) */
export const isTransfer = (i: Item) => i.hint === "transfer" || (i.cat === "transport" && !i.auto && i.name === t("tr.name"));
/** Auto vor Ort: Mietwagen, eigenes Auto (Anreise), Camper */
export function carOnSite(trip: Trip): "rental" | "own" | null {
  if (trip.items.some(i => live(i) && isRental(i)) || trip.camper && !trip.camper.own) return "rental";
  if (trip.items.some(i => live(i) && i.hint === "road:car") || trip.camper?.own) return "own";
  return null;
}

export interface LocalPlan {
  transfer?: { eur: number; legs: { ap: string; to: string; k: TransferChoice["k"]; perRide: number }[] };
  daily?: { mode: "transit"; adult: number; child: number; days: number; adults: number; children: number }
    | { mode: "car"; own: boolean; perKm: number; km: number; days: number };
}

/** Tage vor Ort laut Reisedaten (ohne Daten: keine Schätzung) */
const daysOf = (trip: Trip) => (okDate(trip.from) && okDate(trip.to) ? Math.max(1, dayDiff(trip.from!, trip.to!) + 1) : 0);

export function localPlan(trip: Trip, legs: TransferLegPlan[], pli = 1): LocalPlan {
  const out: LocalPlan = {};
  const car = carOnSite(trip);
  if (flying(trip) && !car && !trip.items.some(i => live(i) && isTransfer(i)) && legs.length) {
    const ls = legs.map(l => { const c = l.choices[0]; return { ap: l.plan.ap, to: l.plan.to, k: c.k, perRide: c.perRide }; });
    out.transfer = { eur: ls.reduce((a, l) => a + l.perRide, 0) * 2, legs: ls };
  }
  const days = daysOf(trip);
  // eigene Posten fürs Unterwegssein (Ticket, Pass, Schätzung der KI) ersetzen die Schätzung
  const own = trip.items.some(i => live(i) && i.cat === "transport" && !i.auto && !isTransfer(i) && !isRental(i) && i.hint !== "road:car" && !i.arrival && !i.hint?.startsWith("camp"));
  if (days && !own) {
    if (car) {
      const perKm = car === "own" ? trip.settings.kmCost ?? 0.3 : FUEL_KM;
      out.daily = { mode: "car", own: car === "own", perKm, km: LOCAL_KM, days };
    } else {
      const g = fareGroup(trip);
      const adult = Math.max(1, Math.round(TRANSIT_DAY * Math.pow(pli || 1, 0.7) * 2) / 2);
      out.daily = { mode: "transit", adult, child: adult / 2, days, adults: g.adults, children: g.children };
    }
  }
  return out;
}

/** Plan wie im Kapitel Vor Ort: Ort wie in App.svelte (eventWindow), Preisniveau des Reiselands */
export function localPlanFor(trip: Trip, geo: GeoData, airportData: AirportData): LocalPlan {
  const city = eventWindow(trip, ap => stationName(geo, airportData, ap)).city;
  const pli = geo.world.find(x => x.k === ccOf(geo, trip.country))?.pli || 1;
  return localPlan(trip, tripTransferLegs(trip, geo, airportData, city), pli);
}

/** Rechenweg in Worten (Posten-Details und Aufschlüsselung am Gesamtbetrag) */
export function localDetail(p: LocalPlan, part: "transfer" | "daily", money: (v: number) => string): string {
  if (part === "transfer" && p.transfer) return p.transfer.legs.map(l => t("local.transferRow", { ap: l.ap, to: l.to, k: t(`tr.k.${l.k}`), v: money(l.perRide) })).join(" · ");
  const d = p.daily;
  if (!d) return "";
  if (d.mode === "car") return t(d.own ? "local.carOwn" : "local.carRental", { km: d.km, v: money(d.perKm), d: tn("n.days", d.days) });
  return t("local.transit", { a: money(d.adult), c: money(d.child), d: tn("n.days", d.days) });
}

/** Posten nachführen; true, wenn sich etwas geändert hat */
export function syncLocal(trip: Trip, p: LocalPlan, money: (v: number) => string): boolean {
  const on = !!trip.local?.on;
  const before = JSON.stringify(trip.items.filter(i => i.auto === "local"));
  const want: { key: "transfer" | "daily"; name: string; price: Price }[] = [];
  if (on && p.transfer) want.push({ key: "transfer", name: t("local.transferItem"), price: { mode: "unit", currency: "EUR", unit: p.transfer.eur / 2, qty: 2 } });
  if (on && p.daily) {
    const d = p.daily;
    want.push(d.mode === "car"
      ? { key: "daily", name: t("local.carItem"), price: { mode: "unit", currency: "EUR", unit: Math.round(d.perKm * d.km * 100) / 100, qty: d.days } }
      : { key: "daily", name: t("local.transitItem"), price: { mode: "person", currency: "EUR", adult: d.adult, child: d.child, infant: 0, qty: d.days } });
  }
  // über die ID: nach push liegt in trip.items ein Proxy, nicht dasselbe Objekt
  const keep = new Set<string>();
  for (const w of want) {
    let it = trip.items.find(i => i.auto === "local" && i.hh === w.key);
    if (!it) { it = { id: uid(), cat: "transport", auto: "local", hh: w.key, name: w.name, status: "idea", options: [{ id: uid(), label: "", price: w.price }] }; trip.items.push(it); }
    if (it.name !== w.name) it.name = w.name;
    const o = it.options[0];
    if (JSON.stringify(o.price) !== JSON.stringify(w.price)) o.price = w.price;
    const detail = localDetail(p, w.key, money);
    if (o.detail !== detail) o.detail = detail;
    keep.add(it.id);
  }
  if (trip.items.some(i => i.auto === "local" && !keep.has(i.id))) trip.items = trip.items.filter(i => i.auto !== "local" || keep.has(i.id));
  return JSON.stringify(trip.items.filter(i => i.auto === "local")) !== before;
}
