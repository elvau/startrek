/* Ferien und Feiertage in der App (#163): Termine über den Such-Dienst (/holidays), Regionen aus public/regions.json; je Sitzung einmal */
import { FLIGHTS_URL } from "./flights/app";
import { countryName } from "./geo/locations";
import { holidayName, holidayPlace, holidaysIn, regionName, type HolidayData, type Regions } from "./holidays";
import { STATE_NAMES } from "./prefsView";

const days = new Map<string, Promise<HolidayData | null>>();
/** Termine eines Landes; ohne Such-Dienst, für Länder ohne Daten oder bei Fehlern null */
export function loadHolidays(cc: string): Promise<HolidayData | null> {
  if (!days.has(cc)) days.set(cc, FLIGHTS_URL && /^[A-Z]{2}$/.test(cc)
    ? fetch(`${FLIGHTS_URL}/holidays?cc=${cc}`).then(r => (r.ok ? r.json() : null)).then(d => (d && Array.isArray(d.school) ? { school: d.school, public: d.public || [] } : null)).catch(() => null)
    : Promise.resolve(null));
  return days.get(cc)!;
}

const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
let regions: Promise<Regions | null> | undefined;
/** geladene Regionen für Texte ohne eigenes Laden (Zusammenfassung der Vorlieben) */
export const loaded = $state<{ regions: Regions | null }>({ regions: null });
export function loadRegions(fetchFn: typeof fetch = fetch): Promise<Regions | null> {
  return (regions ??= fetchFn(base() + "regions.json").then(r => (r.ok ? r.json() : null)).catch(() => null).then(r => (loaded.regions = r)));
}

/** gespeicherte Ferien-Angabe als Text: „Nordrhein-Westfalen“, „Österreich · Wien“, „Belgien“ */
export function holidayText(v: string | undefined, rs: Regions | null = loaded.regions, lang: string): string {
  const p = holidayPlace(v);
  if (!p) return "";
  if (!p.region) return countryName(p.cc);
  // ohne geladene Regionen: deutsche Bundesländer mit Namen, sonst der Code
  const r = rs ? regionName(rs, p.region, lang) : p.cc === "DE" ? STATE_NAMES[p.region.slice(3)] || p.region : p.region;
  return p.cc === "DE" ? r : `${countryName(p.cc)} · ${r}`;
}

/** Schulferien laut Vorlieben in den nächsten zwölf Monaten (für den KI-Planer); ohne Daten leer */
export async function upcomingSchool(v: string | undefined, today: string, lang: string): Promise<{ from: string; to: string; name: string }[]> {
  const p = holidayPlace(v);
  if (!p) return [];
  const d = await loadHolidays(p.cc);
  const end = `${+today.slice(0, 4) + 1}${today.slice(4)}`;
  return d ? holidaysIn(d.school, today, end, p.region).filter(h => h.to >= today).slice(0, 10).map(h => ({ from: h.from, to: h.to, name: holidayName(h, lang) })) : [];
}
