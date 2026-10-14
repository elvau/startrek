/*
 * Bahn und Bus vom Flughafen in die Stadt: Richtwerte je Erwachsenem und Fahrt in Euro (Stand 2025, gerundet,
 * Normaltarif 2. Klasse bzw. Linienbus; Express-Züge nur, wo es keinen günstigeren Zug gibt). Kinder meist die Hälfte,
 * Kleinkinder frei. Ohne Eintrag: grobe Schätzung aus Strecke und Preisniveau, als „geschätzt“ markiert.
 * Gilt nur bis TRANSIT_MAX_KM Straße (weiter draußen fährt die Linie nicht bis zur Unterkunft).
 */

export interface Line { eur: number; line: string }
export interface AirportTransit { rail?: Line; bus?: Line }

export const AIRPORT_TRANSIT: Record<string, AirportTransit> = {
  // Japan, Korea, China, Südostasien
  HND: { rail: { eur: 3, line: "Keikyu / Tokyo Monorail" }, bus: { eur: 8, line: "Airport Limousine" } },
  NRT: { rail: { eur: 8, line: "Keisei Access Express" }, bus: { eur: 9, line: "Airport Bus TYO-NRT" } },
  KIX: { rail: { eur: 7, line: "Nankai Airport Express" }, bus: { eur: 10, line: "Airport Limousine" } },
  ITM: { rail: { eur: 2, line: "Osaka Monorail" }, bus: { eur: 4, line: "Airport Limousine" } },
  NGO: { rail: { eur: 6, line: "Meitetsu" } },
  CTS: { rail: { eur: 7, line: "JR Rapid Airport" } },
  FUK: { rail: { eur: 2, line: "Fukuoka Subway" } },
  ICN: { rail: { eur: 3, line: "AREX" }, bus: { eur: 12, line: "Airport Limousine" } },
  GMP: { rail: { eur: 1, line: "Seoul Metro" } },
  PEK: { rail: { eur: 4, line: "Airport Express" }, bus: { eur: 4, line: "Airport Bus" } },
  PKX: { rail: { eur: 5, line: "Daxing Airport Express" } },
  PVG: { rail: { eur: 1, line: "Metro Linie 2" }, bus: { eur: 3, line: "Airport Bus" } },
  HKG: { rail: { eur: 14, line: "Airport Express" }, bus: { eur: 4, line: "Citybus A21" } },
  TPE: { rail: { eur: 5, line: "Taoyuan Airport MRT" }, bus: { eur: 4, line: "Kuo-Kuang" } },
  BKK: { rail: { eur: 1, line: "Airport Rail Link" } },
  SIN: { rail: { eur: 2, line: "MRT" } },
  KUL: { rail: { eur: 11, line: "KLIA Ekspres" }, bus: { eur: 3, line: "Airport Coach" } },
  DXB: { rail: { eur: 2, line: "Dubai Metro" } },
  DEL: { rail: { eur: 1, line: "Airport Express Line" } },
  // Europa
  LHR: { rail: { eur: 7, line: "Piccadilly Line" }, bus: { eur: 8, line: "National Express" } },
  LGW: { rail: { eur: 14, line: "Southern / Thameslink" }, bus: { eur: 10, line: "National Express" } },
  STN: { rail: { eur: 23, line: "Stansted Express" }, bus: { eur: 12, line: "National Express" } },
  LTN: { rail: { eur: 20, line: "Luton DART + Thameslink" }, bus: { eur: 12, line: "National Express" } },
  CDG: { rail: { eur: 13, line: "RER B" }, bus: { eur: 17, line: "Roissybus" } },
  ORY: { rail: { eur: 13, line: "Metro 14" }, bus: { eur: 11, line: "Orlybus" } },
  AMS: { rail: { eur: 6, line: "NS-Zug" }, bus: { eur: 7, line: "Bus 397" } },
  BRU: { rail: { eur: 11, line: "SNCB-Zug" }, bus: { eur: 7, line: "De Lijn" } },
  FRA: { rail: { eur: 7, line: "S-Bahn S8/S9" } },
  MUC: { rail: { eur: 14, line: "S-Bahn S1/S8" }, bus: { eur: 12, line: "Lufthansa Express Bus" } },
  BER: { rail: { eur: 5, line: "FEX / S-Bahn (ABC)" } },
  HAM: { rail: { eur: 4, line: "S-Bahn S1" } },
  DUS: { rail: { eur: 3, line: "S-Bahn S11" } },
  CGN: { rail: { eur: 3, line: "S-Bahn S19" } },
  STR: { rail: { eur: 5, line: "S-Bahn S2/S3" } },
  VIE: { rail: { eur: 5, line: "S-Bahn S7" }, bus: { eur: 9, line: "Vienna Airport Lines" } },
  ZRH: { rail: { eur: 8, line: "SBB-Zug" } },
  GVA: { rail: { eur: 0, line: "SBB-Zug (Gratisticket am Gepäckband)" } },
  CPH: { rail: { eur: 5, line: "Metro M2" } },
  OSL: { rail: { eur: 12, line: "Vy-Regionalzug" }, bus: { eur: 16, line: "Flybussen" } },
  ARN: { rail: { eur: 29, line: "Arlanda Express" }, bus: { eur: 11, line: "Flygbussarna" } },
  HEL: { rail: { eur: 4, line: "HSL-Zug I/P" } },
  DUB: { bus: { eur: 8, line: "Airlink / Dublin Express" } },
  KEF: { bus: { eur: 25, line: "Flybus" } },
  FCO: { rail: { eur: 14, line: "Leonardo Express" }, bus: { eur: 7, line: "Terravision" } },
  CIA: { bus: { eur: 6, line: "Terravision" } },
  MXP: { rail: { eur: 13, line: "Malpensa Express" }, bus: { eur: 10, line: "Malpensa Shuttle" } },
  LIN: { rail: { eur: 2, line: "Metro M4" } },
  VCE: { bus: { eur: 10, line: "ATVO / ACTV" } },
  NAP: { bus: { eur: 5, line: "Alibus" } },
  BCN: { rail: { eur: 5, line: "Rodalies R2 Nord" }, bus: { eur: 8, line: "Aerobús" } },
  MAD: { rail: { eur: 5, line: "Metro L8" }, bus: { eur: 5, line: "Exprés Aeropuerto" } },
  AGP: { rail: { eur: 2, line: "Cercanías C1" } },
  PMI: { bus: { eur: 5, line: "TIB A1" } },
  LIS: { rail: { eur: 2, line: "Metro Linha Vermelha" }, bus: { eur: 4, line: "Aerobus" } },
  OPO: { rail: { eur: 2, line: "Metro Linha E" } },
  ATH: { rail: { eur: 9, line: "Metro M3" }, bus: { eur: 6, line: "X95" } },
  IST: { rail: { eur: 1, line: "Metro M11" }, bus: { eur: 5, line: "Havaist" } },
  PRG: { bus: { eur: 2, line: "Bus 119 + Metro" } },
  BUD: { bus: { eur: 6, line: "100E" } },
  WAW: { rail: { eur: 1, line: "SKM / Koleje Mazowieckie" } },
  KRK: { rail: { eur: 4, line: "Koleje Małopolskie" } },
  // Amerika, Australien
  JFK: { rail: { eur: 11, line: "AirTrain + Subway" } },
  EWR: { rail: { eur: 15, line: "AirTrain + NJ Transit" } },
  LGA: { bus: { eur: 3, line: "Q70 + Subway" } },
  SFO: { rail: { eur: 10, line: "BART" } },
  LAX: { bus: { eur: 9, line: "FlyAway" } },
  ORD: { rail: { eur: 5, line: "CTA Blue Line" } },
  BOS: { bus: { eur: 0, line: "Silver Line SL1 (gratis)" } },
  YYZ: { rail: { eur: 9, line: "UP Express" } },
  YVR: { rail: { eur: 6, line: "SkyTrain Canada Line" } },
  SYD: { rail: { eur: 12, line: "Airport Link" } }
};

/** weiter als so viele Straßen-km gilt die Linie nicht als Weg zur Unterkunft */
export const TRANSIT_MAX_KM = 60;

export type TransferKind = "rail" | "bus" | "public" | "taxi";
export interface TransferChoice {
  k: TransferKind;
  /** Euro je Fahrt für die ganze Gruppe */
  perRide: number;
  /** Bahn/Bus: Euro je Erwachsenem und Fahrt */
  adult?: number;
  line?: string;
  /** ohne hinterlegten Richtwert grob geschätzt */
  guess?: boolean;
}

export interface Group { adults: number; children: number }

/** Fahrpreis für alle: Erwachsene voll, Kinder die Hälfte, Kleinkinder frei */
const groupFare = (eur: number, g: Group) => Math.round(eur * (g.adults + g.children / 2));

/**
 * Möglichkeiten vom Flughafen zur Unterkunft, günstigste zuerst: Bahn und Bus aus der Tabelle (sonst eine grobe
 * Schätzung „Bahn/Bus“, solange die Strecke kurz genug ist), dazu immer Taxi bzw. Van (perRide aus der Fahrzeugrechnung).
 */
export function transferChoices(ap: string, km: number, g: Group, taxi: number, pli = 1): TransferChoice[] {
  const out: TransferChoice[] = [];
  const known = AIRPORT_TRANSIT[ap];
  if (km <= TRANSIT_MAX_KM) {
    if (known?.rail) out.push({ k: "rail", adult: known.rail.eur, line: known.rail.line, perRide: groupFare(known.rail.eur, g) });
    if (known?.bus) out.push({ k: "bus", adult: known.bus.eur, line: known.bus.line, perRide: groupFare(known.bus.eur, g) });
    if (!known) {
      const eur = Math.max(1, Math.round((1.5 + 0.12 * km) * Math.pow(pli || 1, 0.7)));
      out.push({ k: "public", adult: eur, perRide: groupFare(eur, g), guess: true });
    }
  }
  out.sort((a, b) => a.perRide - b.perRide);
  out.push({ k: "taxi", perRide: taxi });
  return out;
}
