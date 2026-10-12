/*
 * Vorlieben-Seite (#161): Karten, Kurzfassung „auf einen Blick“ und was eine Gruppe von den eigenen Vorlieben abweicht.
 * Ohne Svelte; Texte über t/tn, damit die Kurzfassung in allen Sprachen stimmt.
 */
import { t, tn, i18n, type Key } from "./i18n/index.svelte";
import { mergePrefs } from "./prefs";
import type { Prefs } from "./model";

export type CardId = "flights" | "stay" | "style" | "times" | "avoid" | "special" | "note";

/** Felder je Karte (alle heutigen Felder, kein neues Datenmodell) */
export const CARD_KEYS: Record<CardId, (keyof Prefs)[]> = {
  flights: ["plz", "airports", "maxStops", "bags", "seatsTogether", "maxHours", "access"],
  stay: ["stayType", "minStars", "board"],
  style: ["styles", "budget"],
  times: ["holidays", "months", "nightsMin", "nightsMax"],
  avoid: ["avoid"],
  special: ["pet", "stepFree", "diet", "car"],
  note: ["note"]
};

export const STATE_NAMES: Record<string, string> = { BW: "Baden-Württemberg", BY: "Bayern", BE: "Berlin", BB: "Brandenburg", HB: "Bremen", HH: "Hamburg", HE: "Hessen", MV: "Mecklenburg-Vorpommern", NI: "Niedersachsen", NW: "Nordrhein-Westfalen", RP: "Rheinland-Pfalz", SL: "Saarland", SN: "Sachsen", ST: "Sachsen-Anhalt", SH: "Schleswig-Holstein", TH: "Thüringen" };

const set = (v: unknown) => v != null && !(Array.isArray(v) && !v.length) && v !== "";

/** Felder, die eine Gruppe selbst festlegt (statt „wie meine“); gesperrte Länder zählen extra (kommen dazu) */
export function groupDiff(g: Prefs, card?: CardId): (keyof Prefs)[] {
  const keys = card ? CARD_KEYS[card] : (Object.values(CARD_KEYS).flat() as (keyof Prefs)[]);
  return keys.filter(k => k !== "avoid" && set(g[k]));
}

/** Zähler an Karte bzw. Reiter: abweichende Felder plus zusätzlich gesperrte Länder */
export function diffCount(g: Prefs, base: Prefs = {}, card?: CardId): number {
  const extra = !card || card === "avoid" ? (g.avoid || []).filter(k => !(base.avoid || []).includes(k)).length : 0;
  return groupDiff(g, card).length + extra;
}

/** Feld der Gruppe zurück auf „wie meine“ */
export function resetKey(g: Prefs, k: keyof Prefs): void { delete g[k]; }

const monthName = (m: number) => new Date(2027, m - 1, 1).toLocaleDateString(i18n.lang, { month: "short" });

/** Monate kurz: zusammenhängende als Spanne („Jun–Aug“), sonst einzeln */
export function monthsText(ms: number[]): string {
  const s = [...new Set(ms)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j - i >= 2 ? `${monthName(s[i])}–${monthName(s[j])}` : s.slice(i, j + 1).map(monthName).join(", "));
    i = j;
  }
  return out.join(", ");
}

export interface SumItem { text: string; key: keyof Prefs; card: CardId; group?: boolean }

/**
 * Kurzfassung „auf einen Blick“. Mit base (Gruppe): gezeigt wird, was für die Gruppe gilt (Gruppe über meine);
 * group = true, wenn der Wert von der Gruppe selbst kommt. cname: Ländername zum Code.
 */
export function summary(p: Prefs, base?: Prefs, cname: (k: string) => string = k => k): SumItem[] {
  const eff = base ? mergePrefs(base, p) : p;
  const own = (k: keyof Prefs) => !!base && set(p[k]);
  const out: SumItem[] = [];
  const add = (key: keyof Prefs, card: CardId, text: string | number | false | undefined) => { if (text) out.push({ text: String(text), key, card, ...(own(key) ? { group: true } : {}) }); };
  add("airports", "flights", eff.airports?.length && t("prefs.sum.from", { ap: eff.airports.join(", ") }));
  add("maxStops", "flights", eff.maxStops != null && (eff.maxStops === 0 ? t("prefs.sum.direct") : t("prefs.sum.stops", { s: tn("n.stops", eff.maxStops) })));
  add("bags", "flights", eff.bags != null && (eff.bags ? t("prefs.bagsYes") : t("prefs.bagsNo")));
  add("access", "flights", eff.access && t("prefs.sum.access", { m: t(`prefs.${eff.access}` as Key) }));
  add("stayType", "stay", eff.stayType && eff.stayType !== "all" && t(eff.stayType === "whole" ? "st.whole" : "st.hotel"));
  add("minStars", "stay", eff.minStars && "★".repeat(eff.minStars));
  add("board", "stay", eff.board && t(`board.${eff.board}` as Key));
  for (const s of eff.styles || []) out.push({ text: t(`prefs.s.${s}` as Key), key: "styles", card: "style", ...(own("styles") ? { group: true } : {}) });
  add("budget", "style", eff.budget && t("prefs.sum.budget", { b: t(`prefs.b.${eff.budget}` as Key) }));
  add("holidays", "times", eff.holidays && t("prefs.sum.holidays", { s: STATE_NAMES[eff.holidays] || eff.holidays }));
  add("months", "times", eff.months?.length && monthsText(eff.months));
  const nmin = eff.nightsMin, nmax = eff.nightsMax;
  add(own("nightsMin") ? "nightsMin" : "nightsMax", "times", (nmin || nmax) && (nmin && nmax ? t("prefs.sum.nights", { a: nmin, b: nmax }) : tn("n.nights", (nmin || nmax)!)));
  add("pet", "special", eff.pet && t("setup.pet"));
  add("stepFree", "special", eff.stepFree && t("setup.stepFree"));
  add("diet", "special", eff.diet && t(`setup.diet.${eff.diet}` as Key));
  if (eff.avoid?.length) out.push({ text: t("prefs.sum.avoid", { c: eff.avoid.map(cname).join(", ") }), key: "avoid", card: "avoid", ...(base && (p.avoid || []).some(k => !(base.avoid || []).includes(k)) ? { group: true } : {}) });
  return out;
}
