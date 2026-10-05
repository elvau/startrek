/*
 * Flug-Nebenkosten (#171): was im Tarif enthalten ist, Koffer und Sitzplätze dazubuchen. Richtwerte je Billigflieger
 * (Koffer bis 20–23 kg, online vorab, je Strecke), Stand und Quellen in docs/FLUGSUCHE.md. Linienflüge ohne Angabe
 * schätzen wir nicht („nicht angegeben“); sagt der Anbieter „kein Koffer“, gilt ein allgemeiner Richtwert.
 */
import type { Extra } from "../model";
import { FEES_AS_OF } from "../fees";
import type { FlightOffer } from "./types";

export interface LowCost {
  id: string;
  name: string;
  /** IATA-Codes (Travelpayouts liefert nur den Code) */
  codes: string[];
  words: RegExp;
  /** Koffer je Strecke, EUR */
  bag: number;
  /** Kinder sitzen nur mit bezahlter Platzwahl neben einem Erwachsenen: Preis je Platz und Strecke */
  famSeat?: number;
  /** alle zahlen den Platz (sonst ein Erwachsener je bis zu 4 Kinder, die Kinder sitzen dann frei) */
  famAll?: boolean;
  source: string;
}

export const LOW_COST: LowCost[] = [
  { id: "ryanair", name: "Ryanair", codes: ["FR", "RK", "AL", "RR"], words: /ryanair|buzz|malta air/i, bag: 40, source: "ryanair.com, Gebühren (Kinder seit 6/2026 gratis neben Erwachsenen)" },
  { id: "wizz", name: "Wizz Air", codes: ["W6", "W4", "W9"], words: /wizz/i, bag: 45, source: "wizzair.com, Gebühren (ein Kind gratis neben einem Erwachsenen)" },
  { id: "easyjet", name: "easyJet", codes: ["U2", "EC", "DS"], words: /easyjet/i, bag: 35, source: "easyjet.com, Gebühren" },
  { id: "vueling", name: "Vueling", codes: ["VY"], words: /vueling/i, bag: 30, source: "vueling.com, Gebühren" },
  { id: "eurowings", name: "Eurowings", codes: ["EW"], words: /eurowings/i, bag: 30, source: "eurowings.com, Tarif Basic" },
  { id: "transavia", name: "Transavia", codes: ["HV", "TO"], words: /transavia/i, bag: 35, source: "transavia.com, Gebühren" },
  { id: "volotea", name: "Volotea", codes: ["V7"], words: /volotea/i, bag: 30, source: "volotea.com, Gebühren" },
  { id: "pegasus", name: "Pegasus", codes: ["PC"], words: /pegasus/i, bag: 25, source: "flypgs.com, Tarif Basic" },
  { id: "sunexpress", name: "SunExpress", codes: ["XQ"], words: /sunexpress/i, bag: 25, source: "sunexpress.com, Tarif SunEco" },
  { id: "jet2", name: "Jet2", codes: ["LS"], words: /jet2/i, bag: 25, source: "jet2.com, Gebühren" },
  { id: "norwegian", name: "Norwegian", codes: ["DY", "D8"], words: /norwegian/i, bag: 35, source: "norwegian.com, Tarif LowFare" }
];

/** Koffer je Strecke, wenn ein Linientarif ausdrücklich keinen enthält (Light-Tarife) */
export const LINE_BAG = 35;

/** Länder, in denen Kartenaufschläge für Verbraucher verboten sind (EU/EWR, Großbritannien) */
const NO_SURCHARGE = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO GB".split(" "));
export const surchargeBanned = (cc?: string) => !cc || NO_SURCHARGE.has(cc.toUpperCase());

export function lowCostOf(carrier: string, table: LowCost[] = LOW_COST): LowCost | undefined {
  const c = carrier.trim();
  return table.find(l => l.codes.includes(c.toUpperCase()) || l.words.test(c));
}

/** was die Gruppe braucht: Koffer insgesamt, Plätze, ob Kinder neben den Eltern sitzen sollen */
export interface BagNeed { bags: number; adults: number; kids: number; together: boolean }

export interface AddOns {
  /** Koffer dazubuchen (geschätzt) bzw. Sitzplätze, gesamt in EUR */
  bagFee: number;
  seatFee: number;
  total: number;
  /** so viele Koffer fehlen (je Strecke) */
  missing: number;
  /** Koffer im Preis (gesamt); null: nicht angegeben */
  incl: number | null;
  /** Billigflieger, nach dem geschätzt wurde */
  carrier?: string;
  source?: string;
}

/** Zuschläge eines Angebots für die Gruppe (Preise in EUR) */
/** table: Liste der Billigflieger (für Tests austauschbar) */
export function addOns(o: FlightOffer, need: BagNeed, table: LowCost[] = LOW_COST): AddOns {
  const legs = [o.out, ...(o.back ? [o.back] : [])];
  const lows = legs.map(l => l.carriers.map(c => lowCostOf(c, table)).find(Boolean));
  const incl = o.baggage ? o.baggage.checked : null;
  const missing = Math.max(0, need.bags - (incl ?? 0));
  let bagFee = 0, seatFee = 0;
  legs.forEach((_, i) => {
    const lc = lows[i];
    // Koffer: bekannt fehlend (Anbieter sagt es) oder Billigflieger ohne Angabe; Linie ohne Angabe bleibt offen
    if (missing && (incl != null || lc)) bagFee += missing * (lc?.bag ?? LINE_BAG);
    if (need.together && need.kids > 0 && lc?.famSeat) {
      const payers = lc.famAll ? need.adults + need.kids : Math.min(need.adults, Math.ceil(need.kids / 4));
      seatFee += payers * lc.famSeat;
    }
  });
  const lc = lows.find(Boolean);
  return { bagFee, seatFee, total: bagFee + seatFee, missing: bagFee ? missing : 0, incl, ...(lc ? { carrier: lc.name, source: lc.source } : {}) };
}

/** als Nebenkosten am Flug-Posten (bei Buchung dazu, geschätzt, wegklickbar); Beträge in der Währung des Angebots */
export function addOnExtras(a: AddOns, labels: { bags: string; seats: string }, rate = 1): Extra[] {
  const src = `${a.carrier ? `${a.carrier} · ` : ""}${a.source ? `${a.source}, ` : ""}${FEES_AS_OF}`;
  const x = (kind: "bag" | "seat", amount: number, label: string): Extra =>
    ({ id: `fl:${kind}`, kind, label, amount: Math.round(amount * rate * 100) / 100, basis: "booking", pay: "extra", est: true, source: src });
  return [...(a.bagFee > 0 ? [x("bag", a.bagFee, labels.bags)] : []), ...(a.seatFee > 0 ? [x("seat", a.seatFee, labels.seats)] : [])];
}
