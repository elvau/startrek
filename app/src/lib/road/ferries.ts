/*
 * Fähren (#202): häufige Autofähren aus Deutschland heraus, Richtwerte (Hauptsaison, grob, ohne Gewähr; Stand und Quellen
 * in docs/NEBENKOSTEN.md). Erkennung: Liegen zwei Halte einer Auto-Reise in verschiedenen Gebieten, die nur übers Wasser
 * verbunden sind (Insel, Großbritannien, Irland), kommt die passende Fähre dazwischen.
 */
import { km, type LL } from "./ors";

export interface Port { name: string; cc: string; lat: number; lon: number }
export interface Ferry {
  id: string;
  a: Port;
  b: Port;
  /** Fahrzeit in Stunden */
  hours: number;
  /** Nachtfähre */
  night: boolean;
  /** Pkw einfache Fahrt (pkg: Paket mit Personen und Pflichtkabine); fehlt: kein belastbarer Wert */
  car?: number;
  /** Erwachsener Deck bzw. Sitz einfache Fahrt */
  person?: number;
  /** Kabine (2–4 Betten) je Kabine, nur Nachtfähren */
  cabin?: number;
  /** Wohnmobil statt Pkw */
  camper?: number;
  pkg?: boolean;
  currency: string;
  ops: string[];
  source: string;
}

const P = (name: string, cc: string, lat: number, lon: number): Port => ({ name, cc, lat, lon });
const DF = "Direct Ferries", FH = "Ferryhopper";

export const FERRIES: Ferry[] = [
  // Sardinien
  { id: "livorno-olbia", a: P("Livorno", "IT", 43.56, 10.30), b: P("Olbia", "IT", 40.92, 9.52), hours: 9, night: true, car: 219, person: 70, cabin: 140, currency: "EUR", ops: ["Moby", "Grimaldi"], source: DF },
  { id: "genova-olbia", a: P("Genua", "IT", 44.41, 8.91), b: P("Olbia", "IT", 40.92, 9.52), hours: 11, night: true, car: 258, cabin: 150, currency: "EUR", ops: ["Moby", "GNV"], source: DF },
  { id: "genova-porto-torres", a: P("Genua", "IT", 44.41, 8.91), b: P("Porto Torres", "IT", 40.84, 8.40), hours: 11, night: true, cabin: 70, currency: "EUR", ops: ["GNV", "Tirrenia"], source: DF },
  { id: "civitavecchia-olbia", a: P("Civitavecchia", "IT", 42.10, 11.78), b: P("Olbia", "IT", 40.92, 9.52), hours: 7, night: true, car: 271, person: 134, currency: "EUR", ops: ["GNV", "Grimaldi", "Tirrenia"], source: DF },
  { id: "livorno-golfo-aranci", a: P("Livorno", "IT", 43.56, 10.30), b: P("Golfo Aranci", "IT", 41.00, 9.62), hours: 10, night: true, car: 327, currency: "EUR", ops: ["Corsica Ferries"], source: DF },
  { id: "civitavecchia-cagliari", a: P("Civitavecchia", "IT", 42.10, 11.78), b: P("Cagliari", "IT", 39.21, 9.11), hours: 14.5, night: true, car: 355, currency: "EUR", ops: ["Grimaldi"], source: DF },
  { id: "piombino-olbia", a: P("Piombino", "IT", 42.93, 10.55), b: P("Olbia", "IT", 40.92, 9.52), hours: 5.5, night: false, person: 37, currency: "EUR", ops: ["Moby"], source: DF },
  // Korsika
  { id: "livorno-bastia", a: P("Livorno", "IT", 43.56, 10.30), b: P("Bastia", "FR", 42.70, 9.45), hours: 5, night: false, car: 267, person: 72, currency: "EUR", ops: ["Corsica Ferries", "Moby"], source: DF },
  { id: "savona-bastia", a: P("Savona (Vado)", "IT", 44.27, 8.44), b: P("Bastia", "FR", 42.70, 9.45), hours: 7, night: false, car: 365, person: 98, currency: "EUR", ops: ["Corsica Ferries"], source: DF },
  { id: "nice-bastia", a: P("Nizza", "FR", 43.70, 7.29), b: P("Bastia", "FR", 42.70, 9.45), hours: 7, night: false, car: 214, person: 59, currency: "EUR", ops: ["Corsica Ferries"], source: DF },
  { id: "toulon-ajaccio", a: P("Toulon", "FR", 43.12, 5.93), b: P("Ajaccio", "FR", 41.92, 8.74), hours: 10, night: true, car: 429, person: 122, cabin: 90, currency: "EUR", ops: ["Corsica Ferries"], source: DF },
  { id: "marseille-ajaccio", a: P("Marseille", "FR", 43.31, 5.36), b: P("Ajaccio", "FR", 41.92, 8.74), hours: 12.5, night: true, car: 555, person: 180, currency: "EUR", ops: ["Corsica Linea", "La Méridionale"], source: DF },
  { id: "bonifacio-santa-teresa", a: P("Bonifacio", "FR", 41.39, 9.16), b: P("Santa Teresa Gallura", "IT", 41.24, 9.19), hours: 1, night: false, car: 97, currency: "EUR", ops: ["Moby", "Ichnusa Lines"], source: DF },
  // Balearen
  { id: "barcelona-palma", a: P("Barcelona", "ES", 41.37, 2.18), b: P("Palma", "ES", 39.56, 2.63), hours: 7, night: true, car: 205, person: 74, cabin: 170, currency: "EUR", ops: ["Baleària", "Trasmed", "GNV"], source: DF },
  { id: "valencia-palma", a: P("Valencia", "ES", 39.45, -0.32), b: P("Palma", "ES", 39.56, 2.63), hours: 7.5, night: true, car: 218, person: 132, currency: "EUR", ops: ["Baleària", "GNV"], source: DF },
  { id: "denia-ibiza", a: P("Dénia", "ES", 38.84, 0.11), b: P("Ibiza", "ES", 38.91, 1.44), hours: 2.5, night: false, car: 227, currency: "EUR", ops: ["Baleària"], source: DF },
  { id: "denia-palma", a: P("Dénia", "ES", 38.84, 0.11), b: P("Palma", "ES", 39.56, 2.63), hours: 5.5, night: false, car: 350, currency: "EUR", ops: ["Baleària"], source: DF },
  { id: "barcelona-ibiza", a: P("Barcelona", "ES", 41.37, 2.18), b: P("Ibiza", "ES", 38.91, 1.44), hours: 8.5, night: true, car: 131, person: 65, cabin: 166, currency: "EUR", ops: ["Baleària", "Trasmed", "GNV"], source: DF },
  { id: "barcelona-mahon", a: P("Barcelona", "ES", 41.37, 2.18), b: P("Maó", "ES", 39.89, 4.27), hours: 8, night: true, car: 335, currency: "EUR", ops: ["Trasmed", "Baleària"], source: DF },
  // Sizilien
  { id: "genova-palermo", a: P("Genua", "IT", 44.41, 8.91), b: P("Palermo", "IT", 38.13, 13.37), hours: 20, night: true, car: 380, person: 170, cabin: 145, currency: "EUR", ops: ["GNV"], source: DF },
  { id: "napoli-palermo", a: P("Neapel", "IT", 40.84, 14.26), b: P("Palermo", "IT", 38.13, 13.37), hours: 10.5, night: true, car: 217, person: 103, currency: "EUR", ops: ["GNV", "Tirrenia"], source: DF },
  { id: "civitavecchia-palermo", a: P("Civitavecchia", "IT", 42.10, 11.78), b: P("Palermo", "IT", 38.13, 13.37), hours: 14, night: true, car: 352, person: 132, currency: "EUR", ops: ["GNV"], source: DF },
  { id: "salerno-palermo", a: P("Salerno", "IT", 40.67, 14.74), b: P("Palermo", "IT", 38.13, 13.37), hours: 10, night: true, car: 254, currency: "EUR", ops: ["Grimaldi"], source: DF },
  { id: "villa-san-giovanni-messina", a: P("Villa San Giovanni", "IT", 38.22, 15.63), b: P("Messina", "IT", 38.20, 15.56), hours: 0.33, night: false, car: 75, person: 2.5, currency: "EUR", ops: ["Caronte & Tourist"], source: FH },
  // Kreta, Kykladen
  { id: "piraeus-heraklion", a: P("Piräus", "GR", 37.94, 23.63), b: P("Heraklion", "GR", 35.34, 25.14), hours: 9.5, night: true, car: 327, person: 33, cabin: 250, currency: "EUR", ops: ["Minoan", "SeaJets"], source: DF },
  { id: "piraeus-chania", a: P("Piräus", "GR", 37.94, 23.63), b: P("Chania (Souda)", "GR", 35.49, 24.07), hours: 9, night: true, person: 45, cabin: 112, currency: "EUR", ops: ["Blue Star"], source: "ferriesingreece.com" },
  { id: "piraeus-santorini", a: P("Piräus", "GR", 37.94, 23.63), b: P("Santorini (Athinios)", "GR", 36.39, 25.43), hours: 7.75, night: false, car: 107, person: 58, currency: "EUR", ops: ["Blue Star", "SeaJets"], source: FH },
  { id: "piraeus-mykonos", a: P("Piräus", "GR", 37.94, 23.63), b: P("Mykonos", "GR", 37.46, 25.32), hours: 5, night: false, car: 85, person: 43, currency: "EUR", ops: ["Blue Star", "SeaJets"], source: FH },
  { id: "piraeus-paros", a: P("Piräus", "GR", 37.94, 23.63), b: P("Paros", "GR", 37.09, 25.15), hours: 4, night: false, car: 130, person: 40, currency: "EUR", ops: ["Blue Star", "SeaJets"], source: FH },
  { id: "piraeus-naxos", a: P("Piräus", "GR", 37.94, 23.63), b: P("Naxos", "GR", 37.11, 25.37), hours: 5, night: false, car: 83, person: 42, currency: "EUR", ops: ["Blue Star", "SeaJets"], source: FH },
  // Kroatische Inseln
  { id: "split-stari-grad", a: P("Split", "HR", 43.50, 16.44), b: P("Stari Grad (Hvar)", "HR", 43.18, 16.60), hours: 2, night: false, car: 47.6, person: 8.5, currency: "EUR", ops: ["Jadrolinija"], source: "Jadrolinija" },
  { id: "split-supetar", a: P("Split", "HR", 43.50, 16.44), b: P("Supetar (Brač)", "HR", 43.38, 16.55), hours: 0.83, night: false, car: 32, person: 5.2, currency: "EUR", ops: ["Jadrolinija"], source: "Jadrolinija" },
  { id: "split-vela-luka", a: P("Split", "HR", 43.50, 16.44), b: P("Vela Luka (Korčula)", "HR", 42.96, 16.72), hours: 3, night: false, car: 73.7, person: 10.8, currency: "EUR", ops: ["Jadrolinija"], source: "Jadrolinija" },
  { id: "valbiska-merag", a: P("Valbiska (Krk)", "HR", 45.02, 14.49), b: P("Merag (Cres)", "HR", 44.96, 14.45), hours: 0.42, night: false, car: 19.89, camper: 30.53, person: 4.25, currency: "EUR", ops: ["Jadrolinija"], source: "Jadrolinija" },
  // Elba
  { id: "piombino-portoferraio", a: P("Piombino", "IT", 42.93, 10.55), b: P("Portoferraio", "IT", 42.81, 10.33), hours: 1, night: false, car: 85, person: 18, currency: "EUR", ops: ["Moby", "Toremar", "Blu Navy"], source: FH },
  // Großbritannien, Irland
  { id: "calais-dover", a: P("Calais", "FR", 50.97, 1.87), b: P("Dover", "GB", 51.12, 1.33), hours: 1.5, night: false, car: 205, currency: "EUR", ops: ["P&O", "DFDS", "Irish Ferries"], source: DF },
  { id: "dunkerque-dover", a: P("Dünkirchen", "FR", 51.02, 2.20), b: P("Dover", "GB", 51.12, 1.33), hours: 2, night: false, car: 145, currency: "EUR", ops: ["DFDS"], source: DF },
  { id: "hoek-harwich", a: P("Hoek van Holland", "NL", 51.98, 4.12), b: P("Harwich", "GB", 51.95, 1.26), hours: 7, night: true, car: 550, cabin: 105, currency: "EUR", ops: ["Stena Line"], source: DF },
  { id: "ijmuiden-newcastle", a: P("IJmuiden", "NL", 52.46, 4.60), b: P("Newcastle", "GB", 55.00, -1.45), hours: 16, night: true, pkg: true, car: 1100, currency: "EUR", ops: ["DFDS"], source: DF },
  { id: "rotterdam-hull", a: P("Rotterdam (Europoort)", "NL", 51.95, 4.13), b: P("Hull", "GB", 53.74, -0.28), hours: 12, night: true, pkg: true, car: 640, currency: "EUR", ops: ["P&O"], source: DF },
  { id: "cherbourg-rosslare", a: P("Cherbourg", "FR", 49.65, -1.62), b: P("Rosslare", "IE", 52.25, -6.34), hours: 18, night: true, pkg: true, car: 529, currency: "EUR", ops: ["Stena Line", "Brittany Ferries"], source: FH },
  { id: "roscoff-cork", a: P("Roscoff", "FR", 48.72, -3.97), b: P("Cork (Ringaskiddy)", "IE", 51.83, -8.32), hours: 14, night: true, car: 625, currency: "EUR", ops: ["Brittany Ferries"], source: DF },
  { id: "holyhead-dublin", a: P("Holyhead", "GB", 53.31, -4.63), b: P("Dublin", "IE", 53.35, -6.20), hours: 3.25, night: false, car: 404, currency: "EUR", ops: ["Irish Ferries", "Stena Line"], source: DF }
];

/** Gebiete, die man nur übers Wasser erreicht: Inseln als Rechteck [Süd, Nord, West, Ost]; GB und IE nach Land */
const ISLANDS: [string, number, number, number, number][] = [
  ["sardinia", 38.8, 41.35, 8.1, 9.85], ["corsica", 41.36, 43.05, 8.5, 9.6], ["balearics", 38.6, 40.1, 1.15, 4.35],
  ["sicily", 36.6, 38.32, 12.3, 15.6], ["crete", 34.8, 35.7, 23.4, 26.4], ["cyclades", 36.3, 37.7, 24.2, 26.0],
  ["elba", 42.7, 42.9, 10.05, 10.45], ["hvar", 43.08, 43.22, 16.3, 17.25], ["brac", 43.24, 43.42, 16.38, 16.95],
  ["korcula", 42.88, 43.0, 16.6, 17.15], ["cres", 44.6, 44.99, 14.25, 14.5]
];
const BY_CC: Record<string, string> = { GB: "gb", IE: "ie" };

/** Gebiet eines Punkts (Insel bzw. GB/IE), sonst Festland (undefined) */
export function areaOf(p: { lat: number; lon: number }, cc?: string): string | undefined {
  const i = ISLANDS.find(([, s, n, w, e]) => p.lat >= s && p.lat <= n && p.lon >= w && p.lon <= e);
  if (i) return i[0];
  return cc ? BY_CC[cc] : undefined;
}

export interface FerryPick { ferry: Ferry; from: Port; to: Port }

/**
 * Fähren zwischen zwei Halten in verschiedenen Gebieten, beste zuerst: Häfen auf der richtigen Seite, kürzester Weg
 * Halt A → Hafen + Hafen → Halt B. Leer, wenn beide im selben Gebiet liegen (oder keine Verbindung bekannt ist).
 */
export function ferriesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }, ccOf: (p: LL) => string | undefined): FerryPick[] {
  const area = (p: { lat: number; lon: number }, cc?: string) => areaOf(p, cc ?? ccOf([p.lat, p.lon]));
  const aa = area(a), ab = area(b);
  if (aa === ab) return [];
  const out: (FerryPick & { score: number })[] = [];
  for (const f of FERRIES) {
    for (const [x, y] of [[f.a, f.b], [f.b, f.a]] as const) {
      if (area(x, x.cc) !== aa || area(y, y.cc) !== ab) continue;
      out.push({ ferry: f, from: x, to: y, score: km([a.lat, a.lon], [x.lat, x.lon]) + km([y.lat, y.lon], [b.lat, b.lon]) + f.hours * 40 + (f.car == null ? 200 : 0) });
    }
  }
  return out.sort((p, q) => p.score - q.score).map(({ score: _s, ...p }) => p);
}
