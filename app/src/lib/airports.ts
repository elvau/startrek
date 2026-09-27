import type { Airport } from "./model";

/** Abflughäfen mit Bahnpreis (pro Person, hin und zurück), Fahrzeit und Parken pro Tag. Aus der bisherigen App. */
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
  { code: "HAJ", name: "Hannover", pp: 45, h: 2.3, park: 9, lat: 52.461, lon: 9.685 }
];
