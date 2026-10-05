/*
 * Gepflegte Nebenkosten je Ort bzw. Land (Epic Preistransparenz, #170): Kurtaxen bzw. City Tax, Vignetten, Maut,
 * Durchfahrten mit dem Auto, Trinkgeld. Richtwerte ohne Gewähr („ca.“), Stand und Quellen in docs/NEBENKOSTEN.md.
 * Ein neuer Ort bzw. ein neues Land ist eine Zeile.
 */
import type { Extra, Item, Option, Trip } from "./model";

export const FEES_AS_OF = "2026";

/** Kurtaxe je Stadt: pro Person und Nacht (je Sterne) oder in Prozent vom Preis; Kinder bis freeUpTo frei, höchstens max Nächte */
export interface CityTax {
  id: string;
  /** Anzeige */
  city: string;
  words: RegExp;
  currency: string;
  /** pro Person und Nacht, pro Unterkunft und Nacht (night) oder Prozent */
  basis: "personNight" | "night" | "percent";
  /** Betrag ohne Sterne bzw. Ferienwohnung */
  amount: number;
  /** nach Sternen (1–5), falls gestaffelt */
  stars?: Partial<Record<1 | 2 | 3 | 4 | 5, number>>;
  freeUpTo?: number;
  max?: number;
  source: string;
}

export const CITY_TAXES: CityTax[] = [
  { id: "amsterdam", city: "Amsterdam", words: /amsterdam/i, currency: "EUR", basis: "percent", amount: 12.5, source: "Gemeente Amsterdam" },
  { id: "paris", city: "Paris", words: /\bparis\b/i, currency: "EUR", basis: "personNight", amount: 5.2, stars: { 1: 2.28, 2: 3.25, 3: 5.2, 4: 8.13, 5: 11.38 }, freeUpTo: 17, source: "Ville de Paris" },
  { id: "rome", city: "Rom", words: /\brom\b|\broma\b|\brome\b/i, currency: "EUR", basis: "personNight", amount: 6, stars: { 1: 3, 2: 4, 3: 6, 4: 7.5, 5: 10 }, freeUpTo: 9, max: 10, source: "Roma Capitale" },
  { id: "milan", city: "Mailand", words: /mailand|milano|\bmilan\b/i, currency: "EUR", basis: "personNight", amount: 5, stars: { 1: 3, 2: 4, 3: 5, 4: 7, 5: 10 }, freeUpTo: 17, max: 14, source: "Comune di Milano" },
  { id: "venice", city: "Venedig", words: /venedig|venezia|venice|mestre|lido di venezia/i, currency: "EUR", basis: "personNight", amount: 3.5, stars: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }, freeUpTo: 9, max: 5, source: "Comune di Venezia" },
  { id: "florence", city: "Florenz", words: /florenz|firenze|florence/i, currency: "EUR", basis: "personNight", amount: 6, stars: { 1: 4.5, 2: 5, 3: 6, 4: 7, 5: 8 }, freeUpTo: 11, max: 7, source: "Comune di Firenze" },
  { id: "naples", city: "Neapel", words: /neapel|napoli|naples/i, currency: "EUR", basis: "personNight", amount: 3, stars: { 1: 1.5, 2: 2, 3: 3, 4: 4, 5: 5 }, freeUpTo: 17, max: 14, source: "Comune di Napoli" },
  { id: "barcelona", city: "Barcelona", words: /barcelona/i, currency: "EUR", basis: "personNight", amount: 5.5, stars: { 1: 4, 2: 4, 3: 5.5, 4: 6.5, 5: 8 }, freeUpTo: 16, max: 7, source: "Generalitat de Catalunya, Ajuntament de Barcelona" },
  { id: "balearics", city: "Mallorca, Ibiza, Menorca", words: /mallorca|majorca|palma|ibiza|eivissa|menorca|formentera|alc[uú]dia|cala (d'or|millor|ratjada)|s'arenal/i, currency: "EUR", basis: "personNight", amount: 3, stars: { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 }, freeUpTo: 15, source: "Govern de les Illes Balears (Ecotasa)" },
  { id: "lisbon", city: "Lissabon", words: /lissabon|lisboa|lisbon/i, currency: "EUR", basis: "personNight", amount: 4, freeUpTo: 12, max: 7, source: "Câmara Municipal de Lisboa" },
  { id: "porto", city: "Porto", words: /\bporto\b|oporto/i, currency: "EUR", basis: "personNight", amount: 3, freeUpTo: 12, max: 7, source: "Câmara Municipal do Porto" },
  { id: "vienna", city: "Wien", words: /\bwien\b|vienna|vienne/i, currency: "EUR", basis: "percent", amount: 5, source: "Stadt Wien (Ortstaxe)" },
  { id: "salzburg", city: "Salzburg", words: /salzburg/i, currency: "EUR", basis: "personNight", amount: 2.7, freeUpTo: 14, source: "Stadt Salzburg" },
  { id: "berlin", city: "Berlin", words: /berlin/i, currency: "EUR", basis: "percent", amount: 7.5, source: "Senatsverwaltung für Finanzen Berlin (City Tax)" },
  { id: "hamburg", city: "Hamburg", words: /hamburg/i, currency: "EUR", basis: "personNight", amount: 2, source: "Freie und Hansestadt Hamburg (Kultur- und Tourismustaxe)" },
  { id: "cologne", city: "Köln", words: /köln|koeln|cologne/i, currency: "EUR", basis: "percent", amount: 5, source: "Stadt Köln (Kulturförderabgabe)" },
  { id: "frankfurt", city: "Frankfurt", words: /frankfurt am main|\bfrankfurt\b/i, currency: "EUR", basis: "personNight", amount: 2, freeUpTo: 17, source: "Stadt Frankfurt (Tourismusbeitrag)" },
  { id: "dresden", city: "Dresden", words: /dresden/i, currency: "EUR", basis: "percent", amount: 6, source: "Landeshauptstadt Dresden (Beherbergungssteuer)" },
  { id: "prague", city: "Prag", words: /\bprag\b|praha|prague/i, currency: "CZK", basis: "personNight", amount: 50, freeUpTo: 17, max: 60, source: "Hlavní město Praha" },
  { id: "budapest", city: "Budapest", words: /budapest/i, currency: "EUR", basis: "percent", amount: 4, freeUpTo: 17, source: "Budapest Főváros (IFA)" },
  { id: "krakow", city: "Krakau", words: /krakau|krak[oó]w|cracow/i, currency: "PLN", basis: "personNight", amount: 2.5, source: "Miasto Kraków (opłata miejscowa)" },
  { id: "brussels", city: "Brüssel", words: /brüssel|bruxelles|brussel|brussels/i, currency: "EUR", basis: "night", amount: 5, stars: { 1: 3, 2: 4, 3: 5, 4: 7.5, 5: 9 }, source: "Région de Bruxelles-Capitale" },
  { id: "edinburgh", city: "Edinburgh", words: /edinburgh/i, currency: "GBP", basis: "percent", amount: 5, max: 5, source: "City of Edinburgh Council (Visitor Levy)" },
  { id: "athens", city: "Athen", words: /\bathen\b|athens|athína|athina/i, currency: "EUR", basis: "night", amount: 5, stars: { 1: 2, 2: 2, 3: 5, 4: 10, 5: 15 }, source: "Hellenic Republic (Klimaresilienzgebühr)" },
  { id: "santorini", city: "Santorini, Mykonos", words: /santorin|thira|fira|oia|mykonos/i, currency: "EUR", basis: "night", amount: 5, stars: { 1: 2, 2: 2, 3: 5, 4: 10, 5: 15 }, source: "Hellenic Republic (Klimaresilienzgebühr)" },
  { id: "croatia", city: "Kroatien (Split, Dubrovnik, Istrien …)", words: /\bsplit\b|dubrovnik|zadar|pula|rovinj|poreč|porec|hvar|makarska|trogir|šibenik|sibenik|opatija|krk\b/i, currency: "EUR", basis: "personNight", amount: 2, freeUpTo: 11, source: "Republika Hrvatska (boravišna pristojba)" },
  { id: "zurich", city: "Zürich", words: /zürich|zurich/i, currency: "CHF", basis: "personNight", amount: 2.5, freeUpTo: 15, source: "Stadt Zürich (City Tax)" },
  { id: "geneva", city: "Genf", words: /\bgenf\b|gen[eè]ve|geneva/i, currency: "CHF", basis: "personNight", amount: 3.75, freeUpTo: 15, source: "Canton de Genève (taxe de séjour)" },
  { id: "malta", city: "Malta", words: /\bmalta\b|valletta|sliema|st\.? julian|gozo/i, currency: "EUR", basis: "personNight", amount: 0.5, freeUpTo: 17, max: 10, source: "Malta Tourism Authority (Eco Contribution)" },
  { id: "reykjavik", city: "Island", words: /reykjav[ií]k|island\b|iceland/i, currency: "ISK", basis: "night", amount: 800, source: "Skatturinn (gistináttaskattur)" },
  { id: "newyork", city: "New York", words: /new york|manhattan|brooklyn|nyc\b/i, currency: "USD", basis: "percent", amount: 14.75, source: "NYC Department of Finance (Hotel Room Occupancy Tax)" },
  { id: "dubai", city: "Dubai", words: /dubai/i, currency: "AED", basis: "night", amount: 15, stars: { 1: 7, 2: 7, 3: 10, 4: 15, 5: 20 }, source: "Dubai DET (Tourism Dirham)" },
  { id: "tokyo", city: "Tokio", words: /tokio|tokyo|shinjuku|shibuya/i, currency: "JPY", basis: "personNight", amount: 200, source: "Tokyo Metropolitan Government (Accommodation Tax)" },
  { id: "kyoto", city: "Kyoto", words: /kyoto/i, currency: "JPY", basis: "personNight", amount: 400, stars: { 1: 200, 2: 200, 3: 400, 4: 1000, 5: 4000 }, source: "City of Kyoto (Accommodation Tax)" }
];

/** Vignetten je Land (Pkw, kürzeste Gültigkeit für Urlaub); Länder mit Maut nach Strecke getrennt */
export interface Vignette { cc: string; label: string; amount: number; currency: string; days: number; source: string }
export const VIGNETTES: Vignette[] = [
  { cc: "AT", label: "Österreich: 10-Tages-Vignette", amount: 12.8, currency: "EUR", days: 10, source: "ASFINAG" },
  { cc: "CH", label: "Schweiz: Jahresvignette", amount: 40, currency: "CHF", days: 365, source: "BAZG" },
  { cc: "SI", label: "Slowenien: 7-Tages-Vignette", amount: 16, currency: "EUR", days: 7, source: "DARS" },
  { cc: "CZ", label: "Tschechien: 10-Tages-Vignette", amount: 290, currency: "CZK", days: 10, source: "edalnice.cz" },
  { cc: "SK", label: "Slowakei: 10-Tages-Vignette", amount: 12, currency: "EUR", days: 10, source: "eznamka.sk" },
  { cc: "HU", label: "Ungarn: 10-Tages-Vignette", amount: 6400, currency: "HUF", days: 10, source: "ematrica.nemzetiutdij.hu" },
  { cc: "RO", label: "Rumänien: 10-Tages-Vignette", amount: 3, currency: "EUR", days: 10, source: "erovinieta.ro" },
  { cc: "BG", label: "Bulgarien: Wochenvignette", amount: 15, currency: "BGN", days: 7, source: "bgtoll.bg" }
];

/** Maut nach Strecke: Richtwert je 100 km Autobahn (Pkw) */
export const TOLLS: Record<string, { per100: number; currency: string; source: string }> = {
  FR: { per100: 9, currency: "EUR", source: "autoroutes.fr" },
  IT: { per100: 7.5, currency: "EUR", source: "autostrade.it" },
  ES: { per100: 6, currency: "EUR", source: "Ministerio de Transportes (nur ein Teil der Autobahnen)" },
  PT: { per100: 8, currency: "EUR", source: "portugaltolls.com" },
  HR: { per100: 7, currency: "EUR", source: "HAC" },
  GR: { per100: 7, currency: "EUR", source: "Hellenic Motorways" },
  PL: { per100: 6, currency: "PLN", source: "autostrady (nur einzelne Strecken)" },
  RS: { per100: 5, currency: "EUR", source: "Putevi Srbije" },
  NO: { per100: 10, currency: "EUR", source: "autopass.no (Ringe und Strecken)" }
};

/** typische Durchfahrten mit dem Auto (von → nach): Länder dazwischen */
export const TRANSIT: Record<string, string[]> = {
  "DE>IT": ["AT"], "DE>HR": ["AT", "SI"], "DE>SI": ["AT"], "DE>ES": ["FR"], "DE>PT": ["FR", "ES"], "DE>HU": ["AT"],
  "DE>SK": ["CZ"], "DE>RS": ["AT", "HU"], "DE>RO": ["AT", "HU"], "DE>BG": ["AT", "HU", "RS"], "DE>GR": ["AT", "SI", "HR", "RS"],
  "NL>IT": ["DE", "CH"], "NL>ES": ["BE", "FR"], "NL>AT": ["DE"], "BE>IT": ["LU", "FR", "CH"], "AT>HR": ["SI"], "AT>IT": [], "CH>ES": ["FR"],
  "PL>HR": ["CZ", "AT", "SI"], "PL>IT": ["CZ", "AT"]
};

/** Länder auf der Strecke mit dem Auto (Ziel eingeschlossen, Heimatland ausgeschlossen) */
export const routeCountries = (home: string, dest: string) => (home === dest ? [] : [...(TRANSIT[`${home}>${dest}`] || []), dest]);

/** was auf der Strecke an Vignetten und Maut anfällt */
export function roadCosts(countries: string[]): { vignettes: Vignette[]; tolls: string[] } {
  return { vignettes: VIGNETTES.filter(v => countries.includes(v.cc)), tolls: countries.filter(c => TOLLS[c]) };
}

/**
 * Vignetten und Maut als Nebenkosten eines Auto-Postens (je Auto, hin und zurück). Mautstrecke grob: die Straßenkilometer
 * gleichmäßig auf Heimatland und Länder der Strecke verteilt. rate: Einheiten der Währung je Euro.
 */
export function roadExtras(route: string[], roadKm: number, rate: (cur: string) => number): Extra[] {
  const out: Extra[] = [];
  const share = route.length ? roadKm / (route.length + 1) : 0;
  for (const v of VIGNETTES.filter(v => route.includes(v.cc)))
    out.push({ id: `road:vignette:${v.cc}`, kind: "vignette", cc: v.cc, amount: Math.round((v.amount / rate(v.currency)) * 100) / 100, basis: "booking", pay: "onsite", est: true, source: `${v.source}, ${FEES_AS_OF}` });
  for (const c of route.filter(c => TOLLS[c])) {
    const t = TOLLS[c];
    out.push({ id: `road:toll:${c}`, kind: "toll", cc: c, amount: Math.round(((2 * share * t.per100) / 100 / rate(t.currency)) * 100) / 100, basis: "booking", pay: "onsite", est: true, source: `${t.source}, ${FEES_AS_OF}` });
  }
  return out;
}

/** Trinkgeld-Gepflogenheiten (Restaurant), dazu typische Kosten vor Ort */
export type TipNorm = "high" | "usual" | "round" | "none";
export const TIPS: Record<string, { norm: TipNorm; v?: string; local?: ("resort" | "beach" | "service")[] }> = {
  US: { norm: "high", v: "18–22 %", local: ["resort"] }, CA: { norm: "high", v: "15–20 %" }, MX: { norm: "usual", v: "10–15 %", local: ["resort"] },
  DE: { norm: "round", v: "5–10 %" }, AT: { norm: "round", v: "5–10 %" }, CH: { norm: "round" }, NL: { norm: "round" }, BE: { norm: "round" },
  FR: { norm: "round", local: ["service"] }, IT: { norm: "round", local: ["beach", "service"] }, ES: { norm: "round" }, PT: { norm: "round", v: "5–10 %" },
  HR: { norm: "usual", v: "10 %", local: ["beach"] }, GR: { norm: "usual", v: "5–10 %", local: ["beach"] }, TR: { norm: "usual", v: "5–10 %" },
  GB: { norm: "usual", v: "10–12,5 %", local: ["service"] }, IE: { norm: "usual", v: "10–15 %" }, PL: { norm: "usual", v: "10 %" }, CZ: { norm: "usual", v: "10 %" },
  HU: { norm: "usual", v: "10–15 %", local: ["service"] }, EG: { norm: "usual", v: "10 %" }, AE: { norm: "usual", v: "10 %", local: ["service"] },
  TH: { norm: "round" }, ID: { norm: "round" }, JP: { norm: "none" }, KR: { norm: "none" }, CN: { norm: "none" }, AU: { norm: "round" }, NZ: { norm: "round" }
};

/** passende Kurtaxe zu einer Unterkunft (erster Treffer, Suchort zuerst) */
export function cityTaxFor(it: Item, o: Option, trip: Trip): CityTax | null {
  if (it.cat !== "stay") return null;
  const parts = [o.query?.place, o.detail, o.label, it.name, o.loc?.q, trip.place].filter(Boolean) as string[];
  for (const p of parts) { const c = CITY_TAXES.find(x => x.words.test(p)); if (c) return c; }
  return null;
}

/** automatisch geschätzte Nebenkosten eines Angebots (nicht gespeichert, wegklickbar über autoOff) */
/** rate: Einheiten der Währung je Euro (wie in der Rechnung) */
export function autoExtras(it: Item, o: Option, trip: Trip, rate: (cur: string) => number): Extra[] {
  const out: Extra[] = [];
  const own = o.extras || [];
  const c = cityTaxFor(it, o, trip);
  // Kurtaxe nur schätzen, wenn der Anbieter keine angibt
  if (c && !own.some(x => x.kind === "citytax")) {
    const s = o.stay?.stars ? Math.min(5, Math.max(1, Math.round(o.stay.stars))) as 1 | 2 | 3 | 4 | 5 : 0;
    const amount = s ? c.stars?.[s] ?? c.amount : c.amount;
    const id = `auto:citytax:${c.id}`;
    // Prozent in Fremdwährung: Prozent bleibt Prozent; Beträge in der Währung der Stadt umgerechnet über den Kurs der Reise
    const conv = c.basis === "percent" ? 1 : rate(o.price.currency || "EUR") / rate(c.currency);
    if (conv && isFinite(conv)) out.push({ id, kind: "citytax", amount: Math.round(amount * conv * 100) / 100, basis: c.basis, pay: "onsite", est: true,
      ...(c.freeUpTo != null ? { freeUpTo: c.freeUpTo } : {}), ...(c.max ? { max: c.max } : {}), source: `${c.source}, ${FEES_AS_OF}`, ...(o.autoOff?.includes(id) ? { off: true } : {}) });
  }
  return out;
}
