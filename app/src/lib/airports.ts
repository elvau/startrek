import type { Airport } from "./model";

/**
 * Abflughäfen mit Bahnpreis (pro Person, hin und zurück), Fahrzeit und Parken pro Tag. Die ersten (NRW) aus der bisherigen
 * App mit festen Werten; ohne Wohnort schlägt die Suche diese vor. Die übrigen haben pp und h 0: Bahnpreis und Fahrzeit
 * kommen dann aus der Entfernung zum Wohnort (trainPP).
 */
export const DEFAULT_AIRPORTS: Airport[] = [
  { code: "DUS", name: "Düsseldorf", pp: 10, h: 0.6, park: 12, lat: 51.289, lon: 6.767 },
  { code: "NRN", name: "Weeze", pp: 5, h: 0.5, park: 6, lat: 51.602, lon: 6.142 },
  { code: "CGN", name: "Köln/Bonn", pp: 20, h: 1.2, park: 8, lat: 50.866, lon: 7.143 },
  { code: "DTM", name: "Dortmund", pp: 20, h: 1.3, park: 7, lat: 51.518, lon: 7.612 },
  { code: "EIN", name: "Eindhoven", pp: 10, h: 1.0, park: 9, lat: 51.45, lon: 5.375 },
  { code: "AMS", name: "Amsterdam", pp: 30, h: 2.0, park: 12, lat: 52.31, lon: 4.768 },
  { code: "FRA", name: "Frankfurt", pp: 45, h: 2.5, park: 13, lat: 50.038, lon: 8.562 },
  { code: "MUC", name: "München", pp: 80, h: 5.5, park: 11, lat: 48.354, lon: 11.775 },
  { code: "PAD", name: "Paderborn", pp: 35, h: 1.6, park: 6, lat: 51.614, lon: 8.616 },
  { code: "HAJ", name: "Hannover", pp: 45, h: 2.3, park: 9, lat: 52.461, lon: 9.685 },
  // übriges Deutschland und grenznah: Bahnpreis und Fahrzeit aus der Entfernung zum Wohnort (pp 0, h 0)
  { code: "HAM", name: "Hamburg", pp: 0, h: 0, park: 12, lat: 53.63, lon: 9.988 },
  { code: "BER", name: "Berlin", pp: 0, h: 0, park: 12, lat: 52.362, lon: 13.502 },
  { code: "STR", name: "Stuttgart", pp: 0, h: 0, park: 12, lat: 48.69, lon: 9.222 },
  { code: "NUE", name: "Nürnberg", pp: 0, h: 0, park: 9, lat: 49.499, lon: 11.078 },
  { code: "LEJ", name: "Leipzig/Halle", pp: 0, h: 0, park: 8, lat: 51.421, lon: 12.233 },
  { code: "DRS", name: "Dresden", pp: 0, h: 0, park: 8, lat: 51.134, lon: 13.768 },
  { code: "BRE", name: "Bremen", pp: 0, h: 0, park: 9, lat: 53.047, lon: 8.789 },
  { code: "FMO", name: "Münster/Osnabrück", pp: 0, h: 0, park: 7, lat: 52.134, lon: 7.688 },
  { code: "FKB", name: "Karlsruhe/Baden-Baden", pp: 0, h: 0, park: 6, lat: 48.779, lon: 8.081 },
  { code: "FMM", name: "Memmingen", pp: 0, h: 0, park: 6, lat: 47.988, lon: 10.238 },
  { code: "HHN", name: "Hahn", pp: 0, h: 0, park: 5, lat: 49.946, lon: 7.262 },
  { code: "SCN", name: "Saarbrücken", pp: 0, h: 0, park: 6, lat: 49.215, lon: 7.11 },
  { code: "FDH", name: "Friedrichshafen", pp: 0, h: 0, park: 7, lat: 47.671, lon: 9.511 },
  { code: "BSL", name: "Basel", pp: 0, h: 0, park: 15, lat: 47.601, lon: 7.521 },
  { code: "ZRH", name: "Zürich", pp: 0, h: 0, park: 20, lat: 47.458, lon: 8.548 },
  { code: "VIE", name: "Wien", pp: 0, h: 0, park: 14, lat: 48.11, lon: 16.57 },
  { code: "SZG", name: "Salzburg", pp: 0, h: 0, park: 12, lat: 47.793, lon: 13.004 },
  { code: "LUX", name: "Luxemburg", pp: 0, h: 0, park: 12, lat: 49.627, lon: 6.212 },
  { code: "BRU", name: "Brüssel", pp: 0, h: 0, park: 15, lat: 50.901, lon: 4.484 },
  { code: "CRL", name: "Charleroi", pp: 0, h: 0, park: 9, lat: 50.462, lon: 4.46 }
];
