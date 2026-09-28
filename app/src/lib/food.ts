/*
 * Verpflegung wie im Artefakt: Tagessatz pro Erwachsenem aus dem Essensstil, aus den Länderdaten
 * (Pakete mit echten Richtwerten, sonst Schätzung nach Preisniveau), je Familie für die Tage vor Ort.
 * Die Posten „Verpflegung …“ im Kapitel Sonstiges werden daraus automatisch gesetzt.
 */
import { hhKey, isActive, uid, type FoodCfg, type FoodStyle, type Item, type Trip } from "./model";
import { presences } from "./calc";
import { nightsList, okDate } from "./calc/travel";
import { ccOf, findCity, type GeoData } from "./geo/places";

export const FOOD_STYLES: { k: FoodStyle; l: string; d: string }[] = [
  { k: "self", l: "Überwiegend selbst", d: "Supermarkt, in der Unterkunft kochen" },
  { k: "mix", l: "Gemischt", d: "Frühstück selbst, mittags günstig essen, abends selbst" },
  { k: "out", l: "Überwiegend auswärts", d: "Restaurants, Imbiss, Cafés" },
  { k: "treat", l: "Genießer", d: "öfter gehoben essen gehen" }
];
/** Deutschland als Maßstab (Preisniveau 1), € pro Erwachsenem und Tag */
export const FOOD_DE: Record<FoodStyle, number> = { self: 20, mix: 35, out: 55, treat: 85 };

export const foodCfg = (trip: Trip): Required<Pick<FoodCfg, "style" | "child" | "infant">> & FoodCfg =>
  ({ style: "mix", child: 50, infant: 25, ...(trip.food || {}) });

/** Tagessatz in € pro Erwachsenem: Länderpaket (mit Ortsfaktor), sonst Deutschland × Preisniveau^0,7 */
export function foodRate(g: GeoData, trip: Trip, k: FoodStyle): { eur: number; note: string; est: boolean } {
  const cc = ccOf(g, trip.country);
  const pack = cc ? g.packs[cc] : undefined;
  const w = cc ? g.world.find(x => x.k === cc) : undefined;
  const style = FOOD_STYLES.find(s => s.k === k)!;
  if (pack?.food?.[k]) {
    const city = trip.place ? findCity(g, trip.place, cc) : null;
    const fac = city ? pack.cities.find(c => c.n === city.name)?.food || 1 : 1;
    const toEur = !pack.cur || pack.cur === "EUR" ? 1 : 1 / (w?.rate || 1);
    return { eur: Math.round(pack.food[k] * fac * toEur), note: pack.foodNote?.[k] || style.d, est: false };
  }
  return { eur: Math.round(FOOD_DE[k] * Math.pow(w?.pli || 1, 0.7)), note: style.d, est: true };
}

export interface FoodRow { hh: string; ids: string[]; days: number; style: FoodStyle; own: boolean; eur: number; note: string; est: boolean }

/** je Familie: Tage vor Ort (Anreise bis Abreise, beide Tage zählen), sonst Reisetage */
export function foodPlan(trip: Trip, g: GeoData): FoodRow[] {
  const cfg = foodCfg(trip);
  const pres = presences(trip);
  const act = trip.travelers.filter(isActive);
  const tripDays = okDate(trip.from) && okDate(trip.to) ? nightsList(trip.from, trip.to).length + 1 : 0;
  return [...new Set(act.map(hhKey))].map(hh => {
    const ids = act.filter(t => hhKey(t) === hh).map(t => t.id);
    const ds = ids.map(id => pres[id]).filter(p => !!p).map(p => nightsList(p!.a, p!.d).length + 1);
    const days = ds.length ? Math.max(...ds) : tripDays;
    const own = !!cfg.hh?.[hh];
    const style = cfg.hh?.[hh] || cfg.style;
    return { hh, ids, days, style, own, ...foodRate(g, trip, style) };
  }).filter(r => r.days > 0);
}

/** Posten „Verpflegung …“ angleichen; schreibt nur bei echten Änderungen (sonst Endlosschleife im Effekt) */
export function syncFood(trip: Trip, g: GeoData): boolean {
  const cfg = foodCfg(trip);
  const before = JSON.stringify(trip.items.filter(i => i.auto === "food"));
  if (!cfg.on) {
    if (trip.items.some(i => i.auto === "food")) { trip.items = trip.items.filter(i => i.auto !== "food"); return true; }
    return false;
  }
  const rows = foodPlan(trip, g);
  const keep = new Set<string>();
  for (const r of rows) {
    let it = trip.items.find(i => i.auto === "food" && i.hh === r.hh);
    const style = FOOD_STYLES.find(s => s.k === r.style)!;
    const want = {
      name: `Verpflegung ${r.hh}`, participants: r.ids,
      label: style.l, detail: `${r.note}. Richtwert${r.est ? " (geschätzt)" : ""} pro Tag, Kinder ${cfg.child} %, Kleinkinder ${cfg.infant} %`,
      price: { mode: "person" as const, currency: "EUR", adult: r.eur, child: Math.round(r.eur * cfg.child / 100), infant: Math.round(r.eur * cfg.infant / 100), qty: r.days }
    };
    if (!it) {
      it = { id: uid(), cat: "misc", auto: "food", hh: r.hh, name: want.name, status: "idea", options: [{ id: uid(), label: "", price: { mode: "person", currency: "EUR" } }] } as Item;
      trip.items.push(it);
    }
    keep.add(it.id);
    const o = it.options[0];
    if (it.name !== want.name) it.name = want.name;
    if (JSON.stringify(it.participants) !== JSON.stringify(want.participants)) it.participants = want.participants;
    if (o.label !== want.label) o.label = want.label;
    if (o.detail !== want.detail) o.detail = want.detail;
    if (JSON.stringify(o.price) !== JSON.stringify(want.price)) o.price = want.price;
  }
  if (trip.items.some(i => i.auto === "food" && !keep.has(i.id))) trip.items = trip.items.filter(i => i.auto !== "food" || keep.has(i.id));
  return JSON.stringify(trip.items.filter(i => i.auto === "food")) !== before;
}
