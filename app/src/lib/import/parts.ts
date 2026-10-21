/*
 * Import (#459): „Was fehlt noch?“. Bausteine, die das Angebot nicht abdeckt, werden angeboten statt geschätzt:
 * je Baustein Suchen (bestehende Suche, vorbelegt mit Ziel, Daten, Personen), Schätzen oder Brauchen wir nicht.
 * Was hier dazukommt, gehört zur „ganzen Reise“, nie zum „Angebot realistisch“ (Trip.offer.items nennt die Posten
 * des Angebots).
 * Anreise ohne Flug (#475): „Flug brauchen wir nicht“ fragt nach Auto, Bahn oder Fernbus; der Posten kommt aus der
 * Bodenberechnung (ground.ts) bzw. wie der Auto-Posten der Reise (Sprit, Vignetten, Maut), als Schätzung.
 */
import { t } from "../i18n/index.svelte";
import { isActive, uid, type Item, type Trip } from "../model";
import { carItem } from "../extras";
import { groundPlan, tripDays, type Spot } from "../ground";
import { FEES_AS_OF, roadExtras, routeCountries } from "../fees";
import { moneyExact, rateOf } from "../calc";
import type { ImportedOffer } from "./ai";

export type PartId = "flight" | "arrival" | "stay" | "access" | "transfer" | "rental" | "fun";
export type ArrivalKind = "car" | "train" | "bus";
export const ARRIVAL: ArrivalKind[] = ["car", "train", "bus"];
export type Choice = "search" | "estimate" | "none" | "later" | ArrivalKind;
export type Choices = Partial<Record<PartId, Choice>>;
/** im Angebot, rechnet die App selbst, fehlt (mit Auswahl) */
export interface Part { id: PartId; state: "offer" | "package" | "app" | "missing"; choices: Choice[]; def?: Choice }

/** Bausteine in der Reihenfolge der Anzeige; ohne Flug (choices.flight „none“) die Frage nach der Anreise */
export function partsOf(o: ImportedOffer, choices: Choices = {}): Part[] {
  const fl = !!o.flights, st = !!o.stay;
  const pkg = fl && st && !o.flights!.price && !o.stay!.price;
  const out: Part[] = [];
  out.push(fl ? { id: "flight", state: pkg ? "package" : "offer", choices: [] } : { id: "flight", state: "missing", choices: ["search", "later", "none"], def: "later" });
  if (!fl && choices.flight === "none") out.push({ id: "arrival", state: "missing", choices: [...ARRIVAL, "none"], def: "car" });
  out.push(st ? { id: "stay", state: pkg ? "package" : "offer", choices: [] } : { id: "stay", state: "missing", choices: ["search", "later", "none"], def: o.kind === "flight" ? "later" : "none" });
  if (fl) out.push({ id: "access", state: "app", choices: [] });
  if (fl) {
    const tr = o.transfer?.included || o.transfer?.price;
    out.push(tr ? { id: "transfer", state: pkg ? "package" : "offer", choices: [] } : { id: "transfer", state: "missing", choices: ["estimate", "none"], def: "estimate" });
  }
  out.push(o.rental ? { id: "rental", state: "offer", choices: [] } : { id: "rental", state: "missing", choices: ["estimate", "none"], def: "none" });
  out.push({ id: "fun", state: "missing", choices: ["search", "later", "none"], def: "later" });
  return out;
}

/** etwas zu entscheiden? (sonst entfällt der Schritt) */
export const hasMissing = (o: ImportedOffer) => partsOf(o).some(p => p.state === "missing");

/** Vorauswahl je fehlendem Baustein */
export const defaultChoices = (o: ImportedOffer): Choices =>
  Object.fromEntries(partsOf(o).filter(p => p.def).map(p => [p.id, p.def!]));

/** Auswahl ändern: „Flug brauchen wir nicht“ fragt nach der Anreise (vorgewählt Auto), mit Flug entfällt sie */
export function pick(c: Choices, id: PartId, v: Choice): Choices {
  const out: Choices = { ...c, [id]: v };
  if (id === "flight") { if (v === "none") out.arrival ??= "car"; else delete out.arrival; }
  return out;
}

/** gewählte Anreise ohne Flug, sonst nichts */
export const arrivalOf = (c: Choices): ArrivalKind | null =>
  c.flight === "none" && ARRIVAL.includes(c.arrival as ArrivalKind) ? (c.arrival as ArrivalKind) : null;

export type SearchTarget = "flight" | "stay" | "fun";

/**
 * Auswahl in die angelegte Reise übernehmen: Schätzungen als Posten, „kein Transfer“ ersetzt die Schätzung der App.
 * Gibt die Suchen zurück, die geöffnet werden sollen (in dieser Reihenfolge; die App öffnet die erste).
 */
export function applyParts(trip: Trip, choices: Choices): SearchTarget[] {
  trip.detail ||= {};
  const add = (it: Item) => { trip.items.push(it); trip.detail![it.cat] = true; };
  if (choices.rental === "estimate") {
    const days = tripDays(trip);
    add(carItem({ pick: trip.from ? `${trip.from}T10:00` : "", drop: trip.to ? `${trip.to}T10:00` : "", days }));
  }
  if (choices.transfer === "none") {
    add({ id: uid(), cat: "transport", name: t("imp.noTransfer"), hint: "transfer", status: "idea", options: [{ id: uid(), label: t("imp.noTransfer"), price: { mode: "unit", currency: "EUR", unit: 0 } }] });
  }
  const open = (["flight", "stay", "fun"] as const).filter(k => choices[k] === "search");
  // Kapitel der Suchen detailliert, sonst ist dort keine Suche zu sehen
  for (const k of open) trip.detail[k === "flight" ? "flights" : k === "stay" ? "stay" : "attractions"] = true;
  return open;
}

/** Personen je Auto (wie im Bodenvergleich) */
const SEATS = 5;

/**
 * Anreise ohne Flug als Posten (hin und zurück, Schätzung). Auto: je angefangene 5 Personen ein Auto-Posten wie in der
 * Reise (Sprit und Verschleiß, Vignetten und Maut als Nebenkosten); Bahn und Fernbus: Richtwert pro Person (Mitte der
 * Spanne). Ohne Bodenverbindung (Insel) leer.
 */
export function arrivalItems(trip: Trip, kind: ArrivalKind, home: Spot, dest: Spot): Item[] {
  const act = trip.travelers.filter(isActive);
  const kmCost = trip.settings.kmCost ?? 0.3;
  const plan = groundPlan(home, dest, act.length, tripDays(trip), { kmCost, road: true });
  if (!plan) return [];
  const road = Math.round(plan.road);
  if (kind === "car") {
    const extras = roadExtras(routeCountries(home.cc || "DE", dest.cc || home.cc || "DE"), road, c => rateOf(c, trip.settings));
    const cars = Math.max(1, Math.ceil(act.length / SEATS));
    return Array.from({ length: cars }, (_, i): Item => ({
      id: uid(), cat: "transport", icon: "car", status: "idea", hint: "road:car", arrival: true,
      name: i ? t("road.carN", { n: i + 1 }) : t("road.car"),
      note: t("road.carNote", { a: home.name, b: dest.name, km: road, c: moneyExact(kmCost, "EUR"), d: FEES_AS_OF }),
      ...(cars > 1 ? { participants: act.slice(i * SEATS, (i + 1) * SEATS).map(p => p.id) } : {}),
      options: [{ id: uid(), label: t("road.fuel"), estimate: true, price: { mode: "unit", currency: "EUR", unit: Math.round(2 * road * kmCost) },
        extras: extras.map(x => ({ ...x, id: `${x.id}:${uid()}` })) }]
    }));
  }
  const m = plan.modes.find(x => x.k === kind);
  if (m?.lo == null || m.hi == null) return [];
  return [{
    id: uid(), cat: "transport", status: "idea", arrival: true, name: t(`imp.arr.${kind}`),
    note: t("imp.arr.note", { a: home.name, b: dest.name, km: road }),
    options: [{ id: uid(), label: t(`gr.${kind}`), estimate: true, price: { mode: "person", currency: "EUR", adult: Math.round((m.lo + m.hi) / 2) } }]
  }];
}

/** Anreise in die angelegte Reise übernehmen; ohne Wohnort oder Ziel bleibt es bei der Frage in der Reise */
export function applyArrival(trip: Trip, choices: Choices, home: Spot | null, dest: Spot | null): Item[] {
  const kind = arrivalOf(choices);
  if (!kind || !home || !dest) return [];
  const items = arrivalItems(trip, kind, home, dest);
  if (items.length) { trip.detail ||= {}; trip.detail.transport = true; trip.items.push(...items); }
  return items;
}
