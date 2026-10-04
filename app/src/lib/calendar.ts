/*
 * Kalender-Export (.ics): Tagesplan der Reise (Flüge, Check-in/-out, Event, Erlebnisse, eigene Einträge) und Fristen
 * (Verkaufsstart beim Früh buchen, Einreise vorab erledigen, kostenlos stornieren bis). Uhrzeiten der Reise sind
 * Ortszeiten ohne Zeitzone („floating“): der Kalender zeigt sie so, wie sie auf dem Ticket stehen. Verkaufsstarts sind
 * echte Zeitpunkte (UTC). Keine Buchungsdaten (Ausweis, Pass) im Export.
 */
import type { Trip } from "./model";
import type { Day } from "./itinerary";

export interface CalEvent {
  uid: string;
  summary: string;
  /** JJJJ-MM-TT (ganztägig) oder JJJJ-MM-TTTHH:MM (Ortszeit) */
  start?: string;
  /** Ende: ganztägig exklusiv (Tag nach dem letzten), sonst Ortszeit */
  end?: string;
  /** fester Zeitpunkt statt Ortszeit (z. B. Verkaufsstart) */
  at?: Date;
  location?: string;
  desc?: string;
  url?: string;
  /** Erinnerung so viele Minuten vorher */
  alarm?: number;
}

const addDay = (iso: string, n = 1) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Tagesplan: Reisezeitraum, Flüge mit Abflug und Landung, Einträge je Tag (mit Uhrzeit oder ganztägig) */
export function planEvents(trip: Trip, days: Day[]): CalEvent[] {
  const out: CalEvent[] = [];
  if (trip.from && trip.to) out.push({ uid: `trip-${trip.id}`, summary: trip.name || trip.place, start: trip.from, end: addDay(trip.to), location: [trip.place, trip.country].filter(Boolean).join(", ") });
  // Flüge direkt aus den Posten: Abflug bis Landung, je Strecke
  for (const it of trip.items) {
    if (it.cat !== "flights" || it.status === "dropped") continue;
    const o = it.options.find(x => x.id === it.chosen) || it.options[0];
    (o?.legs || []).forEach((l, i) => {
      if (!l.dep || l.dep.length < 16) return;
      const end = l.arr && l.arr.length >= 16 && l.arr > l.dep ? l.arr.slice(0, 16) : undefined;
      out.push({ uid: `flight-${it.id}-${i}`, summary: `✈ ${l.from} → ${l.to}`, start: l.dep.slice(0, 16), ...(end ? { end } : {}),
        location: l.from, desc: [it.name, it.booking?.ref || ""].filter(Boolean).join(" · "), alarm: 180 });
    });
  }
  for (const d of days) for (const e of d.entries) {
    if (e.kind === "flight") continue;
    const start = e.time ? `${d.date}T${e.time}` : d.date;
    out.push({ uid: `day-${trip.id}-${e.key}`, summary: e.text, start, ...(e.time ? {} : { end: addDay(d.date) }), ...(e.sub ? { desc: e.sub } : {}), location: d.place });
  }
  return out;
}

/** kostenlos stornieren bis (aus den Buchungsangaben der Posten) */
export function cancelEvents(trip: Trip, label: (name: string) => string): CalEvent[] {
  return trip.items.filter(i => i.status !== "dropped" && i.booking?.cancelUntil && /^\d{4}-\d{2}-\d{2}/.test(i.booking.cancelUntil))
    .map(i => ({ uid: `cancel-${i.id}`, summary: label(i.name), start: i.booking!.cancelUntil!.slice(0, 10), end: addDay(i.booking!.cancelUntil!), alarm: 24 * 60 }));
}

const esc = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\r?\n/g, "\\n");
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const local = (s: string) => (s.length > 10 ? `${s.slice(0, 10).replace(/-/g, "")}T${s.slice(11, 16).replace(":", "")}00` : s.replace(/-/g, ""));

/** Zeilen über 75 Zeichen falten (RFC 5545) */
const fold = (line: string) => {
  const out: string[] = [];
  for (let i = 0; i < line.length; i += i ? 74 : 75) out.push((i ? " " : "") + line.slice(i, i + (i ? 74 : 75)));
  return out.join("\r\n");
};

export function toIcs(events: CalEvent[], name: string, stamp = new Date()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Split&Fly//Reise//DE", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
  for (const e of events) {
    const allDay = !e.at && !!e.start && e.start.length === 10;
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@splitandfly.com`, `DTSTAMP:${utc(stamp)}`);
    if (e.at) lines.push(`DTSTART:${utc(e.at)}`, "DURATION:PT30M");
    else if (allDay) lines.push(`DTSTART;VALUE=DATE:${local(e.start!)}`, `DTEND;VALUE=DATE:${local(e.end || addDay(e.start!))}`);
    else if (e.start) lines.push(`DTSTART:${local(e.start)}`, e.end ? `DTEND:${local(e.end)}` : "DURATION:PT1H");
    lines.push(`SUMMARY:${esc(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.desc) lines.push(`DESCRIPTION:${esc(e.desc)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarm) lines.push("BEGIN:VALARM", `TRIGGER:-PT${e.alarm}M`, "ACTION:DISPLAY", `DESCRIPTION:${esc(e.summary)}`, "END:VALARM");
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n");
}

/** Download-Link (data-URL) und Dateiname */
export const icsHref = (ics: string) => `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
export const icsName = (name: string) => `${(name || "reise").normalize("NFD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "reise"}.ics`;
