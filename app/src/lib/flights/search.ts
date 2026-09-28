/* Alle Quellen gleichzeitig fragen, zusammenführen, Doppelte entfernen, nach Preis sortieren */
import { addDays, searchKiwi } from "./kiwi";
import { searchTravelpayouts } from "./travelpayouts";
import type { FlightOffer, FlightQuery, SearchResult, SourceStatus } from "./types";

/** Schlüssel des Such-Dienstes (Cloudflare-Secrets); fehlt einer, bleibt die Quelle aus */
export interface FlightEnv { DUFFEL_TOKEN?: string; TRAVELPAYOUTS_TOKEN?: string; TRAVELPAYOUTS_MARKER?: string; KIWI_MCP_URL?: string }

interface Provider {
  id: string;
  name: string;
  configured: (env: FlightEnv) => boolean;
  search: (q: FlightQuery, env: FlightEnv, f: typeof fetch) => Promise<FlightOffer[]>;
}

const notYet = (name: string) => async (): Promise<FlightOffer[]> => { throw new Error(`${name} ist eingerichtet, aber noch nicht angebunden`); };

export const PROVIDERS: Provider[] = [
  { id: "kiwi", name: "Kiwi.com", configured: () => true, search: (q, env, f) => searchKiwi(q, f, env.KIWI_MCP_URL || undefined) },
  // folgt, sobald ein Schlüssel da ist
  { id: "duffel", name: "Duffel", configured: env => !!env.DUFFEL_TOKEN, search: notYet("Duffel") },
  { id: "travelpayouts", name: "Travelpayouts", configured: env => !!env.TRAVELPAYOUTS_TOKEN, search: (q, env, f) => searchTravelpayouts(q, env.TRAVELPAYOUTS_TOKEN!, f, env.TRAVELPAYOUTS_MARKER || undefined) }
];

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`keine Antwort nach ${ms / 1000} s`)), ms))]);

/** gleicher Flug (gleiche Flugnummern und Zeiten) aus mehreren Quellen: nur der günstigste bleibt */
const sameFlight = (o: FlightOffer) =>
  [o.out.flights.join("+"), o.out.dep, o.back?.flights.join("+") || "", o.back?.dep || ""].join("|");

export function merge(lists: FlightOffer[][]): FlightOffer[] {
  const best = new Map<string, FlightOffer>();
  for (const o of lists.flat()) {
    const k = sameFlight(o);
    const cur = best.get(k);
    if (!cur || o.price < cur.price) best.set(k, o);
  }
  return [...best.values()].sort((a, b) => a.price - b.price || a.out.minutes - b.out.minutes);
}

/** flexibel: nur Treffer, die frühestens am Abreisetag starten und spätestens am letzten Tag wieder zu Hause sind */
export function inWindow(q: FlightQuery, offers: FlightOffer[]): FlightOffer[] {
  if (!q.latest) return offers;
  return offers.filter(o => o.out.dep.slice(0, 10) >= q.depart && (o.back ?? o.out).arr.slice(0, 10) <= q.latest!);
}

/** nur Treffer an den gewählten Flughäfen (eine Stadt: alle ihre Flughäfen; ein Kürzel: nur dieser) */
export function atAirports(q: FlightQuery, offers: FlightOffer[]): FlightOffer[] {
  const ok = (list: string[] | undefined, code: string) => !list?.length || list.includes(code);
  return offers.filter(o => ok(q.fromAirports, o.out.from) && ok(q.toAirports, o.out.to));
}

export async function searchAll(q: FlightQuery, env: FlightEnv = {}, f: typeof fetch = fetch, timeoutMs = 25000): Promise<SearchResult> {
  const active = PROVIDERS.filter(p => p.configured(env));
  const sources: SourceStatus[] = PROVIDERS.filter(p => !p.configured(env)).map(p => ({ id: p.id, name: p.name, configured: false, ok: false, count: 0 }));
  const lists = await Promise.all(active.map(async p => {
    const t0 = Date.now();
    try {
      const offers = await withTimeout(p.search(q, env, f), timeoutMs);
      sources.push({ id: p.id, name: p.name, configured: true, ok: true, count: offers.length, ms: Date.now() - t0 });
      return offers;
    } catch (e) {
      sources.push({ id: p.id, name: p.name, configured: true, ok: false, count: 0, ms: Date.now() - t0, error: (e as Error).message });
      return [];
    }
  }));
  sources.sort((a, b) => PROVIDERS.findIndex(p => p.id === a.id) - PROVIDERS.findIndex(p => p.id === b.id));
  return { offers: atAirports(q, inWindow(q, merge(lists))), sources };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** Anfrage prüfen (im Such-Dienst, bevor irgendwer gefragt wird) */
export function parseQuery(b: unknown): FlightQuery | string {
  const o = (b || {}) as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string).trim() : "");
  const from = str("from"), to = str("to"), depart = str("depart"), ret = str("ret");
  if (!from || !to || from.length > 60 || to.length > 60) return "Start und Ziel angeben";
  if (!DATE.test(depart) || (ret && !DATE.test(ret))) return "Datum im Format JJJJ-MM-TT";
  if (ret && ret < depart) return "Rückflug liegt vor dem Hinflug";
  const latest = str("latest");
  let flex: Pick<FlightQuery, "latest" | "nightsMin" | "nightsMax"> = {};
  if (latest) {
    const nightsMin = o.nightsMin ?? 1, nightsMax = o.nightsMax ?? nightsMin;
    if (!DATE.test(latest)) return "Datum im Format JJJJ-MM-TT";
    if (!int(nightsMin, 1, 60) || !int(nightsMax, 1, 60) || (nightsMax as number) < (nightsMin as number)) return "Nächte: 1 bis 60, von ≤ bis";
    if (addDays(depart, nightsMin as number) > latest) return "Zwischen frühester Abreise und spätester Rückkehr passen nicht so viele Nächte";
    flex = { latest, nightsMin: nightsMin as number, nightsMax: nightsMax as number };
  }
  const adults = o.adults ?? 1, children = o.children ?? 0, infants = o.infants ?? 0;
  if (!int(adults, 1, 9) || !int(children, 0, 8) || !int(infants, 0, 4)) return "Personen: 1–9 Erwachsene, bis 8 Kinder, bis 4 Babys";
  if ((infants as number) > (adults as number)) return "Höchstens ein Baby pro Erwachsenem";
  const opt: Pick<FlightQuery, "flexDays" | "maxStops" | "bags" | "selfTransfer"> = {};
  if (o.flexDays != null) { if (!int(o.flexDays, 0, 3)) return "± Tage: 0 bis 3"; if (!latest) opt.flexDays = o.flexDays as number; }
  if (o.maxStops != null) { if (!int(o.maxStops, 0, 2)) return "Umstiege: 0 bis 2"; opt.maxStops = o.maxStops as number; }
  if (o.bags != null) { if (typeof o.bags !== "boolean") return "Koffer: ja oder nein"; opt.bags = o.bags; }
  if (o.selfTransfer != null) { if (typeof o.selfTransfer !== "boolean") return "Self-Transfer: ja oder nein"; opt.selfTransfer = o.selfTransfer; }
  const places: Pick<FlightQuery, "fromAirports" | "toAirports" | "fromCityCode" | "toCityCode"> = {};
  for (const k of ["fromAirports", "toAirports"] as const) {
    if (o[k] == null) continue;
    const v = o[k];
    if (!Array.isArray(v) || v.length > 8 || !v.every(x => typeof x === "string" && /^[A-Z]{3}$/.test(x))) return "Flughäfen: bis zu 8 Codes";
    if (v.length) places[k] = v as string[];
  }
  for (const k of ["fromCityCode", "toCityCode"] as const) {
    const v = str(k);
    if (v && !/^[A-Z]{3}$/.test(v)) return "Stadt-Code ungültig";
    if (v) places[k] = v;
  }
  const currency = str("currency") || "EUR";
  if (!/^[A-Z]{3}$/.test(currency)) return "Währung ungültig";
  return { from, to, depart, ret: flex.latest ? undefined : ret || undefined, ...places, ...flex, ...opt, adults: adults as number, children: children as number, infants: infants as number, currency };
}
