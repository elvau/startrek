/*
 * Import (#459): „Was fehlt noch?“. Bausteine, die das Angebot nicht abdeckt, werden angeboten statt geschätzt:
 * je Baustein Suchen (bestehende Suche, vorbelegt mit Ziel, Daten, Personen), Schätzen oder Brauchen wir nicht.
 * Was hier dazukommt, gehört zur „ganzen Reise“, nie zum „Angebot realistisch“ (Trip.offer.items nennt die Posten
 * des Angebots).
 */
import { t } from "../i18n/index.svelte";
import { uid, type Item, type Trip } from "../model";
import { carItem } from "../extras";
import { tripDays } from "../ground";
import type { ImportedOffer } from "./ai";

export type PartId = "flight" | "stay" | "access" | "transfer" | "rental" | "fun";
export type Choice = "search" | "estimate" | "none" | "later";
/** im Angebot, rechnet die App selbst, fehlt (mit Auswahl) */
export interface Part { id: PartId; state: "offer" | "package" | "app" | "missing"; choices: Choice[]; def?: Choice }

/** Bausteine in der Reihenfolge der Anzeige */
export function partsOf(o: ImportedOffer): Part[] {
  const fl = !!o.flights, st = !!o.stay;
  const pkg = fl && st && !o.flights!.price && !o.stay!.price;
  const out: Part[] = [];
  out.push(fl ? { id: "flight", state: pkg ? "package" : "offer", choices: [] } : { id: "flight", state: "missing", choices: ["search", "later", "none"], def: "later" });
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
export const defaultChoices = (o: ImportedOffer): Partial<Record<PartId, Choice>> =>
  Object.fromEntries(partsOf(o).filter(p => p.def).map(p => [p.id, p.def!]));

export type SearchTarget = "flight" | "stay" | "fun";

/**
 * Auswahl in die angelegte Reise übernehmen: Schätzungen als Posten, „kein Transfer“ ersetzt die Schätzung der App.
 * Gibt die Suchen zurück, die geöffnet werden sollen (in dieser Reihenfolge; die App öffnet die erste).
 */
export function applyParts(trip: Trip, choices: Partial<Record<PartId, Choice>>): SearchTarget[] {
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
