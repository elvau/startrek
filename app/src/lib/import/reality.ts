/*
 * Realitätscheck (#461): „Was kostet das Angebot wirklich?“ als Spanne pro Kopf. Gerechnet wird mit der normalen
 * Kostenrechnung an zwei Varianten der Reise: günstige Annahmen (Essen gemischt, kein Koffer dazu) und teure
 * (überwiegend auswärts essen, ein Koffer je Person und Strecke, wo das Angebot nichts dazu sagt). Antippen einer
 * Annahme legt sie fest und verengt die Spanne.
 *
 * Vergleichsrahmen: „Angebot realistisch“ = Angebotspreis plus Nebenkosten, die an seinen Bestandteilen hängen (Anreise
 * zum Flughafen und Gepäck am Flug, Kurtaxe und Aufpreis Verpflegung an der Unterkunft, Transfer und Essen nur bei
 * Pauschalreise bzw. Unterkunft). Alles andere zählt nur zur „ganzen Reise“, nie zum Angebot.
 */
import { t } from "../i18n/index.svelte";
import type { Board, Extra, Item, Option, Trip } from "../model";
import { activeOption, totals } from "../calc";
import { costParts } from "../calc/parts";
import { LINE_BAG, LOW_COST } from "../flights/addons";
import { rowIcon } from "./icons";

export type Assumption = "food" | "bag";
export type Pin = Partial<Record<Assumption, "lo" | "hi">>;
export interface RealityOpts { food: boolean; board?: Board; pin?: Pin }
export type RowPart = "offer" | "real" | "whole";
export interface RealRow { key: string; name: string; how?: string; lo: number; hi: number; part: RowPart; est?: boolean; assumption?: Assumption; icon: string }
export interface Range { lo: number; hi: number }
export interface Reality {
  persons: number;
  /** beworben pro Kopf (laut Angebot), sonst null */
  advertised: number | null;
  offer: Range;
  real: Range;
  /** nur wenn etwas über das Angebot hinaus dazukommt */
  whole: Range | null;
  rows: RealRow[];
  /** wählbare Verpflegung laut Angebot, enthaltene zuerst markiert */
  boards: { board: Board; extra: number; included: boolean }[];
  board?: Board;
  /** Bestandteile des Angebots */
  has: { flight: boolean; stay: boolean };
}

const persons = (trip: Trip) => Math.max(1, trip.travelers.filter(p => p.active !== false).length);
/** Posten des Angebots: aus dem Import, sonst alle eigenen (nicht automatischen) Posten */
const offerIds = (trip: Trip) => new Set(trip.offer?.items ?? trip.items.filter(i => !i.auto && i.status !== "dropped").map(i => i.id));

/** Koffer je Strecke: Richtwert des Billigfliegers, sonst allgemein */
export function bagFee(carrier = ""): number {
  const lc = LOW_COST.find(l => l.words.test(carrier) || l.codes.includes(carrier.trim().toUpperCase()));
  return lc?.bag ?? LINE_BAG;
}

/** Verpflegung der Unterkunft im Angebot und die wählbaren Stufen */
function stayOf(trip: Trip, ids: Set<string>): { it: Item; o: Option } | null {
  const it = trip.items.find(i => i.cat === "stay" && ids.has(i.id));
  const o = it ? activeOption(it, trip) : null;
  return it && o ? { it, o } : null;
}

/** Flüge des Angebots ohne Angabe zum Gepäck (dann Koffer als Annahme) */
function bagless(trip: Trip, ids: Set<string>): Item[] {
  return trip.items.filter(it => {
    if (it.cat !== "flights" || !ids.has(it.id)) return false;
    const fo = activeOption(it, trip);
    return !!fo && !fo.baggage && !fo.extras?.some(x => x.kind === "bag" && !x.off);
  });
}

/** eine Variante: Annahmen günstig (lo) oder teuer (hi); sync führt die automatischen Posten nach */
export function scenario(base: Trip, level: "lo" | "hi", o: RealityOpts, sync: (t: Trip) => void): Trip {
  const trip: Trip = JSON.parse(JSON.stringify(base));
  const ids = offerIds(trip);
  const lv = (a: Assumption) => o.pin?.[a] ?? level;
  trip.food = { ...(trip.food || {}), on: o.food, style: lv("food") === "lo" ? "mix" : "out" };
  delete trip.food.hh;
  const st = stayOf(trip, ids);
  if (st && o.board && st.o.stay?.boards?.some(b => b.board === o.board)) {
    const inc = st.o.stay.board, list = st.o.stay.boards;
    const extra = (b?: Board) => list.find(x => x.board === b)?.extra ?? 0;
    const add = Math.max(0, extra(o.board) - extra(inc));
    st.o.stay = { ...st.o.stay, board: o.board };
    if (add > 0) (st.o.extras ||= []).push({ id: "real:board", kind: "other", label: t("real.boardExtra", { b: t(`board.${o.board}`) }), amount: add, basis: "personNight", pay: "extra", source: trip.offer?.provider });
  }
  if (lv("bag") === "hi") for (const it of bagless(trip, ids)) {
    const fo = activeOption(it, trip)!;
    const legs = Math.max(1, fo.legs?.length || 1);
    (fo.extras ||= []).push({ id: "real:bag", kind: "bag", label: t("real.bag"), amount: bagFee(fo.legs?.[0]?.carrier || fo.label) * legs, basis: "person", pay: "extra", est: true } satisfies Extra);
  }
  sync(trip);
  return trip;
}

/** Zeilen einer Variante mit Zuordnung zu Angebot, realistisch oder ganzer Reise */
function rowsOf(trip: Trip) {
  const ids = offerIds(trip);
  const T = totals(trip);
  const P = costParts(trip, T);
  const byId = new Map(trip.items.map(i => [i.id, i]));
  const has = { flight: trip.items.some(i => i.cat === "flights" && ids.has(i.id)), stay: trip.items.some(i => i.cat === "stay" && ids.has(i.id)) };
  const out = new Map<string, { name: string; how?: string; v: number; part: RowPart; est?: boolean; assumption?: Assumption; icon: string }>();
  for (const r of [...P.rows.booked, ...P.rows.planned, ...P.rows.hidden]) {
    const it = r.itemId ? byId.get(r.itemId) : undefined;
    let part: RowPart = "whole";
    if (it && ids.has(it.id)) part = r.key === it.id ? "offer" : "real";
    else if (it?.auto === "food" && has.stay) part = "real";
    else if (it?.auto === "local" && it.hh === "transfer" && has.flight && has.stay) part = "real";
    const assumption: Assumption | undefined = it?.auto === "food" ? "food" : r.name === t("real.bag") ? "bag" : undefined;
    // automatische Posten bekommen je Variante neue IDs: über Art und Haushalt zuordnen, sonst fehlt eine Seite (zählt als 0)
    const key = it?.auto && r.key.startsWith(it.id) ? `auto:${it.auto}:${it.hh ?? ""}${r.key.slice(it.id.length)}` : r.key;
    out.set(key, { name: r.name, how: r.how, v: r.v, part, est: r.est, assumption, icon: assumption === "bag" ? "🧳" : rowIcon(r.key, it, part, r.xk) });
  }
  return { out, has };
}

const sum = (rows: RealRow[], parts: RowPart[]): Range => rows.filter(r => parts.includes(r.part)).reduce((a, r) => ({ lo: a.lo + r.lo, hi: a.hi + r.hi }), { lo: 0, hi: 0 });

/** Realitätscheck einer Reise (Entwurf oder gespeichert); Beträge pro Kopf */
export function reality(trip: Trip, o: RealityOpts, sync: (t: Trip) => void = () => {}): Reality {
  const n = persons(trip);
  const lo = rowsOf(scenario(trip, "lo", o, sync)), hi = rowsOf(scenario(trip, "hi", o, sync));
  const keys = [...new Set([...lo.out.keys(), ...hi.out.keys()])];
  const rows: RealRow[] = keys.map(k => {
    const a = lo.out.get(k), b = hi.out.get(k), r = (a || b)!;
    return { key: k, name: r.name, how: r.how, lo: (a?.v || 0) / n, hi: (b?.v || 0) / n, part: r.part, est: a?.est || b?.est, assumption: b?.assumption || a?.assumption, icon: r.icon };
  }).filter(r => r.assumption || Math.abs(r.lo) >= 0.005 || Math.abs(r.hi) >= 0.005);
  // Koffer auf „günstig“ festgelegt: Zeile bleibt (mit 0 €), damit sich die Annahme wieder lösen lässt
  if (o.pin?.bag && !rows.some(x => x.assumption === "bag") && bagless(trip, offerIds(trip)).length) rows.push({ key: "real:bag", name: t("real.bag"), lo: 0, hi: 0, part: "real", est: true, assumption: "bag", icon: "🧳" });
  const order: RowPart[] = ["offer", "real", "whole"];
  rows.sort((x, y) => order.indexOf(x.part) - order.indexOf(y.part));
  const ids = offerIds(trip);
  const st = stayOf(trip, ids);
  const inc = st?.o.stay?.board;
  const boards = (st?.o.stay?.boards || []).map(b => ({ board: b.board, extra: b.extra ?? 0, included: b.board === inc }));
  const p = trip.offer?.price;
  const advertised = p?.perPerson ?? (p?.total ? p.total / n : null);
  // ganze Reise nur, wenn das Angebot Flug und Unterkunft abdeckt oder Fehlendes ergänzt wurde (sonst fehlte z. B. die
  // Unterkunft, und die Zahl wäre kein Vergleich)
  const added = trip.items.some(i => !i.auto && i.status !== "dropped" && !ids.has(i.id));
  const whole = rows.some(r => r.part === "whole") && ((lo.has.flight && lo.has.stay) || added) ? sum(rows, order) : null;
  return { persons: n, advertised, offer: sum(rows, ["offer"]), real: sum(rows, ["offer", "real"]), whole, rows, boards, board: o.board ?? inc, has: lo.has };
}

/** auf 10 gerundet (unten ab, oben auf) */
export const round10 = (r: Range): Range => ({ lo: Math.floor(r.lo / 10) * 10, hi: Math.ceil(r.hi / 10) * 10 });
