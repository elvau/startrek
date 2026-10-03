/*
 * Einreise & Tipps: Hinweise zur Reise mit Links zu offiziellen Stellen. Je Reiseland (Einreise für deutsche
 * Staatsangehörige, Stand Oktober 2026) und je besonderem Ort (Galápagos, Machu Picchu, Cristo Redentor …).
 * Keine Rechtsberatung: Texte sind kurze Hinweise, maßgeblich ist immer die verlinkte offizielle Stelle.
 * Länder kommen aus Reiseland, Flughäfen der Flüge und Orten der Unterkünfte; Orte aus Stationen, Flughäfen und Posten.
 */
import type { Item, Trip } from "./model";

export interface HintLink { label: string; url: string }
export interface Hint {
  id: string;
  /** Länder (ISO), für die der Hinweis gilt */
  cc?: string[];
  /** Flughäfen und Stichwörter (Orte, Posten), bei denen der Hinweis gilt */
  aps?: string[];
  words?: RegExp;
  /** Art: Einreise (Land, deutsche Staatsangehörige), Warnung (Land, für alle) oder Ort */
  kind: "entry" | "warn" | "place";
  links: HintLink[];
  /** Richtwert als Posten (pro Person, in der Währung): Gebühren vor Ort */
  fee?: { adult: number; child?: number; currency: string; cat: Item["cat"] };
}

/** Auswärtiges Amt (alle Länder) und IATA (für andere Staatsangehörigkeiten) */
export const GENERAL_LINKS: HintLink[] = [
  { label: "Auswärtiges Amt", url: "https://www.auswaertiges-amt.de/de/ReiseUndSicherheit" },
  { label: "IATA Travel Centre", url: "https://www.iatatravelcentre.com/passport-visa-health-travel-document-requirements.htm" }
];

export const HINTS: Hint[] = [
  // Einreise: vorab online anmelden (deutsche Staatsangehörige)
  { id: "us", kind: "entry", cc: ["US"], links: [{ label: "ESTA (CBP)", url: "https://esta.cbp.dhs.gov/" }] },
  { id: "ca", kind: "entry", cc: ["CA"], links: [{ label: "eTA (Canada)", url: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada/eta.html" }] },
  { id: "gb", kind: "entry", cc: ["GB"], links: [{ label: "ETA (GOV.UK)", url: "https://www.gov.uk/eta" }] },
  { id: "au", kind: "entry", cc: ["AU"], links: [{ label: "eVisitor (Home Affairs)", url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/evisitor-651" }] },
  { id: "nz", kind: "entry", cc: ["NZ"], links: [{ label: "NZeTA", url: "https://www.immigration.govt.nz/new-zealand-visas/visas/visa/nzeta" }] },
  { id: "th", kind: "entry", cc: ["TH"], links: [{ label: "TDAC", url: "https://tdac.immigration.go.th/" }] },
  { id: "ke", kind: "entry", cc: ["KE"], links: [{ label: "eTA Kenya", url: "https://www.etakenya.go.ke/" }] },
  { id: "in", kind: "entry", cc: ["IN"], links: [{ label: "e-Visa India", url: "https://indianvisaonline.gov.in/evisa/" }] },
  { id: "lk", kind: "entry", cc: ["LK"], links: [{ label: "ETA Sri Lanka", url: "https://www.eta.gov.lk/" }] },
  { id: "eg", kind: "entry", cc: ["EG"], links: [{ label: "Visa2Egypt", url: "https://www.visa2egypt.gov.eg/" }] },
  { id: "il", kind: "entry", cc: ["IL"], links: [{ label: "ETA-IL", url: "https://israel-entry.piba.gov.il/" }] },
  { id: "cu", kind: "entry", cc: ["CU"], links: [{ label: "eVisa Cuba", url: "https://www.evisacuba.cu/" }, { label: "D'Viajeros", url: "https://dviajeros.mitrans.gob.cu/" }] },
  { id: "sc", kind: "entry", cc: ["SC"], links: [{ label: "Seychelles Travel Authorisation", url: "https://seychelles.govtas.com/" }] },
  { id: "idn", kind: "entry", cc: ["ID"], links: [{ label: "All Indonesia", url: "https://allindonesia.imigrasi.go.id/" }, { label: "e-VOA", url: "https://evisa.imigrasi.go.id/" }] },
  { id: "ph", kind: "entry", cc: ["PH"], links: [{ label: "eTravel", url: "https://etravel.gov.ph/" }] },
  { id: "bt", kind: "entry", cc: ["BT"], links: [{ label: "Visit Bhutan", url: "https://www.bhutan.travel/" }] },
  { id: "tz", kind: "entry", cc: ["TZ"], links: [{ label: "e-Visa Tanzania", url: "https://eservices.immigration.go.tz/visa/" }] },
  { id: "cn", kind: "entry", cc: ["CN"], links: [{ label: "NIA China", url: "https://en.nia.gov.cn/" }] },
  { id: "aq", kind: "place", cc: ["AQ"], words: /antarkti|antarctic/i, links: [{ label: "Umweltbundesamt", url: "https://www.umweltbundesamt.de/themen/nachhaltigkeit-strategien-internationales/antarktis/antarktisreisende" }, { label: "IAATO", url: "https://iaato.org/" }] },
  // Reisen mit besonderen Risiken: für alle Staatsangehörigkeiten
  { id: "kp", kind: "warn", cc: ["KP"], words: /nordkorea|north korea|pjöngjang|pyongyang|rason|wonsan/i,
    links: [{ label: "Koryo Tours", url: "https://koryogroup.com/" }, { label: "Young Pioneer Tours", url: "https://www.youngpioneertours.com/" }] },
  // besondere Orte
  { id: "galapagos", kind: "place", aps: ["GPS", "SCY"], words: /gal[aá]pagos|baltra|puerto ayora|isabela/i,
    links: [{ label: "TCT online (CGREG)", url: "https://siig-cgreg.gobiernogalapagos.gob.ec/" }, { label: "Parque Nacional Galápagos", url: "https://www.galapagos.gob.ec/" }],
    fee: { adult: 220, child: 120, currency: "USD", cat: "misc" } },
  { id: "machu", kind: "place", aps: ["CUZ"], words: /machu ?picchu|aguas calientes|cusco|cuzco|ollantaytambo/i,
    links: [{ label: "Tickets (Ministerio de Cultura)", url: "https://tuboleto.cultura.pe/" }, { label: "PeruRail", url: "https://www.perurail.com/" }, { label: "Inca Rail", url: "https://incarail.com/" }] },
  { id: "corcovado", kind: "place", aps: ["GIG", "SDU"], words: /rio de janeiro|corcovado|cristo redentor|christ the redeemer/i,
    links: [{ label: "Trem do Corcovado", url: "https://www.tremdocorcovado.rio/" }] },
  { id: "alhambra", kind: "place", words: /alhambra/i, links: [{ label: "Alhambra (Patronato)", url: "https://tickets.alhambra-patronato.es/" }] },
  { id: "sagrada", kind: "place", words: /sagrada fam[ií]lia/i, links: [{ label: "Sagrada Família", url: "https://sagradafamilia.org/" }] },
  { id: "neuschwanstein", kind: "place", words: /neuschwanstein|hohenschwangau/i, links: [{ label: "Ticket-Center Hohenschwangau", url: "https://www.hohenschwangau.de/" }] },
  { id: "angkor", kind: "place", aps: ["SAI", "REP"], words: /angkor|siem reap/i, links: [{ label: "Angkor Enterprise", url: "https://www.angkorenterprise.gov.kh/" }] },
  { id: "petra", kind: "place", aps: ["AQJ"], words: /\bpetra\b|wadi rum|jordanien|jordan\b/i, links: [{ label: "Jordan Pass", url: "https://www.jordanpass.jo/" }] },
  { id: "bali", kind: "place", aps: ["DPS"], words: /\bbali\b|ubud|seminyak|canggu|nusa (penida|lembongan)/i,
    links: [{ label: "Love Bali", url: "https://lovebali.baliprov.go.id/" }], fee: { adult: 150000, currency: "IDR", cat: "misc" } },
  { id: "inca", kind: "place", words: /inka.?trail|inca.?trail|camino inca/i, links: [] },
  { id: "fuji", kind: "place", words: /fuji(san)?\b.*(besteig|aufstieg|climb|hike|wander)|(besteig|aufstieg|climb|hike|wander).*fuji|fuji ?trail|yoshida.?trail/i,
    links: [{ label: "Mt. Fuji Climbing", url: "https://www.fujisan-climb.jp/en/" }], fee: { adult: 4000, currency: "JPY", cat: "attractions" } },
  { id: "nepal", kind: "place", aps: ["LUA", "PKR"], words: /everest|annapurna|langtang|manaslu|mustang|lukla|poon hill/i,
    links: [{ label: "Nepal Tourism Board", url: "https://ntb.gov.np/" }] },
  { id: "gorilla", kind: "place", words: /gorilla|bwindi|mgahinga|volcanoes national park|virunga/i,
    links: [{ label: "Uganda Wildlife Authority", url: "https://ugandawildlife.org/" }, { label: "Visit Rwanda", url: "https://www.visitrwanda.com/" }] },
  { id: "rapanui", kind: "place", aps: ["IPC"], words: /osterinsel|easter island|rapa ?nui|hanga roa/i,
    links: [{ label: "Rapa Nui National Park", url: "https://www.rapanuinationalpark.com/" }], fee: { adult: 100, currency: "USD", cat: "attractions" } },
  { id: "acropolis", kind: "place", words: /akropolis|acropolis|parthenon/i, links: [{ label: "Hellenic Heritage e-Tickets", url: "https://hhticket.gr/" }] },
  { id: "venice", kind: "place", aps: ["VCE", "TSF"], words: /venedig|venezia|venice/i,
    links: [{ label: "Venezia Access Fee", url: "https://cda.veneziaunica.it/en" }] }
];

/** Länder der Reise: Reiseland, Flughäfen der Flüge (Landungen), Länder der Unterkünfte */
export function tripCountries(trip: Trip, ccOfCountry: (name?: string) => string | null, ccOfAirport: (code: string) => string | undefined): string[] {
  const out = new Set<string>();
  const add = (c?: string | null) => { if (c) out.add(c.toUpperCase()); };
  add(ccOfCountry(trip.country));
  for (const it of trip.items) {
    if (it.status === "dropped") continue;
    for (const o of it.options) {
      for (const l of o.legs || []) if (l.dir !== "back") add(ccOfAirport(l.to));
      if (o.query?.country) add(ccOfCountry(o.query.country));
    }
  }
  return [...out];
}

/** Hinweise für die Reise: je Land die Einreise, je Ort die Besonderheiten (Flughäfen, Orte, Posten, Tagesplan) */
export function hintsFor(trip: Trip, countries: string[], places: string[]): Hint[] {
  const aps = new Set(trip.items.filter(i => i.status !== "dropped").flatMap(i => i.options.flatMap(o => (o.legs || []).flatMap(l => [l.from, l.to]))));
  const text = [trip.place, ...places, ...trip.items.filter(i => i.status !== "dropped").flatMap(i => [i.name, ...i.options.map(o => o.label), ...i.options.map(o => o.query?.place || "")]),
    ...Object.values(trip.days || {}).flatMap(d => [d.title || "", ...(d.notes || []).flatMap(n => [n.text, n.to || ""])])].filter(Boolean).join(" | ");
  return HINTS.filter(h => (h.cc || []).some(c => countries.includes(c)) || (h.kind !== "entry" && ((h.aps || []).some(a => aps.has(a)) || !!h.words?.test(text))));
}
