/*
 * Mit Haustier reisen (#322): Das Tier ist kein Reisender, es hängt an einer Familie (households[…].pets).
 * Reist es mit: Haustier-Filter in den Unterkunfts-Links und Hinweise (Einreise, Flug) unter „Wichtiges“.
 * Bleibt es zuhause: Posten „Tierbetreuung“ nur für diese Familie (Freundeskreis oder Tierpension/Tiersitter) und
 * ein Text zum Teilen, um im Freundeskreis nach Betreuung zu fragen (ohne Wohnort, ohne Namen, nichts gespeichert).
 */
import { t, tn, type Key } from "./i18n/index.svelte";
import { hhKey, isActive, uid, type HomeCare, type HomeTask, type Item, type PetCare, type PetKind, type Pets, type Trip } from "./model";
import type { Hint } from "./hints";
import { SCHENGEN } from "./borders";
import { dateDE } from "./format";

export const PET_EMOJI: Record<PetKind, string> = { dog: "🐕", cat: "🐈", rabbit: "🐇", rodent: "🐹", bird: "🐦", fish: "🐠", reptile: "🐍", spider: "🕷", other: "🐾" };

/** übliche Betreuung, wenn das Tier zuhause bleibt: Fische, Reptilien, Spinnen füttert man vor Ort */
const VISIT: PetKind[] = ["fish", "reptile", "spider", "other"];
export const defaultCare = (k: PetKind): PetCare => (VISIT.includes(k) ? "visit" : "bring");
export const careOf = (p: Pets, k: PetKind): PetCare => p.care?.[k] ?? defaultCare(k);

/** Richtwerte Tierpension je Tag bzw. Tiersitter je Besuch (Stand in docs/NEBENKOSTEN.md) */
export const PENSION_PER_DAY: Record<PetKind, number> = { dog: 25, cat: 15, rabbit: 10, rodent: 8, bird: 10, fish: 10, reptile: 15, spider: 10, other: 10 };
export const SITTER_PER_VISIT = 15;

/** Familien mit Haustier (nur Familien mit anwesenden Reisenden) */
export function petHouseholds(trip: Trip): { hh: string; pets: Pets }[] {
  const names = new Set(trip.travelers.filter(isActive).map(hhKey));
  return Object.entries(trip.households || {}).filter(([k, h]) => names.has(k) && h.pets?.kinds.length).map(([hh, h]) => ({ hh, pets: h.pets! }));
}

/** reist ein Tier mit? Optional nur für diese Reisenden (z. B. Gäste einer Unterkunftssuche) */
export function petsAlong(trip: Trip, ids?: string[]): boolean {
  const with_ = new Set(petHouseholds(trip).filter(x => !x.pets.home).map(x => x.hh));
  return trip.travelers.some(p => isActive(p) && (!ids || ids.includes(p.id)) && with_.has(hhKey(p)));
}

/** mitreisende Tierarten der ganzen Reise */
export const kindsAlong = (trip: Trip): PetKind[] => [...new Set(petHouseholds(trip).filter(x => !x.pets.home).flatMap(x => x.pets.kinds))];

/** EU-Heimtierausweis gilt (EU, EWR, Schweiz und Kleinstaaten mit EU-Regeln) */
const PET_PASSPORT = new Set([...SCHENGEN, "IE", "CY", "AD", "MC", "SM", "VA"]);
/** zusätzlich Bandwurmbehandlung für Hunde vor der Einreise */
const TAPEWORM = ["GB", "IE", "MT", "FI", "NO"];
const EU_LINK = { label: "Your Europe", url: "https://europa.eu/youreurope/citizens/travel/carry/animal-plant/index_de.htm" };
const GB_LINK = { label: "GOV.UK", url: "https://www.gov.uk/bring-pet-to-great-britain" };

/** Hinweise unter „Wichtiges“, wenn ein Tier mitreist: Einreise und, bei Flügen, Flug mit Tier */
export function petHints(trip: Trip, countries: string[]): Hint[] {
  const kinds = kindsAlong(trip);
  if (!kinds.length) return [];
  const out: Hint[] = [];
  const abroad = countries.filter(c => c !== "DE");
  if (abroad.length) {
    const nonEu = abroad.filter(c => !PET_PASSPORT.has(c) && c !== "GB");
    const extra = kinds.includes("dog") ? abroad.filter(c => TAPEWORM.includes(c)) : [];
    out.push({ id: nonEu.length ? "petEntryFar" : "petEntry", kind: "pet", cc: abroad, links: abroad.includes("GB") ? [EU_LINK, GB_LINK] : [EU_LINK] });
    if (extra.length) out.push({ id: "petTapeworm", kind: "pet", cc: extra, links: extra.includes("GB") ? [GB_LINK, EU_LINK] : [EU_LINK] });
  }
  if (trip.items.some(i => i.cat === "flights" && i.status !== "dropped")) out.push({ id: "petFlight", kind: "pet", links: [] });
  return out;
}

/** Tierarten als Text („Hund und Katze“); acc: für die Anfrage („unseren Hund und unsere Katze“) */
export function kindsText(kinds: PetKind[], acc = false): string {
  const names = kinds.map(k => t(`pet.${acc ? "a" : "k"}.${k}` as Key));
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} ${t("and")} ${names.at(-1)}` : names[0] || t("pet.k.other");
}

/** Aufgaben fürs Zuhause als Tätigkeit in der Anfrage („die Pflanzen gießen“) */
const taskText = (c: HomeCare, k: HomeTask) => (k === "other" ? (c.other || "").trim() : t(`home.do.${k}` as Key));

/** Liste mit „und“ am Ende */
const andList = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} ${t("and")} ${xs.at(-1)}` : xs[0] || "");

/** Dankeschön als Text: „50 €“, „eine Kiste Bier“ oder beides */
export function thanksText(c?: HomeCare): string {
  const th = c?.thanks;
  if (!th) return "";
  return [th.eur ? `${Math.round(th.eur)} €` : "", (th.text || "").trim()].filter(Boolean).join(t("home.thanksAnd"));
}

/**
 * Anfrage zum Teilen (#322, #323): Tiere vorbeibringen bzw. vorbeikommen und Aufgaben fürs Zuhause in einem Text,
 * mit Zeitraum, wie oft und optionalem Dankeschön; ohne Wohnort, Schlüssel und Namen.
 */
export function askText(p: Pets | undefined, from?: string, to?: string, c?: HomeCare): string {
  const pets = p?.home && p.kinds.length ? p : undefined;
  const bring = pets ? pets.kinds.filter(k => careOf(pets, k) === "bring") : [];
  const feed = pets ? pets.kinds.filter(k => careOf(pets, k) === "visit") : [];
  const when = from && to ? t("pet.ask.when", { a: dateDE(from), b: dateDE(to) }) : t("pet.ask.soon");
  const acts = [...(feed.length ? [t("pet.do.feed", { pets: kindsText(feed, true) })] : []), ...(c?.tasks || []).map(k => taskText(c!, k)).filter(Boolean)];
  const often = c?.tasks.length ? c.often : pets?.often;
  const parts: string[] = [];
  if (bring.length) parts.push(t("pet.ask.bring", { when, pets: kindsText(bring, true) }));
  if (acts.length) parts.push(t(bring.length ? "pet.ask.visitToo" : "pet.ask.visit", { when, acts: andList(acts), often: often ? ` (${t(`pet.often.${often}` as Key)})` : "" }));
  const thanks = thanksText(c);
  if (thanks) parts.push(t("home.thanksAsk", { x: thanks }));
  const emoji = pets ? PET_EMOJI[pets.kinds[0]] || "🐾" : c?.tasks.includes("plants") || c?.tasks.includes("garden") ? "🪴" : "🏠";
  return `${parts.join(" ")} ${emoji}`;
}

/** Tage der Betreuung: Reisezeitraum (erste bis letzte Nacht plus Abreisetag) */
export function careDays(trip: Trip): number {
  if (!trip.from || !trip.to) return 0;
  return Math.max(1, Math.round((Date.parse(trip.to) - Date.parse(trip.from)) / 86400000) + 1);
}
const visits = (days: number, often?: Pets["often"]) => (often === "few" ? Math.ceil(days / 2.5) : often === "weekly" ? Math.ceil(days / 7) : days);

/** Richtwert Tierpension bzw. Tiersitter für die ganze Zeit */
export function careEstimate(p: Pets, days: number): number {
  const bring = p.kinds.filter(k => careOf(p, k) === "bring").reduce((s, k) => s + PENSION_PER_DAY[k] * days, 0);
  const visit = p.kinds.some(k => careOf(p, k) === "visit") ? SITTER_PER_VISIT * visits(days, p.often) : 0;
  return Math.round(bring + visit);
}

/** ist „Zuhause während der Reise“ zu zeigen: Haustier bekannt oder für die Reise bzw. in den Vorlieben eingeschaltet */
export function homeCareOn(trip: Trip, prefs: { pet?: boolean; homeCare?: boolean }): { pets: boolean; home: boolean } {
  const home = trip.homeCare ?? !!prefs.homeCare;
  const known = !!prefs.pet || Object.values(trip.households || {}).some(h => h.pets?.kinds.length);
  return { pets: home || known, home };
}

/** Schlüssel des Postens je Familie */
export const careKey = (hh: string) => `home:${hh}`;

/**
 * Posten für eine Familie (#322, #323): „Zuhause versorgt“ bzw. „Tierbetreuung“, nur für diese Familie.
 * Freundeskreis mit dem Dankeschön-Betrag (sonst 0 €, vorgewählt als günstigstes); bleiben Tiere zuhause, dazu der
 * Richtwert Tierpension bzw. Tiersitter.
 */
export function careItem(trip: Trip, hh: string, p?: Pets, c?: HomeCare): Item {
  const days = careDays(trip);
  const ids = trip.travelers.filter(x => isActive(x) && hhKey(x) === hh).map(x => x.id);
  const pets = p?.home && p.kinds.length ? p : undefined;
  const thanks = thanksText(c);
  const name = c?.tasks.length ? t("home.item", { hh }) : t("pet.item", { hh, pets: kindsText(pets?.kinds || []) });
  return {
    id: uid(), cat: "misc", name, status: "idea", hint: careKey(hh),
    note: [pets ? (days ? t("pet.itemNote", { d: tn("n.days", days) }) : t("pet.itemNoDates")) : "", thanks ? t("home.thanksNote", { x: thanks }) : ""].filter(Boolean).join(" "),
    ...(ids.length ? { participants: ids } : {}),
    options: [
      { id: uid(), label: t("pet.friends"), price: { mode: "unit", currency: "EUR", unit: Math.max(0, Math.round(c?.thanks?.eur || 0)) } },
      ...(pets ? [{ id: uid(), label: t("pet.pension"), estimate: true, price: { mode: "unit" as const, currency: "EUR", unit: careEstimate(pets, days || 1) } }] : [])
    ]
  };
}

/** Posten aktualisieren (Dankeschön, Name): Freundeskreis-Betrag und Notiz; Pension-Richtwert neu */
export function updateCareItem(it: Item, fresh: Item): void {
  it.name = fresh.name;
  it.note = fresh.note;
  const friends = it.options[0], f = fresh.options[0];
  if (friends && f) friends.price = { ...f.price };
  const pension = fresh.options[1];
  if (pension) { if (it.options[1]) it.options[1].price = { ...pension.price }; else it.options.push(pension); }
  else if (it.options.length > 1) it.options.splice(1);
}
