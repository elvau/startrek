/*
 * Travelpayouts (Aviasales Data API v3, prices_for_dates): offizielles Partnerprogramm, kostenlos mit Token.
 * Preise stammen aus dem Zwischenspeicher von Aviasales (Suchen der letzten Tage) und gelten pro Person.
 * Ankunftszeiten liefert die Schnittstelle nicht, sie werden aus Abflug + Flugdauer berechnet.
 */
import type { FlightOffer, FlightQuery, OfferLeg } from "./types";

export const TP_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

const iata = (s: string) => /^[A-Za-z]{3}$/.test(s.trim()) ? s.trim().toUpperCase() : null;

const month = (iso: string) => iso.slice(0, 7);
const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };

/**
 * Welche Monate abgefragt werden. Feste Daten: genau die Tage.
 * Flexibel: jeder mögliche Hinflug-Monat, jeweils mit Rückflug im selben und im nächsten Monat
 * (sonst kämen nur „Anfang hin, Ende zurück“ und damit zu viele Nächte heraus). Höchstens 6 Anfragen.
 */
export function tpPairs(q: FlightQuery): [string, string | undefined][] {
  // nur Hinflug im Zeitfenster: jeder Monat des Fensters (höchstens 6)
  if (!q.latest && q.departTo && !q.ret) {
    const out: [string, undefined][] = [];
    for (let m = month(q.depart); m <= month(q.departTo) && out.length < 6; m = nextMonth(m)) out.push([m, undefined]);
    return out;
  }
  if (!q.latest) return [[q.depart, q.ret]];
  const lastDep = month(new Date(Date.parse(q.latest) - (q.nightsMin || 1) * 86400000).toISOString());
  const lastRet = month(q.latest);
  const out: [string, string][] = [];
  for (let m = month(q.depart); m <= lastDep && out.length < 6; m = nextMonth(m)) {
    for (const r of [m, nextMonth(m)]) if (r <= lastRet && out.length < 6) out.push([m, r]);
  }
  return out.length ? out : [[month(q.depart), lastRet]];
}

/** eine Anfrage für ein Paar aus Hinflug- und Rückflug-Datum bzw. -Monat */
export function tpParams(q: FlightQuery, marker?: string, pair: [string, string | undefined] = tpPairs(q)[0]): URLSearchParams {
  const from = iata(q.from), to = iata(q.to);
  if (!from || !to) throw new Error("Travelpayouts braucht Flughafencodes (z. B. DUS → SPU)");
  const p = new URLSearchParams({
    origin: from, destination: to,
    departure_at: pair[0],
    sorting: "price", unique: "false", currency: (q.currency || "EUR").toLowerCase(), limit: "30", page: "1"
  });
  if (pair[1]) p.set("return_at", pair[1]);
  else p.set("one_way", "true");
  if (q.maxStops === 0) p.set("direct", "true");
  if (marker) p.set("marker", marker);
  return p;
}

/** lokale Zeit ohne Zeitzone, plus Minuten (wie die übrigen Angaben in der App) */
function plus(iso: string, minutes: number): string {
  const d = new Date(iso.slice(0, 19) + "Z");
  d.setUTCMinutes(d.getUTCMinutes() + (minutes || 0));
  return d.toISOString().slice(0, 19);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function leg(from: string, to: string, dep: string, minutes: number, stops: number, airline: string, no?: string): OfferLeg {
  const d = dep.slice(0, 19);
  return { from, to, dep: d, arr: plus(d, minutes), minutes: minutes || 0, stops: stops || 0, route: [from, to], carriers: airline ? [airline] : [], flights: no ? [`${airline}${no}`] : [] };
}

/** Antwort in unser Format; Preis pro Person mal Reisende (Babys zählen nicht, Preis ist eine Schätzung) */
export function fromTravelpayouts(data: any, q: FlightQuery, marker?: string): FlightOffer[] {
  const pax = Math.max(1, q.adults + q.children);
  return (data?.data || []).filter((x: any) => typeof x.price === "number" && x.departure_at).map((x: any): FlightOffer => {
    const from = x.origin_airport || x.origin, to = x.destination_airport || x.destination;
    const out = leg(from, to, x.departure_at, x.duration_to ?? x.duration, x.transfers, x.airline, x.flight_number);
    const back = x.return_at ? leg(to, from, x.return_at, x.duration_back ?? 0, x.return_transfers ?? 0, x.airline) : undefined;
    const url = x.link ? `https://www.aviasales.com${x.link}${marker ? `${x.link.includes("?") ? "&" : "?"}marker=${marker}` : ""}` : undefined;
    const sponsored = !!(marker && url);
    return {
      id: `tp:${from}${to}:${x.departure_at}:${x.return_at || ""}:${x.airline}${x.flight_number || ""}`,
      source: "travelpayouts", sourceName: "Travelpayouts", price: Math.round(x.price * pax), currency: (data.currency || q.currency || "EUR").toUpperCase(),
      url, ...(sponsored ? { sponsored } : {}), out, back
    };
  }).filter((o: FlightOffer) => !q.departTo || q.latest || (o.out.dep.slice(0, 10) >= q.depart && o.out.dep.slice(0, 10) <= q.departTo))
    .filter((o: FlightOffer) => q.maxStops == null || (o.out.stops <= q.maxStops && (!o.back || o.back.stops <= q.maxStops)))
    .filter((o: FlightOffer) => !q.latest || !o.back || !q.nightsMin || nightsBetween(o) >= q.nightsMin && nightsBetween(o) <= (q.nightsMax ?? q.nightsMin));
}

const nightsBetween = (o: FlightOffer) => Math.round((Date.parse(o.back!.dep.slice(0, 10)) - Date.parse(o.out.arr.slice(0, 10))) / 86400000);

/** höchstens so viele Anfragen je Suche (Codes × Monate), damit Travelpayouts nicht bremst */
export const TP_MAX = 12;

/**
 * Travelpayouts kennt nur einen Code je Anfrage: eine Stadt mit Stadt-Code (TYO) geht in einem Rutsch,
 * sonst eine Anfrage je Flughafen der Liste (die wichtigsten zuerst, bis TP_MAX).
 */
export function tpRoutes(q: FlightQuery, months: number): [string, string][] {
  const side = (code: string, city?: string, aps?: string[]) => (city ? [city] : aps?.length ? aps : [code]);
  const from = side(q.from, q.fromCityCode, q.fromAirports), to = side(q.to, q.toCityCode, q.toAirports);
  const all = from.flatMap(a => to.map(b => [a, b] as [string, string]));
  return all.slice(0, Math.max(1, Math.floor(TP_MAX / Math.max(1, months))));
}

export async function searchTravelpayouts(q: FlightQuery, token: string, f: typeof fetch = fetch, marker?: string): Promise<FlightOffer[]> {
  // Umstieg an einem bestimmten Ort kann Travelpayouts nicht (keine Umstiegsorte in den Daten)
  if (q.via?.length) return [];
  // flexibel mehrere Monate, mehrere Flughäfen: alles gleichzeitig; ein Fehler zählt nur, wenn keine Anfrage durchkommt
  const pairs = tpPairs(q);
  const jobs = tpRoutes(q, pairs.length).flatMap(([from, to]) => pairs.map(pair => ({ qq: { ...q, from, to }, pair })));
  const res = await Promise.allSettled(jobs.map(j => tpFetch(j.qq, token, f, marker, j.pair)));
  const ok = res.filter((r): r is PromiseFulfilledResult<FlightOffer[]> => r.status === "fulfilled");
  if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  return ok.flatMap(r => r.value).filter(o => (seen.has(o.id) ? false : (seen.add(o.id), true))).sort((a, b) => a.price - b.price);
}

async function tpFetch(q: FlightQuery, token: string, f: typeof fetch, marker: string | undefined, pair: [string, string | undefined]): Promise<FlightOffer[]> {
  // Token im Kopf statt in der Adresse, damit er in keinem Protokoll landet
  const res = await f(`${TP_URL}?${tpParams(q, marker, pair)}`, { headers: { accept: "application/json", "x-access-token": token } });
  if (!res.ok) {
    // Begründung aus der Antwort mitgeben (z. B. welches Feld nicht passt), sonst nur der Status
    const body = await res.text().catch(() => "");
    let why = "";
    try { const j = JSON.parse(body); why = String(j.error || j.message || ""); } catch { why = body; }
    why = why.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(`Travelpayouts antwortet mit ${res.status}${why ? `: ${why}` : ""}`);
  }
  const data: any = await res.json();
  if (data?.success === false) throw new Error(String(data.error || "Travelpayouts: Fehler bei der Suche"));
  return fromTravelpayouts(data, q, marker);
}
