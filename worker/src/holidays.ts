/*
 * Schulferien und Feiertage je Land für die App (#163): OpenHolidays API (ODbL), dieses und nächstes Jahr, alle Sprachen
 * der Quelle. Nur das Land kommt an, keine Angaben über die Person; der Index.ts-Weg speichert drei Tage zwischen.
 */
import { OH_API, holidayRange, parseOH, type HolidayData } from "../../app/src/lib/holidays";

export const HOLIDAY_CC = /^[A-Z]{2}$/;

export async function fetchHolidays(cc: string, today: string, fetchFn: typeof fetch = fetch): Promise<HolidayData> {
  const { from, to } = holidayRange(today);
  const get = async (kind: "SchoolHolidays" | "PublicHolidays") => {
    const r = await fetchFn(`${OH_API}/${kind}?countryIsoCode=${cc}&validFrom=${from}&validTo=${to}`, { headers: { accept: "application/json", "user-agent": "SplitAndFly/1.0 (+https://splitandfly.com)" } });
    // Land ohne Daten: leer statt Fehler
    if (r.status === 400 || r.status === 404) return [];
    if (!r.ok) throw new Error(`OpenHolidays ${r.status}`);
    return parseOH(await r.json());
  };
  const [school, pub] = await Promise.all([get("SchoolHolidays"), get("PublicHolidays")]);
  return { school, public: pub };
}
