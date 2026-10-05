/*
 * Wichtiges zur Reise: was man vor der Reise unbedingt bedenken muss, als Punkte mit Zähler (Epic „Wichtiges zur Reise“).
 * Quellen: Warnstufen des Auswärtigen Amts (advice.ts), Einreise je Pass (visa.ts), Grenzregeln und Mindestgültigkeit
 * des Reisepasses (borders.ts) und Hinweise (hints.ts). Ablaufdaten der Pässe kommen nur im Browser aus dem Konto dazu
 * (travelDocs) und landen nie in der Reise: Schlüssel und Signatur enthalten kein Datum.
 * „Erledigt“ bzw. „gelesen“ steht in der Reise (trip.done), je Person: Einreise für alle, die etwas tun müssen,
 * Warnungen und Hinweise für alle Reisenden. Ändert sich der Inhalt eines Punkts (Signatur), gilt er wieder als offen;
 * kommen Personen dazu, ebenso.
 */
import type { Trip } from "./model";
import { isActive } from "./model";
import { adviceLevel, type Advice, type AdviceMap } from "./advice";
import { entryFor, needsAction, type EntryKind, type VisaData } from "./visa";
import type { Hint } from "./hints";
import { FREE_MOVEMENT, MIN_VALID, SCHENGEN, validUntil, type MinValid } from "./borders";
import { CITIES, saleFor, type BookAhead, type Sale } from "./bookahead";
import { activeOption, participantsOf, rateOf } from "./calc";

export type PointKind = "aa" | "warn" | "entry" | "border" | "pass" | "book" | "place" | "deposit";

export interface PointPerson { id: string; name: string; nat: string; kind?: EntryKind; days?: number }

export interface Point {
  /** stabil je Reise: aa:US, entry:US, hint:machu */
  key: string;
  kind: PointKind;
  /** kleiner = wichtiger */
  prio: number;
  /** Inhalt; ändert er sich, ist der Punkt wieder offen */
  sig: string;
  cc?: string;
  /** Warnstufe des Auswärtigen Amts */
  level?: "warning" | "partial" | "situation";
  advice?: Advice;
  /** passender Hinweis aus hints.ts (Text, Links, Gebühr) */
  hint?: Hint;
  /** je Person: wer etwas tun muss (Einreise) bzw. wer lesen soll (alle Reisenden) */
  persons?: PointPerson[];
  /** Mindestgültigkeit des Reisepasses im Reiseland */
  valid?: MinValid;
  /** Reisepass zu kurz gültig: Ablauf und nötiges Datum (nur zur Anzeige, nie gespeichert) */
  pass?: { expires: string; needed: string };
  /** Früh buchen: Reiseziel und Orte mit Verkaufsstart, früheste zuerst */
  book?: { city: string; label: string; entries: { e: BookAhead; sale: Sale }[]; soon: boolean };
  /** Kaution eines Postens (nur geblockt): Betrag in der Währung des Angebots, wie zu hinterlegen */
  deposit?: { amount: number; currency: string; how?: string; name: string; item: string };
}

/** erledigt je Punkt: Signatur beim Abhaken, bei Punkten für Personen die erledigten Personen */
export type DoneMap = Record<string, { sig: string; ids?: string[] }>;

const PRIO = { warning: 0, warn: 0, pass: 0, partial: 1, entry: 2, border: 2, deposit: 2, book: 3, situation: 3, place: 4 } as const;
/** Kautionen ab diesem Betrag (oder nur mit Kreditkarte) sind ein wichtiger Punkt */
export const DEPOSIT_MIN = 300;

export interface PointInput {
  trip: Trip;
  /** Reiseländer (ISO-2) */
  countries: string[];
  /** Hinweise für die Reise (hintsFor) */
  hints: Hint[];
  visa: VisaData | null;
  advice: AdviceMap;
  /** Ablauf der Reisepässe je reisender Person (JJJJ-MM-TT), nur wenn im Konto hinterlegt und geladen */
  passports?: Record<string, string>;
  /** Früh buchen: passende Orte (bookAheadFor) */
  book?: BookAhead[];
  /** jetzt (für Tests) */
  now?: number;
}

/** alle wichtigen Punkte der Reise, wichtigste zuerst */
export function importantPoints({ trip, countries, hints, visa, advice, passports = {}, book = [], now = Date.now() }: PointInput): Point[] {
  const act = trip.travelers.filter(isActive);
  const all: PointPerson[] | undefined = act.length ? act.map(p => ({ id: p.id, name: p.name, nat: p.nat || "DE" })) : undefined;
  const out: Point[] = [];
  for (const cc of countries) {
    const a = advice[cc], level = adviceLevel(a);
    if (a && level) out.push({ key: `aa:${cc}`, kind: "aa", prio: PRIO[level], sig: `${level}|${a.modified || ""}`, cc, level, advice: a, ...(all ? { persons: all } : {}) });
    // Einreise: wer vorab etwas tun muss (Passport Index) bzw. für wen der Hinweis gilt (deutsche Staatsangehörige)
    const hint = hints.find(h => h.kind === "entry" && h.cc?.includes(cc));
    const persons: PointPerson[] = [];
    for (const p of act) {
      const nat = p.nat || "DE", e = visa ? entryFor(visa, nat, cc) : { kind: "unknown" as EntryKind };
      if (e.kind === "home") continue;
      if (needsAction(e) || (hint && nat === "DE")) persons.push({ id: p.id, name: p.name, nat, kind: e.kind, ...(e.days != null ? { days: e.days } : {}) });
    }
    const valid = MIN_VALID[cc];
    if (persons.length) out.push({ key: `entry:${cc}`, kind: "entry", prio: PRIO.entry, sig: [...new Set(persons.map(p => `${p.nat}:${p.kind}`))].sort().join(","), cc, ...(hint ? { hint } : {}), ...(valid ? { valid } : {}), persons });
  }
  // Reisepass läuft zu früh ab: je Person das strengste Reiseland (Regeln des Ziellands gelten für die meisten Pässe);
  // innerhalb von EU/EWR/Schweiz reicht für deren Bürger der Ausweis
  if (trip.from && trip.to) for (const p of act) {
    const exp = passports[p.id], nat = p.nat || "DE";
    if (!exp) continue;
    let worst: { cc: string; needed: string } | null = null;
    for (const cc of countries) {
      if (cc === nat || (FREE_MOVEMENT.has(cc) && FREE_MOVEMENT.has(nat))) continue;
      const needed = validUntil(MIN_VALID[cc], trip.from, trip.to);
      if (!worst || needed > worst.needed) worst = { cc, needed };
    }
    if (worst && exp < worst.needed) out.push({ key: `pass:${p.id}`, kind: "pass", prio: PRIO.pass, sig: worst.cc, cc: worst.cc, pass: { expires: exp, needed: worst.needed }, persons: [{ id: p.id, name: p.name, nat }] });
  }
  // Schengen-Raum: EES bei der Einreise (Fingerabdrücke, Foto) bzw. ETIAS für Pässe von außerhalb der EU
  const schengen = countries.find(c => SCHENGEN.has(c));
  const outsiders = schengen ? act.filter(p => !FREE_MOVEMENT.has(p.nat || "DE")) : [];
  if (outsiders.length) out.push({ key: "border:schengen", kind: "border", prio: PRIO.border, sig: "ees", cc: schengen, persons: outsiders.map(p => ({ id: p.id, name: p.name, nat: p.nat || "DE" })) });
  // Früh buchen: je Reiseziel ein Punkt; gebuchte bzw. bezahlte Orte (als Posten übernommen) fallen weg
  const booked = new Set(trip.items.filter(i => i.hint && (i.status === "booked" || i.status === "paid")).map(i => i.hint!));
  const visit = trip.from && trip.from >= new Date(now).toISOString().slice(0, 10) ? trip.from : undefined;
  const byCity = new Map<string, { e: BookAhead; sale: Sale }[]>();
  for (const e of book) {
    if (booked.has(e.id)) continue;
    const sale = visit ? saleFor(e, visit) : {};
    byCity.set(e.city, [...(byCity.get(e.city) || []), { e, sale }]);
  }
  const covered = new Set(book.map(e => e.hint).filter(Boolean));
  for (const [city, list] of byCity) {
    const key = (x: { sale: Sale }) => x.sale.date || x.sale.by || "9999";
    list.sort((a, b) => key(a).localeCompare(key(b)));
    // bald: Verkaufsstart in den nächsten 14 Tagen bzw. schon offen, oder Empfehlung „bis“ ist erreicht
    const soon = !!visit && list.some(x => (x.sale.at && x.sale.at.getTime() <= now + 14 * 86400000) || (x.sale.by && Date.parse(`${x.sale.by}T00:00:00Z`) <= now + 14 * 86400000));
    out.push({ key: `book:${city}`, kind: "book", prio: PRIO.book, sig: list.map(x => `${x.e.id}@${key(x)}`).join(","), cc: list[0].e.cc, book: { city, label: CITIES[city]?.label || city, entries: list, soon }, ...(all ? { persons: all } : {}) });
  }
  // Kaution: hoher Betrag oder nur mit Kreditkarte (keine Debitkarte) – vorher daran denken
  for (const it of trip.items) {
    if (it.status === "dropped") continue;
    const o = activeOption(it, trip), d = o?.deposit;
    if (!o || !d || !(d.amount > 0)) continue;
    const eurAmt = d.amount / rateOf(o.price.currency || "EUR", trip.settings);
    if (eurAmt < DEPOSIT_MIN && d.how !== "credit") continue;
    const ps = participantsOf(it, trip).filter(isActive).map(p => ({ id: p.id, name: p.name, nat: p.nat || "DE" }));
    out.push({ key: `deposit:${it.id}`, kind: "deposit", prio: d.how === "credit" ? 1 : PRIO.deposit, sig: `${d.amount}|${d.how || ""}`,
      deposit: { amount: d.amount, currency: o.price.currency || "EUR", ...(d.how ? { how: d.how } : {}), name: it.name, item: it.id }, ...(ps.length ? { persons: ps } : {}) });
  }
  for (const h of hints) {
    if (h.kind === "entry" || covered.has(h.id)) continue;
    out.push({ key: `hint:${h.id}`, kind: h.kind === "warn" ? "warn" : "place", prio: PRIO[h.kind === "warn" ? "warn" : "place"], sig: h.id, ...(h.cc?.[0] ? { cc: h.cc[0] } : {}), hint: h, ...(all ? { persons: all } : {}) });
  }
  return out.sort((a, b) => a.prio - b.prio);
}

/** erledigte Personen eines Punkts (nur, solange die Signatur gilt) */
export function doneIds(p: Point, done: DoneMap = {}): string[] {
  const d = done[p.key];
  if (!d || d.sig !== p.sig) return [];
  return p.persons ? (d.ids || []).filter(id => p.persons!.some(x => x.id === id)) : [];
}

/** offen: nie abgehakt, Inhalt geändert oder noch nicht alle Personen erledigt */
export function isOpen(p: Point, done: DoneMap = {}): boolean {
  const d = done[p.key];
  if (!d || d.sig !== p.sig) return true;
  return !!p.persons && p.persons.some(x => !(d.ids || []).includes(x.id));
}

/** aufgeklappt zeigen (Reisewarnung, Teilreisewarnung, Einreise), sonst einzeilig bis zum Antippen */
export const isUrgent = (p: Point) => p.deposit?.how === "credit" || p.kind === "entry" || p.kind === "warn" || p.kind === "pass" || p.kind === "border" || !!p.book?.soon || p.level === "warning" || p.level === "partial";

export const openCount = (ps: Point[], done?: DoneMap) => ps.filter(p => isOpen(p, done)).length;

/** abhaken: ganzer Punkt bzw. eine Person; done wird verändert */
export function markDone(done: DoneMap, p: Point, personId?: string) {
  if (!p.persons) { done[p.key] = { sig: p.sig }; return; }
  const ids = new Set(doneIds(p, done));
  for (const id of personId ? [personId] : p.persons.map(x => x.id)) ids.add(id);
  done[p.key] = { sig: p.sig, ids: [...ids] };
}

/** wieder öffnen: ganzer Punkt bzw. eine Person */
export function reopen(done: DoneMap, p: Point, personId?: string) {
  if (!personId || !p.persons) { delete done[p.key]; return; }
  const ids = doneIds(p, done).filter(id => id !== personId);
  if (ids.length) done[p.key] = { sig: p.sig, ids }; else delete done[p.key];
}
