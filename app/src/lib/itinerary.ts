/*
 * Tagesplan: Tag für Tag vom ersten bis zum letzten Reisetag. Automatisch aus der Reise: Flüge (jeder Abflug), Check-in
 * und Check-out der Unterkünfte, das Event der Reise und Posten mit Tag (Erlebnisse, Transfer …). Dazu eigene Einträge
 * je Tag (Trip.days) und eine Überschrift („Ruhetag“). Je Tag der Ort, an dem man übernachtet (Station der Reise).
 */
import { t } from "./i18n/index.svelte";
import { activeOption } from "./calc";
import { addDays, okDate, stopsOf } from "./calc/travel";
import { hhKey, isActive, type Item, type NoteKind, type Trip } from "./model";

export type EntryKind = NoteKind | "flight" | "stay" | "event" | "item";
export interface DayEntry {
  key: string;
  kind: EntryKind;
  text: string;
  time?: string;
  /** kleiner Zusatz: Familien, Ort, Uhrzeit der Landung */
  sub?: string;
  itemId?: string;
  noteId?: string;
  /** nur einige Familien (Flug einer Familie) */
  who?: string;
  /** Sortierung innerhalb des Tages */
  order: string;
}
export interface Day {
  date: string;
  /** Tag 1, 2, … */
  n: number;
  /** Ort der Nacht (Station), sonst Ziel der Reise */
  place: string;
  /** neuer Ort gegenüber dem Vortag (Reisetag) */
  moved: boolean;
  title?: string;
  /** Vorschlag, wenn keine eigene Überschrift: Anreise, Rückreise, Weiter nach … */
  auto?: string;
  entries: DayEntry[];
}

export const KIND_ICON: Record<EntryKind, string> = { flight: "✈️", stay: "🛏", event: "🎟", item: "📌", see: "🏛", food: "🍽", fun: "🎢", rest: "😌", move: "🚆", note: "📝" };
export const NOTE_KINDS: NoteKind[] = ["see", "food", "fun", "rest", "move", "note"];

const hm = (iso?: string) => (iso && iso.length >= 16 ? iso.slice(11, 16) : undefined);

/** Reisetage: Zeitraum der Reise, sonst vom ersten bis zum letzten Flug */
export function dayRange(trip: Trip): string[] {
  let a = okDate(trip.from) ? trip.from! : "", b = okDate(trip.to) ? trip.to! : "";
  if (!a || !b) {
    const legs = trip.items.filter(i => i.cat === "flights" && i.status !== "dropped").flatMap(i => activeOption(i, trip)?.legs || []);
    const ds = legs.flatMap(l => [l.dep, l.arr]).filter(okDate).map(d => d.slice(0, 10)).sort();
    a ||= ds[0] || ""; b ||= ds.at(-1) || a;
  }
  if (!a) return [];
  if (b < a) b = a;
  const out: string[] = [];
  for (let d = a; d <= b && out.length < 120; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Familien eines Postens, wenn nicht alle dabei sind */
function whoOf(trip: Trip, it: Item): string | undefined {
  if (!it.participants?.length) return undefined;
  const act = trip.travelers.filter(isActive);
  if (act.every(x => it.participants!.includes(x.id))) return undefined;
  return [...new Set(act.filter(x => it.participants!.includes(x.id)).map(hhKey))].join(", ");
}

/** Ort einer Unterkunft: Suche (Ort), sonst Name des Postens ohne „Unterkunft in“ */
export function stayPlace(trip: Trip, it: Item): string {
  const o = activeOption(it, trip);
  return o?.query?.place || trip.place || it.name;
}

export function itinerary(trip: Trip): Day[] {
  const dates = dayRange(trip);
  if (!dates.length) return [];
  const byDay = new Map<string, DayEntry[]>(dates.map(d => [d, []]));
  const add = (d: string | undefined, e: DayEntry) => { if (d && byDay.has(d.slice(0, 10))) byDay.get(d.slice(0, 10))!.push(e); };
  const live = trip.items.filter(i => i.status !== "dropped");
  const flightSeen = new Map<string, DayEntry & { ids?: string[] }>();
  const act = trip.travelers.filter(isActive);
  // Kopie: die Liste wird beim Zusammenfassen erweitert (nie die Teilnehmer des Postens selbst)
  const ids = (it: Item) => (it.participants?.length ? [...it.participants] : act.map(x => x.id));

  for (const it of live) {
    const o = activeOption(it, trip);
    if (it.cat === "flights" && !it.follow) {
      for (const [i, l] of (o?.legs || []).entries()) {
        // derselbe Flug für mehrere Familien (je Familie ein Posten): eine Zeile, Familien zusammen
        const fk = `${l.from}|${l.to}|${(l.dep || "").slice(0, 16)}`;
        const prev = flightSeen.get(fk);
        if (prev) { (prev.ids ||= []).push(...ids(it)); continue; }
        const e: DayEntry & { ids?: string[] } = { key: `${it.id}:${i}`, kind: "flight", itemId: it.id, text: `${l.from} → ${l.to}`, time: hm(l.dep),
          sub: [hm(l.arr) ? t("day.lands", { t: hm(l.arr)! }) : "", l.carrier || ""].filter(Boolean).join(" · "), ids: ids(it), order: hm(l.dep) || "12:00" };
        flightSeen.set(fk, e);
        add(l.dep, e);
      }
    } else if (it.cat === "stay" && it.from && it.to) {
      const name = o?.label || it.name;
      add(it.from, { key: `${it.id}:in`, kind: "stay", itemId: it.id, text: t("day.checkin", { name }), who: whoOf(trip, it), order: "23:00" });
      add(it.to, { key: `${it.id}:out`, kind: "stay", itemId: it.id, text: t("day.checkout", { name }), who: whoOf(trip, it), order: "00:00" });
    } else if (it.day && it.cat !== "flights" && it.cat !== "stay") {
      add(it.day, { key: it.id, kind: "item", itemId: it.id, text: it.name || o?.label || "", time: hm(it.day), sub: o?.detail, who: whoOf(trip, it), order: hm(it.day) || "22:00" });
    }
  }
  // Familien je Flug: alle dabei → keine Angabe, sonst die Familien (bzw. „Anna, Ben +3“)
  for (const e of flightSeen.values()) {
    const inn = act.filter(x => e.ids!.includes(x.id));
    if (inn.length < act.length) { const hs = [...new Set(inn.map(hhKey))]; e.who = hs.length > 3 ? t("grp.more", { names: hs.slice(0, 2).join(", "), n: hs.length - 2 }) : hs.join(", "); }
    delete e.ids;
  }
  if (trip.event?.start) add(trip.event.start, { key: "event", kind: "event", text: trip.event.name, time: hm(trip.event.start), sub: trip.event.venue, order: hm(trip.event.start) || "20:00" });
  for (const [d, p] of Object.entries(trip.days || {})) {
    for (const n of p.notes || []) add(d, { key: n.id, kind: n.kind || "note", noteId: n.id, text: n.text, time: n.time, sub: n.kind === "move" && n.to ? `→ ${n.to}` : undefined, order: n.time || "22:30" });
  }

  // Ort je Nacht: Unterkunft, die diese Nacht abdeckt (erste gefundene), sonst Ziel der Reise
  const stays = live.filter(i => i.cat === "stay" && i.from && i.to);
  // ohne Unterkunft: Station aus den Flügen (Rundreise Bangkok → Chiang Mai → Phuket)
  const stops = trip.travelers.filter(isActive).flatMap(x => stopsOf(x, trip, it => activeOption(it, trip)));
  const placeOf = (d: string) => {
    const s = stays.find(i => i.from! <= d && d < i.to!);
    if (s) return stayPlace(trip, s);
    const st = stops.find(x => x.from <= d && d < x.to);
    return st ? st.city || st.ap : "";
  };
  const home = trip.place || "";
  let prev = "";
  return dates.map((d, i) => {
    const last = i === dates.length - 1;
    const night = last ? "" : placeOf(d);
    const place = night || (last ? prev : "") || home;
    const moved = i > 0 && !!night && !!prev && night !== prev;
    const auto = i === 0 ? t("day.arrive") : last ? t("day.leave") : moved ? t("day.onTo", { place: night }) : undefined;
    if (night) prev = night;
    const entries = byDay.get(d)!.sort((a, b) => a.order.localeCompare(b.order));
    return { date: d, n: i + 1, place, moved, title: trip.days?.[d]?.title, ...(auto ? { auto } : {}), entries };
  });
}

/** Posten ohne Tag, die man einem Tag zuordnen kann (Erlebnisse und Transport vor Ort) */
export const unplanned = (trip: Trip) => trip.items.filter(i => (i.cat === "attractions" || i.cat === "transport") && i.status !== "dropped" && !i.day);

/** Stationen in Reihenfolge (für Karte und Animation): Orte der Nächte, ohne Wiederholung direkt hintereinander */
export function stations(days: Day[]): { place: string; from: string; nights: number }[] {
  const out: { place: string; from: string; nights: number }[] = [];
  for (const d of days.slice(0, -1)) {
    const cur = out.at(-1);
    if (cur && cur.place === d.place) cur.nights++;
    else if (d.place) out.push({ place: d.place, from: d.date, nights: 1 });
  }
  return out;
}
