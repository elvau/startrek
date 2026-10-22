/*
 * Kreuzfahrt gegen Rundreise an Land (#520): Aus der Route einer Kreuzfahrt wird in einer Variante der Reise eine
 * Rundreise mit bis zu 3 Städten (Ein- und Ausschiffungshafen, dazu die wichtigsten Häfen dazwischen). Je Stadt eine
 * Unterkunft als Richtwert nach Preisniveau des Landes (mit vorbelegter Suche), zwischen den Städten Bahn, Bus oder bei
 * Inseln Fähre bzw. Flug als Richtwert. Flüge zum Hafen bleiben, die Rundreise endet wieder am Ausschiffungshafen.
 * Gekennzeichnet über hint: Unterkünfte „land:stay“, Fahrten „land:leg:<Stunden>“ (für „Unterwegs“ im Vergleich).
 */
import { t } from "../i18n/index.svelte";
import { isActive, uid, type Item, type Port, type Trip } from "../model";
import { addDays, okDate } from "../calc/travel";
import { findCity, type GeoData } from "../geo/places";
import { groundPlan, type Spot } from "../ground";
import { suggestCabins } from "../cruise";
import { guests } from "../stays/app";
import { FEES_AS_OF } from "../fees";

/** Hotel der Mittelklasse je Zimmer und Nacht in Deutschland (Richtwert 2026), mal Preisniveau des Landes^0,8 */
export const HOTEL_DE = 110;
/** Fähre oder Flug zwischen Häfen ohne Landweg: Richtwert pro Person und Strecke, Dauer in Stunden */
export const SEA_LEG = { pp: 90, hours: 6 };
/** höchstens so viele Städte an Land */
export const LAND_CITIES = 3;

export interface LandCity { name: string; spot: Spot | null; from: string; to: string }

const nightsBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const liegezeit = (p: Port) => (p.arr && p.dep ? Number(p.dep.slice(0, 2)) * 60 + Number(p.dep.slice(3)) - Number(p.arr.slice(0, 2)) * 60 - Number(p.arr.slice(3)) : 0);

/**
 * Städte der Rundreise: erster und letzter Hafen, dazu Häfen dazwischen (bekannte Städte zuerst, dann längste Liegezeit),
 * in der Reihenfolge der Route; Nächte gleichmäßig verteilt (die ersten Städte bekommen den Rest).
 */
export function landCities(ports: Port[], g: GeoData): LandCity[] {
  const ps = ports.filter(p => !p.sea && p.place?.trim());
  const dated = ports.filter(p => okDate(p.date)).map(p => p.date).sort();
  if (ps.length < 1 || dated.length < 2) return [];
  const start = dated[0], end = dated[dated.length - 1];
  const first = ps[0].place!.trim(), last = ps[ps.length - 1].place!.trim();
  const round = first === last;
  const spotOf = (name: string): Spot | null => { const c = findCity(g, name); return c ? { name, lat: c.lat, lon: c.lon, cc: c.cc } : null; };
  const seen = new Set([first, last]);
  const mids = ps.slice(1, -1).map((p, i) => ({ p, i, name: p.place!.trim() })).filter(x => !seen.has(x.name) && (seen.add(x.name), true));
  const room = LAND_CITIES - (round ? 1 : 2);
  const top = (n: string) => (findCity(g, n)?.top ? 1 : 0);
  const picked = [...mids].sort((a, b) => top(b.name) - top(a.name) || liegezeit(b.p) - liegezeit(a.p) || a.i - b.i).slice(0, Math.max(0, room)).sort((a, b) => a.i - b.i);
  const names = [first, ...picked.map(x => x.name), ...(round ? [] : [last])];
  const total = nightsBetween(start, end), k = names.length;
  const base = Math.floor(total / k), rest = total - base * k;
  let d = start;
  return names.map((name, i) => {
    const n = base + (i < rest ? 1 : 0), from = d;
    d = addDays(d, n);
    return { name, spot: spotOf(name), from, to: d };
  });
}

/** Unterkunft je Stadt: Zimmer wie Kabinen nach Familien (höchstens 4 je Zimmer), Richtwert je Nacht, Suche vorbelegt */
function stayItem(trip: Trip, c: LandCity, g: GeoData): Item {
  const people = trip.travelers.filter(isActive);
  const rooms = Math.max(1, suggestCabins(people).length);
  const pli = c.spot?.cc ? g.world.find(x => x.k === c.spot!.cc)?.pli || 1 : 1;
  const rate = Math.round(HOTEL_DE * Math.pow(pli, 0.8));
  return {
    id: uid(), cat: "stay", hint: "land:stay", status: "idea", name: t("st.itemName", { place: c.name }), from: c.from, to: c.to,
    options: [{ id: uid(), label: t("cl.hotelEst"), estimate: true, detail: t("cl.hotelNote", { n: rooms, v: rate }),
      price: { mode: "unit", currency: "EUR", unit: rooms * rate, basis: "night" },
      query: { place: c.name, checkin: c.from, checkout: c.to, ...guests(people), rooms },
      source: { name: t("cl.src", { d: FEES_AS_OF }) } }]
  };
}

/** Fahrt zwischen zwei Städten: Bahn (sonst Bus) pro Person; ohne Landweg (Insel, Meer) Fähre oder Flug als Richtwert */
function legItem(a: LandCity, b: LandCity, day: string, persons: number): Item {
  const plan = a.spot && b.spot ? groundPlan(a.spot, b.spot, persons, 1, { road: true }) : null;
  const m = plan?.modes.find(x => x.k === "train" && x.lo != null) || plan?.modes.find(x => x.k === "bus" && x.lo != null);
  const pp = m ? Math.round(((m.lo! + m.hi!) / 2) / 2) : SEA_LEG.pp;
  const hours = m ? Math.round(m.hours * 10) / 10 : SEA_LEG.hours;
  return {
    id: uid(), cat: "transport", hint: `land:leg:${hours}`, status: "idea", day, name: t("cl.leg", { a: a.name, b: b.name }),
    options: [{ id: uid(), label: m ? t(`gr.${m.k}` as "gr.train") : t("cl.sea"), estimate: true, detail: t("cl.legNote", { h: hours }),
      price: { mode: "person", currency: "EUR", adult: pp } }]
  };
}

/**
 * Kreuzfahrt in der Variante durch die Rundreise ersetzen. Gibt die Städte zurück; leer, wenn die Route nicht reicht
 * (dann bleibt die Reise unverändert).
 */
export function cruiseToLand(trip: Trip, itemId: string, g: GeoData): LandCity[] {
  const it = trip.items.find(i => i.id === itemId);
  if (!it?.cruise) return [];
  const cities = landCities(it.cruise.ports, g);
  if (!cities.length) return [];
  const persons = Math.max(1, trip.travelers.filter(isActive).length);
  const items: Item[] = cities.map(c => stayItem(trip, c, g));
  for (let i = 1; i < cities.length; i++) items.push(legItem(cities[i - 1], cities[i], cities[i].from, persons));
  // zurück zum Ausschiffungshafen (Rundkurs): am letzten Tag zur ersten Stadt
  const ports = it.cruise.ports.filter(p => !p.sea && p.place?.trim());
  const endName = ports[ports.length - 1]?.place?.trim();
  const lastCity = cities[cities.length - 1];
  if (cities.length > 1 && endName === cities[0].name) items.push(legItem(lastCity, { ...cities[0], from: lastCity.to }, lastCity.to, persons));
  trip.items = [...trip.items.filter(i => i.id !== itemId), ...items];
  trip.detail = { ...(trip.detail || {}), stay: true, transport: true };
  return cities;
}

/** Eckdaten für den Vergleich (#520): Ziele (Häfen bzw. Städte) und Stunden unterwegs an Land; null ohne Kreuzfahrt und Rundreise */
export function tripFacts(trip: Trip): { places: number; hours: number; cruise: boolean } | null {
  const live = trip.items.filter(i => i.status !== "dropped");
  const cr = live.filter(i => i.cruise);
  const land = live.filter(i => i.hint?.startsWith("land:"));
  if (!cr.length && !land.length) return null;
  const names = new Set<string>();
  for (const i of cr) for (const p of i.cruise!.ports) if (!p.sea && p.place?.trim()) names.add(p.place.trim());
  for (const i of land) if (i.hint === "land:stay") names.add(i.options[0]?.query?.place || i.name);
  const hours = land.reduce((s, i) => s + (Number(i.hint!.split(":")[2]) || 0), 0);
  return { places: names.size, hours: Math.round(hours * 10) / 10, cruise: cr.length > 0 };
}
