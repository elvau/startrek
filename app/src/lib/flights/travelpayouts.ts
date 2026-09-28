/*
 * Travelpayouts (Aviasales Data API v3, prices_for_dates): offizielles Partnerprogramm, kostenlos mit Token.
 * Preise stammen aus dem Zwischenspeicher von Aviasales (Suchen der letzten Tage) und gelten pro Person.
 * Ankunftszeiten liefert die Schnittstelle nicht, sie werden aus Abflug + Flugdauer berechnet.
 */
import type { FlightOffer, FlightQuery, OfferLeg } from "./types";

export const TP_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates";

const iata = (s: string) => /^[A-Za-z]{3}$/.test(s.trim()) ? s.trim().toUpperCase() : null;

/** Anfrage: feste Daten genau, flexibel ganze Monate (gefiltert wird danach in search.ts) */
export function tpParams(q: FlightQuery, marker?: string): URLSearchParams {
  const from = iata(q.from), to = iata(q.to);
  if (!from || !to) throw new Error("Travelpayouts braucht Flughafencodes (z. B. DUS → SPU)");
  const flex = !!q.latest;
  const p = new URLSearchParams({
    origin: from, destination: to,
    departure_at: flex ? q.depart.slice(0, 7) : q.depart,
    sorting: "price", unique: "false", currency: (q.currency || "EUR").toLowerCase(), limit: "30", page: "1"
  });
  const ret = flex ? q.latest : q.ret;
  if (ret) p.set("return_at", flex ? ret.slice(0, 7) : ret);
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
    return {
      id: `tp:${from}${to}:${x.departure_at}:${x.return_at || ""}:${x.airline}${x.flight_number || ""}`,
      source: "travelpayouts", sourceName: "Travelpayouts", price: Math.round(x.price * pax), currency: (data.currency || q.currency || "EUR").toUpperCase(),
      url, out, back
    };
  }).filter((o: FlightOffer) => q.maxStops == null || (o.out.stops <= q.maxStops && (!o.back || o.back.stops <= q.maxStops)))
    .filter((o: FlightOffer) => !q.latest || !o.back || !q.nightsMin || nightsBetween(o) >= q.nightsMin && nightsBetween(o) <= (q.nightsMax ?? q.nightsMin));
}

const nightsBetween = (o: FlightOffer) => Math.round((Date.parse(o.back!.dep.slice(0, 10)) - Date.parse(o.out.arr.slice(0, 10))) / 86400000);

export async function searchTravelpayouts(q: FlightQuery, token: string, f: typeof fetch = fetch, marker?: string): Promise<FlightOffer[]> {
  // Token im Kopf statt in der Adresse, damit er in keinem Protokoll landet
  const res = await f(`${TP_URL}?${tpParams(q, marker)}`, { headers: { accept: "application/json", "x-access-token": token } });
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
