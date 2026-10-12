/*
 * Unterkunft privat bzw. schon vorhanden (#233): bei Freunden, Familie, eigene Wohnung. Ein Posten mit Ort, Zeitraum
 * und optionalen Kosten (Standard 0). Der Ort wird Reiseziel, damit Flug-, Bahn- und Event-Suche ihn nutzen.
 */
import { t } from "../i18n/index.svelte";
import { isActive, uid, type Item, type Option, type Trip } from "../model";
import { okDate } from "../calc/travel";

export interface PrivateInput {
  place: string;
  country?: string;
  from: string;
  to: string;
  /** Kosten (leer: kostenlos), für den Aufenthalt oder pro Nacht */
  cost?: number | null;
  basis?: "stay" | "night";
  currency?: string;
  /** wer dort schläft (fehlt: alle, die dabei sind) */
  ids?: string[];
  /** anderes Reiseziel ersetzen (nur bei destMode "ask") */
  dest?: boolean;
}

const norm = (s?: string) => (s || "").split(",")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Reiseziel: leer → übernehmen, gleicher Ort → nichts zu tun, anderes Ziel → nur auf Wunsch (Rundreisen) */
export function destMode(trip: Trip, place: string): "set" | "same" | "ask" {
  if (!norm(trip.place)) return "set";
  return norm(trip.place) === norm(place) ? "same" : "ask";
}

/** Posten anlegen (oder into ändern), Reiseziel und fehlenden Zeitraum der Reise setzen */
export function savePrivate(trip: Trip, p: PrivateInput, into?: Item): Item {
  const place = p.place.trim();
  const act = trip.travelers.filter(isActive).map(x => x.id);
  const part = p.ids?.length && act.some(id => !p.ids!.includes(id)) ? p.ids.filter(id => act.includes(id)) : undefined;
  const cost = p.cost != null && isFinite(p.cost) ? Math.max(0, Math.round(p.cost * 100) / 100) : 0;
  const opt: Option = {
    id: into?.options[0]?.id || uid(), label: t("priv.label"),
    price: { mode: "unit", basis: p.basis || "stay", currency: p.currency || "EUR", unit: cost, capacity: Math.max(1, (part || act).length) },
    loc: { q: [place, p.country].filter(Boolean).join(", ") },
    // Verpflegung bleibt beim Ändern erhalten
    ...(into?.options[0]?.stay ? { stay: into.options[0].stay } : {})
  };
  const item: Item = into || { id: uid(), cat: "stay", name: "", status: "chosen", options: [] };
  item.name = t("priv.itemName", { place });
  item.private = { place, ...(p.country ? { country: p.country } : {}) };
  item.from = p.from; item.to = p.to;
  item.options = [opt]; item.chosen = undefined;
  if (part) item.participants = part; else delete item.participants;
  if (!into) trip.items.push(item);
  const m = destMode(trip, place);
  if (m === "set" || (m === "ask" && p.dest)) {
    trip.place = place;
    if (p.country) trip.country = p.country;
  }
  if (!okDate(trip.from) || !okDate(trip.to) || trip.to <= trip.from) { trip.from = p.from; trip.to = p.to; }
  return item;
}
