/*
 * Nächte am Flughafen (wie im Artefakt): sehr früher Rückflug oder späte Landung weit weg von der Unterkunft.
 * Vorschläge sind Orte in der Nähe des Flughafens.
 */
import { tn } from "../i18n/index.svelte";
import type { Trip } from "../model";
import { addDays } from "../calc/travel";
import { dayShort, time } from "../format";
import { airportOf, ccOf, findCity, kmBetween, placesNear, stayNear, travelHours, type Airport, type GeoData, type Place } from "../geo/places";
import { arrivals } from "./presence";

export interface AirportNight {
  kind: "first" | "last";
  crit: boolean;
  text: string;
  /** die eine Nacht (Check-in, Check-out) */
  from: string;
  to: string;
  ids: string[];
  ap: Airport;
  places: Place[];
  /** vorgeschlagener Ort für die Suche */
  suggest?: string;
}

const mins = (iso: string) => +iso.slice(11, 13) * 60 + +iso.slice(14, 16);
const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")} h`;
const clock = (m: number) => { const x = Math.max(0, Math.round(m)); return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`; };

export function airportNights(trip: Trip, g: GeoData): AirportNight[] {
  const cc = ccOf(g, trip.country);
  const out: AirportNight[] = [];
  // schon eine Unterkunft genau für diese eine Nacht und diese Leute? Dann kein Vorschlag mehr
  const has = (from: string, to: string, ids: string[]) => trip.items.some(i => i.cat === "stay" && i.status !== "dropped" && i.from === from && i.to === to && (!i.participants || ids.every(id => i.participants!.includes(id))));
  for (const a of arrivals(trip)) {
    if (!a.p) continue;
    if (a.dep && a.depAp && a.dep.length >= 16) {
      const ap = airportOf(g, a.depAp);
      const dest = ap && trip.place ? findCity(g, trip.place, cc || ap.cc) : null;
      if (ap) {
        const h = dest ? travelHours(kmBetween(dest, ap)) : null;
        const leave = mins(a.dep) - 120 - (h ?? 0) * 60;
        const from = addDays(a.p.d, -1), to = a.p.d;
        let text = "", crit = false;
        if (dest && h! > 0.75 && leave < 7 * 60) { crit = true; text = tn("apn.lastFar", a.ids.length, { who: a.who, day: dayShort(a.dep), time: time(a.dep), ap: ap.code, dest: dest.name, h: hm(h!), leave: clock(leave) }); }
        else if (!dest && mins(a.dep) < 9 * 60) text = tn("apn.lastEarly", a.ids.length, { who: a.who, day: dayShort(a.dep), time: time(a.dep), ap: ap.code });
        if (text && !has(from, to, a.ids)) out.push({ kind: "last", crit, text, from, to, ids: a.ids, ap, places: placesNear(g, ap, 4), suggest: stayNear(g, ap)?.name });
      }
    }
    if (a.arr && a.arrAp && a.arr.length >= 16) {
      const ap = airportOf(g, a.arrAp);
      const dest = ap && trip.place ? findCity(g, trip.place, cc || ap.cc) : null;
      if (ap) {
        const h = dest ? travelHours(kmBetween(dest, ap)) : 0;
        const from = a.p.a, to = addDays(a.p.a, 1);
        const late = mins(a.arr) + 60 + h * 60 > 23 * 60 || mins(a.arr) >= 22 * 60;
        if (late && (!dest || h > 0.75) && !has(from, to, a.ids)) {
          const text = dest ? tn("apn.firstFar", a.ids.length, { who: a.who, day: dayShort(a.arr), time: time(a.arr), ap: ap.code, dest: dest.name, h: hm(h) }) : tn("apn.first", a.ids.length, { who: a.who, day: dayShort(a.arr), time: time(a.arr), ap: ap.code });
          out.push({ kind: "first", crit: false, text, from, to, ids: a.ids, ap, places: placesNear(g, ap, 4), suggest: stayNear(g, ap)?.name });
        }
      }
    }
  }
  return out.sort((x, y) => x.from.localeCompare(y.from));
}
