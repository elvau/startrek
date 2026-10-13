/*
 * Reisehinweise der eigenen Regierung (#164): für britische, US- und kanadische Pässe aus den offenen Schnittstellen
 * (FCDO über die GOV.UK Content API, U.S. Department of State, Government of Canada), sonst Auswärtiges Amt mit Hinweis.
 * Der Such-Dienst bekommt nur das Reiseland (/advice/gov?cc=US) und liefert alle Quellen dafür; welche Quelle für wen
 * gilt, entscheidet der Browser aus der Staatsangehörigkeit. Stufen werden auf die des Auswärtigen Amts abgebildet.
 */
export type GovSrc = "GB" | "US" | "CA";
export const GOV_SRCS: GovSrc[] = ["GB", "US", "CA"];
export type GovLevel = "warning" | "partial" | "situation";
export interface GovAdvice {
  /** abgebildet auf die Stufen des Auswärtigen Amts; null = keine besonderen Hinweise */
  level: GovLevel | null;
  url: string;
  /** zuletzt geändert (JJJJ-MM-TT) */
  modified?: string;
  /** Vertretung des eigenen Landes im Reiseland (wo die Quelle sie kennt) */
  embassy?: string;
}
export type GovMap = Partial<Record<GovSrc, GovAdvice>>;

/** Regierungen je Staatsangehörigkeit: Name, Reisehinweise, Vertretungen; mit `api` liefert der Such-Dienst die Stufe */
export const OWN_GOV: Record<string, { name: string; advice: string; embassy?: string; api?: GovSrc }> = {
  DE: { name: "Auswärtiges Amt", advice: "https://www.auswaertiges-amt.de/de/ReiseUndSicherheit" },
  GB: { name: "FCDO (GOV.UK)", advice: "https://www.gov.uk/foreign-travel-advice", embassy: "https://www.gov.uk/world/embassies", api: "GB" },
  US: { name: "U.S. Department of State", advice: "https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories.html", embassy: "https://www.usembassy.gov/", api: "US" },
  CA: { name: "Government of Canada", advice: "https://travel.gc.ca/travelling/advisories", embassy: "https://travel.gc.ca/assistance/embassies-consulates", api: "CA" },
  AT: { name: "BMEIA", advice: "https://www.bmeia.gv.at/reise-services/reiseinformation" },
  CH: { name: "EDA", advice: "https://www.eda.admin.ch/eda/de/home/vertretungen-und-reisehinweise.html" },
  FR: { name: "France Diplomatie", advice: "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/" },
  NL: { name: "Nederland Wereldwijd", advice: "https://www.nederlandwereldwijd.nl/reisadvies" },
  IE: { name: "Department of Foreign Affairs", advice: "https://www.ireland.ie/en/dfa/overseas-travel/advice/" },
  AU: { name: "Smartraveller", advice: "https://www.smartraveller.gov.au/destinations" },
  NZ: { name: "SafeTravel", advice: "https://www.safetravel.govt.nz/" },
  PL: { name: "MSZ (gov.pl)", advice: "https://www.gov.pl/web/dyplomacja/informacje-dla-podrozujacych" },
  ES: { name: "Ministerio de Asuntos Exteriores", advice: "https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Recomendaciones-de-viaje.aspx" },
  IT: { name: "Viaggiare Sicuri", advice: "https://www.viaggiaresicuri.it/" }
};

/**
 * Quelle der Reisehinweise für eine Person (alle Pässe): mit deutschem Pass das Auswärtige Amt, sonst die erste eigene
 * Regierung mit Schnittstelle, deren Daten fürs Reiseland da sind; sonst Auswärtiges Amt (fallback: eigene gibt es nicht).
 */
export function adviceSource(nats: string[], have: GovMap | undefined): { src: GovSrc | "AA"; fallback: boolean } {
  if (nats.includes("DE")) return { src: "AA", fallback: false };
  for (const n of nats) { const api = OWN_GOV[n]?.api; if (api && have?.[api]) return { src: api, fallback: false }; }
  return { src: "AA", fallback: true };
}

// ---- Ländernamen → ISO-2 (GOV.UK und State Department nennen Länder beim Namen)

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\band\b|&/g, " ").replace(/\bsaint\b/g, "st").replace(/\b(the|of|republic)\b/g, " ").replace(/[^a-z]+/g, " ").trim();
/** Schreibweisen der Quellen, die die englischen Namen aus Intl nicht treffen */
const ALIAS: Record<string, string> = {
  usa: "US", "united states": "US", uk: "GB", "united kingdom": "GB", "burma": "MM", "burma myanmar": "MM", "mainland china": "CN", china: "CN",
  "cote d ivoire": "CI", "ivory coast": "CI", "democratic congo": "CD", "drc": "CD", "congo kinshasa": "CD", "congo": "CG", "congo brazzaville": "CG",
  "north korea": "KP", "korea north": "KP", "democratic people s korea": "KP", "south korea": "KR", "korea south": "KR",
  "czech": "CZ", "czechia": "CZ", "turkiye": "TR", "turkey": "TR", "russia": "RU", "macao": "MO", "macau": "MO", "hong kong": "HK", "taiwan": "TW",
  "gambia": "GM", "bahamas": "BS", "vatican city": "VA", "holy see": "VA", "east timor": "TL", "timor leste": "TL", "cape verde": "CV", "cabo verde": "CV",
  "eswatini": "SZ", "swaziland": "SZ", "palestinian territories": "PS", "israel palestinian territories": "IL", "micronesia": "FM", "st lucia": "LC",
  "st kitts nevis": "KN", "st vincent grenadines": "VC", "sao tome principe": "ST", "north macedonia": "MK", "kosovo": "XK", "laos": "LA", "syria": "SY",
  "iran": "IR", "vietnam": "VN", "brunei": "BN", "moldova": "MD", "bolivia": "BO", "venezuela": "VE", "tanzania": "TZ", "curacao": "CW"
};
let byName: Map<string, string> | undefined;
/** ISO-2 zu einem englischen Ländernamen (Intl.DisplayNames, dazu Schreibweisen der Quellen) */
export function isoOfName(name: string): string | undefined {
  const n = norm(name.replace(/\(.*?\)/g, " ")), full = norm(name);
  if (ALIAS[full]) return ALIAS[full];
  if (ALIAS[n]) return ALIAS[n];
  if (!byName) {
    byName = new Map();
    const dn = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const cc = String.fromCharCode(a, b), nm = dn.of(cc);
      // veraltete Codes (DD, BU …) zeigen auf heutige Länder: überspringen
      if (!nm || nm === cc || Intl.getCanonicalLocales(`und-${cc}`)[0] !== `und-${cc}`) continue;
      for (const k of [norm(nm), norm(nm.replace(/\(.*?\)/g, " "))]) if (k && !byName.has(k)) byName.set(k, cc);
    }
  }
  return byName.get(full) || byName.get(n);
}

const day = (v: unknown) => {
  const ms = typeof v === "number" ? (v < 1e11 ? v * 1000 : v) : typeof v === "string" ? Date.parse(v) : NaN;
  return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : undefined;
};

// ---- Kanada: data.international.gc.ca/travel-voyage/index-updated.json (ISO-2 je Land, Stufe 0–3)

export const CA_LIST = "https://data.international.gc.ca/travel-voyage/index-updated.json";
/** advisory-state: 0 normale Vorsicht, 1 erhöhte Vorsicht, 2 nicht notwendige Reisen meiden, 3 alle Reisen meiden; dazu regionale Warnungen */
export function parseCanada(data: unknown): Record<string, GovAdvice> {
  const out: Record<string, GovAdvice> = {};
  const root = (data as { data?: unknown })?.data ?? data;
  if (!root || typeof root !== "object") return out;
  for (const [k, v] of Object.entries(root as Record<string, unknown>)) {
    const x = v as Record<string, unknown>;
    const cc = String(x?.["country-iso"] || k).toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) continue;
    const st = Number(x["advisory-state"]), regional = !!Number(x["has-regional-advisory"]);
    const level: GovLevel | null = st >= 3 ? "warning" : st === 2 || regional ? "partial" : st === 1 ? "situation" : null;
    const eng = (x.eng || {}) as Record<string, unknown>;
    const slug = typeof eng["url-slug"] === "string" ? eng["url-slug"] : "";
    const pub = x["date-published"] as Record<string, unknown> | undefined;
    const modified = day(pub?.timestamp ?? pub?.date);
    out[cc] = { level, url: slug ? `https://travel.gc.ca/destinations/${encodeURIComponent(slug)}` : OWN_GOV.CA.advice, ...(modified ? { modified } : {}) };
  }
  return out;
}

// ---- USA: cadataapi.state.gov/api/TravelAdvisories („Mexico - Level 2: Exercise Increased Caution“)

export const US_LIST = "https://cadataapi.state.gov/api/TravelAdvisories";
/** Level 4 Do Not Travel, 3 Reconsider Travel, 2 Exercise Increased Caution, 1 normale Vorsicht */
export function parseUsa(data: unknown): Record<string, GovAdvice> {
  const out: Record<string, GovAdvice> = {};
  const list = Array.isArray(data) ? data : Array.isArray((data as { value?: unknown })?.value) ? (data as { value: unknown[] }).value : [];
  for (const v of list) {
    const x = v as Record<string, unknown>;
    const m = /^(.+?)\s*[-–]\s*Level\s*(\d)/i.exec(String(x?.Title || ""));
    if (!m) continue;
    const cc = isoOfName(m[1]);
    if (!cc || out[cc]) continue;
    const n = +m[2];
    const modified = day(x.Updated ?? x.Published);
    out[cc] = { level: n >= 4 ? "warning" : n === 3 ? "partial" : n === 2 ? "situation" : null,
      url: typeof x.Link === "string" && /^https:\/\//.test(x.Link) ? x.Link : OWN_GOV.US.advice, ...(modified ? { modified } : {}) };
  }
  return out;
}

// ---- Großbritannien: GOV.UK Content API (Liste der Länder mit slug, je Land alert_status)

export const UK_LIST = "https://www.gov.uk/api/content/foreign-travel-advice";
export const ukCountry = (slug: string) => `${UK_LIST}/${encodeURIComponent(slug)}`;
/** Liste → ISO-2 auf slug */
export function parseUkIndex(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const kids = (data as { links?: { children?: unknown[] } })?.links?.children;
  for (const v of Array.isArray(kids) ? kids : []) {
    const c = (v as { details?: { country?: { name?: string; slug?: string } } })?.details?.country;
    if (!c?.slug || !c.name || !/^[a-z0-9-]+$/.test(c.slug)) continue;
    const cc = isoOfName(c.name);
    if (cc && !out[cc]) out[cc] = c.slug;
  }
  return out;
}
/** alert_status: avoid_all_travel_to_whole_country = Reisewarnung, sonst (Teile, nicht notwendige Reisen) Teilreisewarnung */
export function parseUkCountry(data: unknown, slug: string): GovAdvice {
  const x = data as { details?: { alert_status?: unknown }; public_updated_at?: string };
  const st = Array.isArray(x?.details?.alert_status) ? (x.details!.alert_status as unknown[]).map(String) : [];
  const level: GovLevel | null = st.includes("avoid_all_travel_to_whole_country") ? "warning" : st.length ? "partial" : null;
  const modified = day(x?.public_updated_at);
  return { level, url: `https://www.gov.uk/foreign-travel-advice/${slug}`, embassy: `https://www.gov.uk/world/${slug}`, ...(modified ? { modified } : {}) };
}
