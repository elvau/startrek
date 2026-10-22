/* Kreuzfahrten suchen (#519) in der App: Anfrage an den Such-Dienst, Treffer als Kreuzfahrt-Posten übernehmen */
import { i18n, t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { idToken } from "../cloud/cloud.svelte";
import { noteError } from "../bugs/log";
import { agentError } from "../agent/app";
import { cruiseItem } from "../import/apply";
import type { ImportCruise } from "../import/ai";
import { uid, type Item, type Option, type Trip } from "../model";
import { syncCruise } from "../cruise";
import type { CruiseHit, CruiseQuery } from "./search";

export class CruiseError extends Error {}

export async function askCruises(q: Omit<CruiseQuery, "lang">, signal?: AbortSignal): Promise<{ cruises: CruiseHit[]; remaining?: number }> {
  if (!FLIGHTS_URL) throw new CruiseError(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new CruiseError(t("cs.login"));
  const res = await fetch(`${FLIGHTS_URL}/cruises/search`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ ...q, lang: i18n.lang }), signal
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && Array.isArray(data.cruises)) return { cruises: data.cruises as CruiseHit[], ...(typeof data.remaining === "number" ? { remaining: data.remaining } : {}) };
  noteError(`Kreuzfahrten ${res.status}: ${data.error || "ohne Meldung"}`);
  throw new CruiseError(agentError(res.status, data.error, data.overloaded === true));
}

/**
 * Treffer → Kreuzfahrt-Posten: Route laut Fundstelle, Kabinen nach Familien mit dem „ab“-Preis pro Person, Link zur
 * Fundstelle. Preise aus dem Netz sind nicht live geprüft: Posten als „bitte prüfen“.
 */
export function hitItem(trip: Trip, h: CruiseHit, at = new Date().toISOString()): Item {
  const ports = h.ports.length >= 2 ? h.ports : [{ ...(h.ports[0]?.place ? { place: h.ports[0].place } : {}), date: h.from }, { date: h.to || "" }];
  const c: ImportCruise = { ports, ...(h.line ? { line: h.line } : {}), ...(h.ship ? { ship: h.ship } : {}),
    ...(h.price ? { price: h.price.perPerson, per: "person" as const, ...(h.price.cabin ? { cabin: h.price.cabin } : {}) } : {}) };
  const it = cruiseItem(trip, c, { cur: h.price?.currency || "EUR", source: { name: h.source, at: at.slice(0, 10), url: h.url, imported: true }, mark: { at, kind: "suggested" } });
  if (!trip.place) trip.place = ports.find(p => p.place)?.place || trip.place;
  it.check = true;
  return it;
}

/** Weitere Fahrt an eine Kreuzfahrt (#520): das Angebot eines neuen Kreuzfahrt-Postens mit eigener Route und Kabinen */
export function addAsOption(target: Item, src: Item): Option {
  const o: Option = JSON.parse(JSON.stringify(src.options[0]));
  o.id = uid();
  o.cruise = JSON.parse(JSON.stringify({ ...(src.cruise?.line ? { line: src.cruise.line } : {}), ...(src.cruise?.ship ? { ship: src.cruise.ship } : {}), ports: src.cruise?.ports || [] }));
  // aktuelle Route des Postens vorher an sein Angebot binden, sonst gälte sie nach dem Wechsel für alle
  syncCruise(target);
  target.options.push(o);
  if (src.check) target.check = true;
  return o;
}
