/*
 * Abflughäfen ohne Wohnort: aus dem ungefähren Ort der Verbindung die nächsten Flughäfen, sonst die großen Flughäfen
 * des Landes. Für die Anfahrtskosten reicht das nicht, dafür braucht es weiter die Postleitzahl.
 */
import { airportsNear, type AirportData } from "../geo/locations";

export interface Where { cc?: string; lat?: number; lon?: number; city?: string }

/** große Flughäfen je Land (Rückfall, wenn nur das Land bekannt ist) */
export const HUBS: Record<string, string[]> = {
  DE: ["FRA", "MUC", "DUS", "BER", "HAM"], AT: ["VIE", "SZG", "INN", "GRZ"], CH: ["ZRH", "GVA", "BSL"], NL: ["AMS", "EIN", "RTM"],
  BE: ["BRU", "CRL"], LU: ["LUX"], FR: ["CDG", "ORY", "NCE", "LYS"], ES: ["MAD", "BCN", "PMI", "AGP"], IT: ["FCO", "MXP", "VCE", "NAP"],
  PT: ["LIS", "OPO", "FAO"], PL: ["WAW", "KRK", "GDN", "WRO"], CZ: ["PRG", "BRQ"], SK: ["BTS", "KSC"], HU: ["BUD"], SI: ["LJU"],
  HR: ["ZAG", "SPU", "DBV"], DK: ["CPH", "BLL"], SE: ["ARN", "GOT"], NO: ["OSL", "BGO"], FI: ["HEL"], IE: ["DUB", "ORK"],
  GB: ["LHR", "LGW", "MAN", "STN"], GR: ["ATH", "SKG"], TR: ["IST", "SAW", "AYT"], RO: ["OTP", "CLJ"], BG: ["SOF", "VAR"],
  RS: ["BEG"], UA: ["KBP", "LWO"], LT: ["VNO"], LV: ["RIX"], EE: ["TLL"], RU: ["SVO", "DME", "LED"], US: ["JFK", "LAX", "ORD", "ATL"],
  CA: ["YYZ", "YVR", "YUL"], AE: ["DXB", "AUH"], SA: ["RUH", "JED"], QA: ["DOH"], EG: ["CAI", "HRG"], MA: ["CMN", "RAK"],
  TN: ["TUN"], JO: ["AMM"], IL: ["TLV"], AU: ["SYD", "MEL"], JP: ["HND", "NRT", "KIX"]
};

export type Guess = { how: "ip" | "country"; codes: string[]; city?: string; cc?: string };

/** Vorschlag aus dem ungefähren Ort: nächste Flughäfen (bis 250 km), sonst die großen des Landes; null: nichts bekannt */
export function guessAirports(where: Where | null, data: AirportData | null, n = 4): Guess | null {
  if (!where) return null;
  if (where.lat != null && where.lon != null && data?.airports.length) {
    const near = airportsNear(data, { lat: where.lat, lon: where.lon }, 250, n).map(l => l.code);
    if (near.length) return { how: "ip", codes: near, ...(where.city ? { city: where.city } : {}), ...(where.cc ? { cc: where.cc } : {}) };
  }
  const hubs = where.cc ? HUBS[where.cc] : undefined;
  return hubs ? { how: "country", codes: hubs.slice(0, n), cc: where.cc } : null;
}
