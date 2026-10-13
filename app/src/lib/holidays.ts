/*
 * Schulferien und Feiertage je Land (#163, Entscheidung #335): Quelle OpenHolidays API (openholidaysapi.org, ODbL), etwa
 * 36 Länder. Der Such-Dienst holt die Termine (/holidays, einige Tage zwischengespeichert), Regionen stehen in
 * public/regions.json (scripts/regions.mjs). Genutzt für Vorlieben (Land und Region), KI-Planer, Feiertage im Reiseland
 * im Tagesplan und Feiertage im Wohnland während der Reise.
 * Gespeichert in Prefs.holidays: Region „DE-NW“ bzw. ganzes Land „BE-“; alte Angaben ohne Land („NW“) sind Bundesländer.
 */
export interface Holiday {
  from: string;
  to: string;
  /** Name je Sprache (de, en …) */
  n: Record<string, string>;
  nationwide: boolean;
  /** Regionen (Codes wie „DE-NW“), wenn nicht landesweit */
  regions?: string[];
}
export interface HolidayData { school: Holiday[]; public: Holiday[] }

export const OH_API = "https://openholidaysapi.org";
export const HOLIDAY_SOURCE = "OpenHolidays API (ODbL)";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Antwort von /SchoolHolidays bzw. /PublicHolidays → Holiday[]; unbekannte Felder fallen weg */
export function parseOH(data: unknown): Holiday[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((x: any): Holiday[] => {
    if (!x || !DAY.test(x.startDate) || !DAY.test(x.endDate)) return [];
    const n = Object.fromEntries((Array.isArray(x.name) ? x.name : []).filter((y: any) => y?.language && y?.text).map((y: any) => [String(y.language).toLowerCase(), String(y.text).slice(0, 80)]));
    const regions = (Array.isArray(x.subdivisions) ? x.subdivisions : []).map((s: any) => s?.code).filter((c: unknown) => typeof c === "string");
    return [{ from: x.startDate, to: x.endDate, n, nationwide: x.nationwide === true || !regions.length, ...(regions.length && x.nationwide !== true ? { regions } : {}) }];
  });
}

/** abgefragter Zeitraum: dieses und nächstes Jahr (die Quelle erlaubt höchstens drei Jahre) */
export const holidayRange = (today: string) => { const y = +today.slice(0, 4); return { from: `${y}-01-01`, to: `${y + 1}-12-31` }; };

/** gespeicherte Angabe → Land und Region; „NW“ (bisher Bundesland) = DE-NW, „BE-“ = ganz Belgien */
export function holidayPlace(v?: string): { cc: string; region?: string } | undefined {
  if (!v) return undefined;
  if (!v.includes("-")) return { cc: "DE", region: `DE-${v}` };
  const [cc, r] = v.split("-");
  return /^[A-Z]{2}$/.test(cc) ? { cc, ...(r ? { region: v } : {}) } : undefined;
}

/** gilt in der Region (landesweit oder dort; ohne Region alle) */
export const inRegion = (h: Holiday, region?: string) => h.nationwide || !region || !!h.regions?.includes(region);
/** überschneidet den Zeitraum */
export const overlaps = (h: Holiday, from: string, to: string) => h.from <= to && h.to >= from;
export const holidayName = (h: Holiday, lang: string) => h.n[lang] || h.n.en || Object.values(h.n)[0] || "";

/** Ferien bzw. Feiertage einer Region im Zeitraum, nach Datum */
export function holidaysIn(list: Holiday[], from: string, to: string, region?: string): Holiday[] {
  return list.filter(h => inRegion(h, region) && overlaps(h, from, to)).sort((a, b) => a.from.localeCompare(b.from));
}

/** Feiertage an einem Werktag (Mo–Fr) im Zeitraum: zuhause ein Urlaubstag weniger nötig */
export function workdayHolidays(list: Holiday[], from: string, to: string, region?: string): Holiday[] {
  return holidaysIn(list, from, to, region).filter(h => { const d = new Date(`${h.from}T12:00:00Z`).getUTCDay(); return d >= 1 && d <= 5; });
}

/** Regionen je Land (public/regions.json) */
export interface Regions { asOf?: string; countries: Record<string, { code: string; n: Record<string, string> }[]> }
export const regionName = (rs: Regions | null, code: string, lang: string) => {
  const r = rs?.countries[code.split("-")[0]]?.find(x => x.code === code);
  return r ? r.n[lang] || r.n.en || Object.values(r.n)[0] || code : code;
};
