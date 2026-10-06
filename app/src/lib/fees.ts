/*
 * Gepflegte Nebenkosten je Ort bzw. Land (Epic Preistransparenz, #170): Kurtaxen bzw. City Tax, Vignetten, Maut,
 * Durchfahrten mit dem Auto, Trinkgeld. Richtwerte ohne Gewähr („ca.“), Stand und Quellen in docs/NEBENKOSTEN.md.
 * Ein neuer Ort bzw. ein neues Land ist eine Zeile.
 */
import { isActive, type Deposit, type Extra, type Item, type Option, type Traveler, type Trip } from "./model";

export const FEES_AS_OF = "2026";

/** Notkurse je Euro, falls noch keine Tageskurse geladen sind (sonst würde 6.910 HUF als 6.910 € zählen) */
const FALLBACK_FX: Record<string, number> = { CHF: 0.94, CZK: 25, HUF: 400, RON: 5, BGN: 1.96, PLN: 4.3, DKK: 7.46, SEK: 11.2, NOK: 11.7, GBP: 0.86, JPY: 160, AED: 4, USD: 1.1 };
/** Kurs (Währung je Euro) mit Notkurs: rate liefert 1 für unbekannte Währungen */
export const safeRate = (rate: (cur: string) => number) => (cur: string) => {
  const r = rate(cur);
  return cur !== "EUR" && (!r || r === 1) && FALLBACK_FX[cur] ? FALLBACK_FX[cur] : r || 1;
};

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
  { id: "paris", city: "Paris", words: /\bparis\b/i, currency: "EUR", basis: "personNight", amount: 5.53, stars: { 1: 2.6, 2: 3.25, 3: 5.53, 4: 8.45, 5: 11.7 }, freeUpTo: 17, source: "Ville de Paris (Tarife ab 1.1.2026)" },
  { id: "rome", city: "Rom", words: /\brom\b|\broma\b|\brome\b/i, currency: "EUR", basis: "personNight", amount: 6, stars: { 1: 4, 2: 5, 3: 6, 4: 7.5, 5: 10 }, freeUpTo: 9, max: 10, source: "Roma Capitale" },
  { id: "milan", city: "Mailand", words: /mailand|milano|\bmilan\b/i, currency: "EUR", basis: "personNight", amount: 7, stars: { 1: 3, 2: 4, 3: 7, 4: 10, 5: 12 }, freeUpTo: 17, max: 14, source: "Comune di Milano (ab 1.4.2026)" },
  { id: "venice", city: "Venedig", words: /venedig|venezia|venice|mestre|lido di venezia/i, currency: "EUR", basis: "personNight", amount: 3.5, stars: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 }, freeUpTo: 9, max: 5, source: "Comune di Venezia" },
  { id: "florence", city: "Florenz", words: /florenz|firenze|florence/i, currency: "EUR", basis: "personNight", amount: 6, stars: { 1: 3.5, 2: 4.5, 3: 6, 4: 7, 5: 8 }, freeUpTo: 11, max: 7, source: "Comune di Firenze" },
  { id: "naples", city: "Neapel", words: /neapel|napoli|naples/i, currency: "EUR", basis: "personNight", amount: 3, stars: { 1: 1.5, 2: 2, 3: 3, 4: 4, 5: 5 }, freeUpTo: 17, max: 14, source: "Comune di Napoli" },
  { id: "barcelona", city: "Barcelona", words: /barcelona/i, currency: "EUR", basis: "personNight", amount: 9.5, stars: { 1: 7, 2: 7, 3: 7, 4: 8.4, 5: 12 }, freeUpTo: 16, max: 7, source: "Generalitat de Catalunya, Ajuntament de Barcelona (ab 1.4.2026)" },
  { id: "balearics", city: "Mallorca, Ibiza, Menorca", words: /mallorca|majorca|palma de mallorca|(?<!la |las )\bpalma\b|ibiza|eivissa|menorca|formentera|alc[uú]dia|cala (d'or|millor|ratjada)|s'arenal/i, currency: "EUR", basis: "personNight", amount: 2, stars: { 1: 2, 2: 2, 3: 2, 4: 3, 5: 4 }, freeUpTo: 15, source: "Govern de les Illes Balears (Ecotasa)" },
  { id: "lisbon", city: "Lissabon", words: /lissabon|lisboa|lisbon/i, currency: "EUR", basis: "personNight", amount: 4, freeUpTo: 13, max: 7, source: "Câmara Municipal de Lisboa" },
  { id: "porto", city: "Porto", words: /\bporto\b(?!\s+(cervo|heli|santo|ercole|rotondo))|oporto/i, currency: "EUR", basis: "personNight", amount: 3, freeUpTo: 13, max: 7, source: "Câmara Municipal do Porto" },
  { id: "vienna", city: "Wien", words: /\bwien\b|vienna|vienne/i, currency: "EUR", basis: "percent", amount: 5, source: "Stadt Wien (Ortstaxe)" },
  { id: "salzburg", city: "Salzburg", words: /salzburg/i, currency: "EUR", basis: "personNight", amount: 3.5, freeUpTo: 14, source: "Stadt Salzburg (3 € Nächtigungsabgabe + 0,50 € Mobilitätsbeitrag)" },
  { id: "berlin", city: "Berlin", words: /berlin/i, currency: "EUR", basis: "percent", amount: 7.5, source: "Senatsverwaltung für Finanzen Berlin (City Tax)" },
  { id: "hamburg", city: "Hamburg", words: /hamburg/i, currency: "EUR", basis: "personNight", amount: 2, source: "Freie und Hansestadt Hamburg (Kultur- und Tourismustaxe)" },
  { id: "cologne", city: "Köln", words: /köln|koeln|cologne/i, currency: "EUR", basis: "percent", amount: 5, source: "Stadt Köln (Kulturförderabgabe)" },
  { id: "frankfurt", city: "Frankfurt", words: /frankfurt am main|\bfrankfurt\b/i, currency: "EUR", basis: "personNight", amount: 2, freeUpTo: 17, source: "Stadt Frankfurt (Tourismusbeitrag)" },
  { id: "dresden", city: "Dresden", words: /dresden/i, currency: "EUR", basis: "percent", amount: 6, source: "Landeshauptstadt Dresden (Beherbergungssteuer)" },
  { id: "prague", city: "Prag", words: /\bprag\b|praha|prague/i, currency: "CZK", basis: "personNight", amount: 50, freeUpTo: 17, max: 60, source: "Hlavní město Praha" },
  { id: "budapest", city: "Budapest", words: /budapest/i, currency: "EUR", basis: "percent", amount: 4, freeUpTo: 17, source: "Budapest Főváros (IFA)" },
  { id: "brussels", city: "Brüssel", words: /brüssel|bruxelles|brussel|brussels/i, currency: "EUR", basis: "night", amount: 5, source: "Région de Bruxelles-Capitale (je Zimmer, ab 1.1.2026)" },
  { id: "edinburgh", city: "Edinburgh", words: /edinburgh/i, currency: "GBP", basis: "percent", amount: 5, max: 5, source: "City of Edinburgh Council (Visitor Levy)" },
  { id: "athens", city: "Athen", words: /\bathen\b|athens|athína|athina/i, currency: "EUR", basis: "night", amount: 5, stars: { 1: 2, 2: 2, 3: 5, 4: 10, 5: 15 }, source: "Hellenic Republic (Klimaresilienzgebühr)" },
  { id: "santorini", city: "Santorini, Mykonos", words: /santorin|thira|\bfira\b|\boia\b|mykonos/i, currency: "EUR", basis: "night", amount: 5, stars: { 1: 2, 2: 2, 3: 5, 4: 10, 5: 15 }, source: "Hellenic Republic (Klimaresilienzgebühr)" },
  { id: "dubrovnik", city: "Dubrovnik", words: /dubrovnik/i, currency: "EUR", basis: "personNight", amount: 2.65, freeUpTo: 11, source: "Grad Dubrovnik (April bis September; sonst 1,85 €)" },
  { id: "croatia", city: "Kroatien (Split, Dubrovnik, Istrien …)", words: /\bsplit\b|dubrovnik|zadar|\bpula\b|rovinj|poreč|porec|hvar|makarska|trogir|šibenik|sibenik|opatija|krk\b/i, currency: "EUR", basis: "personNight", amount: 2, freeUpTo: 11, source: "Republika Hrvatska (boravišna pristojba)" },
  { id: "zurich", city: "Zürich", words: /zürich|zurich/i, currency: "CHF", basis: "personNight", amount: 2.5, freeUpTo: 15, source: "Stadt Zürich (City Tax)" },
  { id: "geneva", city: "Genf", words: /\bgenf\b|gen[eè]ve|geneva/i, currency: "CHF", basis: "personNight", amount: 3.75, freeUpTo: 15, source: "Canton de Genève (taxe de séjour)" },
  { id: "malta", city: "Malta", words: /\bmalta\b|valletta|sliema|st\.? julian|gozo/i, currency: "EUR", basis: "personNight", amount: 1.5, freeUpTo: 17, max: 15, source: "Malta Tourism Authority (Eco Contribution, ab 1.7.2026)" },
  { id: "reykjavik", city: "Island", words: /reykjav[ií]k|iceland|ísland|^\s*island\s*$|,\s*island\b/i, currency: "ISK", basis: "night", amount: 800, source: "Skatturinn (gistináttaskattur)" },
  { id: "newyork", city: "New York", words: /new york|manhattan|brooklyn|nyc\b/i, currency: "USD", basis: "percent", amount: 14.75, source: "NYC Department of Finance (Hotel Room Occupancy Tax)" },
  { id: "dubai", city: "Dubai", words: /dubai/i, currency: "AED", basis: "night", amount: 15, stars: { 1: 7, 2: 7, 3: 10, 4: 15, 5: 20 }, max: 30, source: "Dubai DET (Tourism Dirham)" },
  { id: "tokyo", city: "Tokio", words: /tokio|tokyo|shinjuku|shibuya/i, currency: "JPY", basis: "personNight", amount: 200, source: "Tokyo Metropolitan Government (Accommodation Tax)" },
  { id: "kyoto", city: "Kyoto", words: /kyoto/i, currency: "JPY", basis: "personNight", amount: 400, stars: { 1: 200, 2: 200, 3: 400, 4: 1000, 5: 4000 }, source: "City of Kyoto (Accommodation Tax)" },
  { id: "ljubljana", city: "Ljubljana", words: /ljubljana|laibach/i, currency: "EUR", basis: "personNight", amount: 3.13, freeUpTo: 6, source: "Mestna občina Ljubljana (7–17 Jahre halber Satz)" },
  { id: "zermatt", city: "Zermatt", words: /zermatt/i, currency: "CHF", basis: "personNight", amount: 4, freeUpTo: 8, source: "Zermatt Tourismus (9–15 Jahre 2 CHF)" },
  { id: "funchal", city: "Funchal (Madeira)", words: /funchal/i, currency: "EUR", basis: "personNight", amount: 2, max: 7, source: "Câmara Municipal do Funchal" },
  { id: "maldives", city: "Malediven", words: /malediven|maldives|maldivas|maafushi|hulhumal[eé]/i, currency: "USD", basis: "personNight", amount: 12, freeUpTo: 1, source: "Maldives Inland Revenue Authority (Green Tax; 6 USD in kleinen Gästehäusern)" },
  { id: "turkey", city: "Türkei", words: /türkei|turkey|türkiye|turkiye|antalya|alanya|belek|kemer|manavgat|bodrum|marmaris|fethiye|[iİ]stanbul|kuşadası|kusadasi|didim|çeşme|cesme|kappadokien|cappadocia|göreme|goreme|ölüdeniz|oludeniz/i, currency: "TRY", basis: "percent", amount: 1, source: "Gelir İdaresi Başkanlığı (Konaklama Vergisi; bis 31.12.2026 1 %, danach 2 %)" }
];

/** Vignetten je Land (Pkw, kürzeste Gültigkeit für Urlaub); Länder mit Maut nach Strecke getrennt */
export interface Vignette { cc: string; label: string; amount: number; currency: string; days: number; source: string }
export const VIGNETTES: Vignette[] = [
  { cc: "AT", label: "Österreich: 10-Tages-Vignette", amount: 12.8, currency: "EUR", days: 10, source: "ASFINAG" },
  { cc: "CH", label: "Schweiz: Jahresvignette", amount: 40, currency: "CHF", days: 365, source: "BAZG" },
  { cc: "SI", label: "Slowenien: 7-Tages-Vignette", amount: 16, currency: "EUR", days: 7, source: "DARS" },
  { cc: "CZ", label: "Tschechien: 10-Tages-Vignette", amount: 300, currency: "CZK", days: 10, source: "edalnice.cz" },
  { cc: "SK", label: "Slowakei: 10-Tages-Vignette", amount: 12, currency: "EUR", days: 10, source: "eznamka.sk" },
  { cc: "HU", label: "Ungarn: 10-Tages-Vignette", amount: 6910, currency: "HUF", days: 10, source: "ematrica.nemzetiutdij.hu" },
  { cc: "RO", label: "Rumänien: 10-Tages-Vignette (Euro 6)", amount: 30, currency: "RON", days: 10, source: "erovinieta.ro (Tarife ab 1.10.2026)" },
  { cc: "BG", label: "Bulgarien: Wochenvignette", amount: 10, currency: "EUR", days: 7, source: "bgtoll.bg (ab 1.8.2026)" }
];

/** Maut nach Strecke: Richtwert je 100 km Autobahn (Pkw) */
export const TOLLS: Record<string, { per100: number; currency: string; source: string }> = {
  FR: { per100: 9, currency: "EUR", source: "autoroutes.fr" },
  IT: { per100: 7.5, currency: "EUR", source: "autostrade.it" },
  ES: { per100: 2, currency: "EUR", source: "Ministerio de Transportes (Durchschnitt; AP-7 seit 2021 mautfrei)" },
  PT: { per100: 8, currency: "EUR", source: "portugaltolls.com" },
  HR: { per100: 7, currency: "EUR", source: "HAC" },
  GR: { per100: 7, currency: "EUR", source: "Hellenic Motorways" },
  PL: { per100: 6, currency: "EUR", source: "autostrady (nur A1, A2, A4 privat)" },
  RS: { per100: 4.5, currency: "EUR", source: "Putevi Srbije" },
  MK: { per100: 4, currency: "EUR", source: "Mautstellen Skopje–Gevgelija" },
  NO: { per100: 10, currency: "EUR", source: "autopass.no (Ringe und Strecken)" }
};

/** typische Durchfahrten mit dem Auto (von → nach): Länder dazwischen */
export const TRANSIT: Record<string, string[]> = {
  "DE>IT": ["AT"], "DE>HR": ["AT", "SI"], "DE>SI": ["AT"], "DE>ES": ["FR"], "DE>PT": ["FR", "ES"], "DE>HU": ["AT"],
  "DE>SK": ["CZ"], "DE>RS": ["AT", "HU"], "DE>RO": ["AT", "HU"], "DE>BG": ["AT", "HU", "RS"], "DE>GR": ["AT", "HU", "RS", "MK"], "DE>MK": ["AT", "HU", "RS"], "DE>TR": ["AT", "HU", "RS", "BG"],
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
export function roadExtras(route: string[], roadKm: number, rate0: (cur: string) => number): Extra[] {
  const out: Extra[] = [], rate = safeRate(rate0);
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
  TH: { norm: "round" }, ID: { norm: "round", local: ["service"] }, JP: { norm: "none" }, KR: { norm: "none" }, CN: { norm: "none" }, AU: { norm: "round" }, NZ: { norm: "round" },
  SE: { norm: "round" }, NO: { norm: "round" }, DK: { norm: "round" }, FI: { norm: "round" }, IS: { norm: "none" },
  MT: { norm: "usual", v: "5–10 %" }, CY: { norm: "usual", v: "10 %", local: ["service"] },
  SI: { norm: "round", v: "5–10 %" }, SK: { norm: "usual", v: "10 %" }, RO: { norm: "usual", v: "10 %" }, BG: { norm: "usual", v: "10 %" },
  EE: { norm: "round", v: "5–10 %" }, LV: { norm: "round", v: "5–10 %" }, LT: { norm: "round", v: "5–10 %" },
  ME: { norm: "round", v: "5–10 %" }, AL: { norm: "round", v: "5–10 %" }, BA: { norm: "usual", v: "10 %" },
  MA: { norm: "usual", v: "10 %" }, TN: { norm: "usual", v: "5–10 %" }, JO: { norm: "usual", v: "5–10 %" }, IL: { norm: "usual", v: "10–15 %" },
  ZA: { norm: "usual", v: "10–15 %" }, KE: { norm: "usual", v: "10 %" }, TZ: { norm: "usual", v: "10 %" }, MU: { norm: "round" }, SC: { norm: "round" },
  IN: { norm: "usual", v: "10 %" }, LK: { norm: "usual", v: "10 %", local: ["service"] }, MV: { norm: "round", local: ["resort", "service"] },
  VN: { norm: "round", v: "5–10 %" }, KH: { norm: "round", v: "5–10 %" }, SG: { norm: "none", local: ["service"] }, HK: { norm: "round", local: ["service"] },
  AR: { norm: "usual", v: "10 %" }, BR: { norm: "round", local: ["service"] }, PE: { norm: "usual", v: "10 %" }, CO: { norm: "usual", v: "10 %", local: ["service"] },
  CR: { norm: "round", local: ["service"] }, DO: { norm: "usual", v: "10 %", local: ["service"] }, CU: { norm: "usual", v: "10 %" }
};

/** passende Kurtaxe zu einer Unterkunft (erster Treffer, Suchort zuerst) */
export function cityTaxFor(it: Item, o: Option, trip: Trip): CityTax | null {
  if (it.cat !== "stay") return null;
  const parts = [o.query?.place, o.detail, o.label, it.name, o.loc?.q, trip.place].filter(Boolean) as string[];
  for (const p of parts) { const c = CITY_TAXES.find(x => x.words.test(p)); if (c) return c; }
  return null;
}

/**
 * Mietwagen (#172): Richtwerte großer Vermieter, Kompaktklasse. Kaution nur per Kreditkarte; junge Fahrer zahlen Aufpreis,
 * unter youngMin vermieten viele gar nicht. Vollschutz und Zusatzfahrer nur auf Wunsch eingerechnet.
 */
export const RENTAL = {
  deposit: 800, depositMin: 300, depositMax: 1500,
  youngUnder: 25, youngMin: 21, young: 12,
  cover: 20, driver2: 8,
  source: "Bedingungen großer Vermieter (Sixt, Europcar, Hertz, Avis)"
};

/** Mietwagen-Posten: markiert (hint „rental“) oder ältere Posten mit Auto-Symbol und passendem Namen (nicht Transfer, nicht eigenes Auto) */
const RENTAL_WORDS = /miet|leihwagen|rental|hire|alquiler|location|wynaj|аренд|прокат|مستأجر|تأجير/i;
export const isRental = (it: Item) => it.hint === "rental" || (it.cat === "transport" && it.icon === "car" && !it.hint && RENTAL_WORDS.test(it.name || ""));

/** automatische Schätzungen, die erst auf Wunsch eingerechnet werden (o.autoOn) */
export const AUTO_OPTIONAL = new Set(["auto:cover", "auto:driver2"]);

/** wer im Mietwagen sitzt und als junger Fahrer gilt: Erwachsene mit bekanntem Alter unter 25 */
export function youngDrivers(it: Item, trip: Trip): Traveler[] {
  const ids = it.participants?.length ? new Set(it.participants) : null;
  const adult = trip.settings?.adultAge ?? 18;
  return trip.travelers.filter(t => isActive(t) && (!ids || ids.has(t.id)) && t.age != null && (t.age as unknown) !== ""
    && isFinite(Number(t.age)) && Number(t.age) >= Math.max(17, adult) && Number(t.age) < RENTAL.youngUnder);
}

/** geschätzte Kaution am Mietwagen (je Auto), solange keine eigene angegeben bzw. weggeklickt ist; rate: Währung je Euro */
export function autoDeposit(it: Item, o: Option, rate = 1, cars = 1): Deposit | undefined {
  if (o.deposit || !isRental(it) || o.autoOff?.includes("auto:deposit")) return undefined;
  return { amount: Math.round(RENTAL.deposit * rate * Math.max(1, cars)), how: "credit", est: true };
}

/** automatisch geschätzte Nebenkosten eines Angebots (nicht gespeichert, wegklickbar über autoOff) */
/** rate: Einheiten der Währung je Euro (wie in der Rechnung) */
export function autoExtras(it: Item, o: Option, trip: Trip, rate0: (cur: string) => number): Extra[] {
  const out: Extra[] = [], rate = safeRate(rate0);
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
  // Mietwagen: junge Fahrer (eingerechnet, wegklickbar), Vollschutz und Zusatzfahrer (nur auf Wunsch)
  if (isRental(it)) {
    const r = rate(o.price.currency || "EUR"), src = `${RENTAL.source}, ${FEES_AS_OF}`;
    const add = (id: string, kind: Extra["kind"], amount: number, optional: boolean) => {
      if (own.some(x => x.kind === kind)) return;
      const off = optional ? !o.autoOn?.includes(id) : !!o.autoOff?.includes(id);
      out.push({ id, kind, amount: Math.round(amount * r * 100) / 100, basis: "day", pay: "onsite", est: true, source: src, ...(off ? { off: true } : {}) });
    };
    if (youngDrivers(it, trip).length) add("auto:young", "young", RENTAL.young, false);
    add("auto:cover", "cover", RENTAL.cover, true);
    add("auto:driver2", "driver", RENTAL.driver2, true);
  }
  return out;
}
