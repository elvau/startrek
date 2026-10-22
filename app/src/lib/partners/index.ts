/*
 * Partner-Verzeichnis: alle Anbieter, zu denen die App verlinkt, an einer Stelle (Anleitung: docs/PARTNER.md).
 * Je Partner: Kategorie, Netzwerk der Provision, Link mit vorausgefüllten Angaben und, falls freigeschaltet,
 * die Partnerkennung. Kennungen gehen nur in Links, wenn Partner-Links im Such-Dienst an sind (PARTNER_LINKS);
 * sonst bleiben alle Links neutral. Treffer aus Schnittstellen (Flüge, Touren) kennzeichnen ihre Quellen selbst.
 */
import { kayakCarLink, type CarWindow } from "../extras";
import type { Key } from "../i18n/types";
import { clickId } from "./click";
import {
  airbnbLink, bookingLink, getYourGuideLink, googleFlightsLink, klookLink, skyscannerLink, tiqetsLink, tripadvisorRestaurantsLink, viatorLink,
  type ActivityLinkQuery, type FlightLinkQuery, type StayLinkQuery
} from "../links";

export type PartnerCat = "flight" | "stay" | "activity" | "food" | "car" | "transfer" | "insurance" | "ferry" | "camper" | "camping" | "parking";
/** Netzwerk, über das die Provision läuft; direkt: eigenes Partnerprogramm des Anbieters */
export type PartnerNet = "direct" | "travelpayouts" | "awin" | "amazon";

export interface Partner<Q> {
  name: string;
  /** Name aus den Übersetzungen statt `name` */
  nameKey?: Key;
  cat: PartnerCat;
  /** Partnerprogramm, falls vorhanden (auch ohne Freischaltung zur Übersicht) */
  net?: PartnerNet;
  /** Link mit vorausgefüllten Angaben; null, wenn die Angaben dafür nicht reichen */
  link: (q: Q) => string | null;
  /** Partnerkennung anhängen; nur eintragen, wenn das Programm freigeschaltet ist */
  tag?: (url: string) => string;
  /** true: Link vorübergehend nicht zeigen */
  off?: boolean;
}

/** Flüge: Google braucht Namen statt Codes, wenn eine Stadt mit mehreren Flughäfen gewählt ist */
export type FlightPartnerQuery = FlightLinkQuery & { fromName?: string; toName?: string };
export interface CarLinkQuery { w: CarWindow | null; place: string }
/** Parken am Abflughafen: Flughafen (IATA), Abgabe und Abholung (JJJJ-MM-TTTHH:MM), Personen */
export interface ParkLinkQuery { ap: string; from: string; to: string; adults: number; children: number; infants: number }

/** Parken und Fliegen: Suche mit Flughafen, Zeitraum und Personen (Aufbau aus deren Suchmaske, 10/2026) */
export function parkenUndFliegenLink(q?: ParkLinkQuery): string {
  const ok = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);
  if (!q || !/^[A-Z]{3}$/.test(q.ap) || !ok(q.from) || !ok(q.to)) return "https://www.parken-und-fliegen.de/";
  const h = new URLSearchParams({
    agent: "PBALL", lang: "de", adults: String(Math.max(1, q.adults)), children: String(q.children), infants: String(q.infants),
    depart: q.ap, out: q.from.slice(0, 10), in: q.to.slice(0, 10), park_from: q.from.slice(11, 16), park_to: q.to.slice(11, 16),
    redirectReferal: "carpark", from_categories: "true"
  });
  return `https://v2.parken-und-fliegen.de/static/?selectProduct=cp&#/categories?${h}`;
}

const p = <Q>(e: Partner<Q>) => e;
/** Startseite des Anbieters, ohne vorausgefüllte Angaben */
const home = (url: string) => () => url;
/** Parameter setzen (Partnerkennung im Link) */
const params = (kv: Record<string, string>) => (url: string) => {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(kv)) u.searchParams.set(k, v);
    return u.toString();
  } catch { return url; }
};

/** Viator-Partnerkennung (öffentlich, steht in jedem Partner-Link) */
export const VIATOR_PARTNER = { pid: "P00322974", mcid: "42383", medium: "link" };
/** Travelpayouts (öffentlich, steht in jedem Partner-Link): Marker des Kontos, Projekt splitandfly.com */
export const TP_PARTNER = { marker: "783080", trs: "584426" };
/** Travelpayouts: Ziel-Link über tp.media weiterleiten; p = Programm, campaign = Kampagne (aus „Generate links“) */
export const tp = (p: number, campaign: number) => (url: string) =>
  `https://tp.media/r?${new URLSearchParams({ campaign_id: String(campaign), marker: TP_PARTNER.marker, p: String(p), trs: TP_PARTNER.trs, u: url })}`;
/** Awin (öffentlich, steht in jedem Partner-Link): Publisher-ID des Kontos */
export const AWIN_PUBLISHER = "3121582";
/** Awin: Ziel-Link über awin1.com weiterleiten; mid = Programm (Advertiser-ID), ued = Zielseite */
export const awin = (mid: number) => (url: string) =>
  `https://www.awin1.com/cread.php?${new URLSearchParams({ awinmid: String(mid), awinaffid: AWIN_PUBLISHER, ued: url })}`;

export const PARTNERS = {
  /* Flüge */
  googleFlights: p<FlightPartnerQuery>({ name: "Google Flights", nameKey: "fs.googleFlights", cat: "flight", link: q => googleFlightsLink({ ...q, from: q.fromName || q.from, to: q.toName || q.to }) }),
  skyscanner: p<FlightPartnerQuery>({ name: "Skyscanner", cat: "flight", link: q => skyscannerLink(q) }),
  /* Unterkünfte */
  booking: p<StayLinkQuery>({ name: "Booking.com", cat: "stay", net: "direct", link: bookingLink }),
  airbnb: p<StayLinkQuery>({ name: "Airbnb", cat: "stay", link: airbnbLink }),
  /* Erlebnisse */
  getYourGuide: p<ActivityLinkQuery>({ name: "GetYourGuide", cat: "activity", net: "travelpayouts", link: getYourGuideLink }),
  viator: p<ActivityLinkQuery>({ name: "Viator", cat: "activity", net: "direct", link: viatorLink, tag: params(VIATOR_PARTNER) }),
  tiqets: p<ActivityLinkQuery>({ name: "Tiqets", cat: "activity", net: "travelpayouts", link: tiqetsLink, tag: tp(2074, 89) }),
  klook: p<ActivityLinkQuery>({ name: "Klook", cat: "activity", net: "travelpayouts", link: klookLink, tag: tp(4110, 137) }),
  /* Essen */
  tripadvisor: p<string>({ name: "Tripadvisor", cat: "food", link: tripadvisorRestaurantsLink }),
  /* Mietwagen: KAYAK mit Ort und Zeiten, die anderen zum Vergleichen */
  kayakCars: p<CarLinkQuery>({ name: "KAYAK", cat: "car", link: q => (q.w ? kayakCarLink(q.w, q.place) : null) }),
  check24Cars: p<CarLinkQuery>({ name: "CHECK24", cat: "car", link: home("https://www.check24.de/mietwagen/") }),
  discoverCars: p<CarLinkQuery>({ name: "DiscoverCars", cat: "car", net: "travelpayouts", link: home("https://www.discovercars.com/de") }),
  /* Flughafentransfer */
  kiwitaxi: p<void>({ name: "Kiwitaxi", cat: "transfer", net: "travelpayouts", link: home("https://kiwitaxi.com/de"), tag: tp(647, 1) }),
  getTransfer: p<void>({ name: "GetTransfer", cat: "transfer", net: "travelpayouts", link: home("https://gettransfer.com/de") }),
  intui: p<void>({ name: "Intui.travel", cat: "transfer", net: "travelpayouts", link: home("https://intui.travel/de/") }),
  welcomePickups: p<void>({ name: "Welcome Pickups", cat: "transfer", net: "travelpayouts", link: home("https://www.welcomepickups.com/de/"), tag: tp(8919, 627) }),
  bookingTaxi: p<void>({ name: "Booking.com Taxi", cat: "transfer", link: home("https://taxi.booking.com/") }),
  /* Fähren (#202): Vergleich je Strecke; Partnerprogramme direkt (Direct Ferries, Ferryhopper), noch nicht freigeschaltet */
  directFerries: p<void>({ name: "Direct Ferries", cat: "ferry", net: "direct", link: home("https://www.directferries.de/") }),
  ferryhopper: p<void>({ name: "Ferryhopper", cat: "ferry", net: "direct", link: home("https://www.ferryhopper.com/de/") }),
  /* Camper (#203): Miete (Vermieter und private Plattformen), Stellplätze und Campingplätze */
  indieCampers: p<void>({ name: "Indie Campers", cat: "camper", link: home("https://indiecampers.com/") }),
  roadsurfer: p<void>({ name: "Roadsurfer", cat: "camper", link: home("https://roadsurfer.com/de/") }),
  paulCamper: p<void>({ name: "PaulCamper", cat: "camper", link: home("https://www.paulcamper.de/") }),
  yescapa: p<void>({ name: "Yescapa", cat: "camper", link: home("https://www.yescapa.de/") }),
  pincamp: p<void>({ name: "PiNCAMP", cat: "camping", link: home("https://www.pincamp.de/") }),
  acsi: p<void>({ name: "ACSI", cat: "camping", link: home("https://www.eurocampings.de/") }),
  park4night: p<void>({ name: "park4night", cat: "camping", link: home("https://park4night.com/de") }),
  /* Parken am Abflughafen (#419); Airparks und Holiday Extras über Awin (zugelassen 10/2026) */
  parkenUndFliegen: p<ParkLinkQuery | undefined>({ name: "Parken und Fliegen", cat: "parking", net: "awin", link: parkenUndFliegenLink, tag: awin(14793) }),
  parkos: p<void>({ name: "Parkos", cat: "parking", link: home("https://parkos.de/") }),
  airparks: p<void>({ name: "Airparks", cat: "parking", net: "awin", link: home("https://www.airparks.de/"), tag: awin(14699) }),
  holidayExtras: p<void>({ name: "Holiday Extras", cat: "parking", net: "awin", link: home("https://www.holidayextras.de/"), tag: awin(55335) }),
  /* Reiseversicherung: nur als Tipp, keine Beratung (§ 34d GewO) */
  check24Insurance: p<void>({ name: "CHECK24", cat: "insurance", link: home("https://www.check24.de/reiseversicherung/") }),
  ergo: p<void>({ name: "ERGO Reiseversicherung", cat: "insurance", net: "awin", link: home("https://www.reiseversicherung.de/") }),
  hanseMerkur: p<void>({ name: "HanseMerkur", cat: "insurance", net: "awin", link: home("https://www.hansemerkur.de/reiseversicherung"), tag: awin(11705) }),
  allianz: p<void>({ name: "Allianz Travel", cat: "insurance", link: home("https://www.allianz-reiseversicherung.de/") })
};

export type PartnerId = keyof typeof PARTNERS;
export type PartnerQuery<K extends PartnerId> = Parameters<(typeof PARTNERS)[K]["link"]>[0];

export interface PartnerHref {
  id: PartnerId;
  cat: PartnerCat;
  name: string;
  nameKey?: Key;
  url: string;
  /** mit Partnerkennung: als Partner-Link kennzeichnen (rel="sponsored", Hinweis) */
  sponsored: boolean;
}

/** Link zu einem Partner; on: Partner-Links an (Schalter im Such-Dienst). null: Partner aus oder Angaben reichen nicht */
export function partnerLink<K extends PartnerId>(id: K, q: PartnerQuery<K>, on: boolean): PartnerHref | null {
  const e = PARTNERS[id] as Partner<PartnerQuery<K>>;
  if (e.off) return null;
  const url = e.link(q);
  if (!url) return null;
  const sponsored = on && !!e.tag;
  return { id, cat: e.cat, name: e.name, ...(e.nameKey ? { nameKey: e.nameKey } : {}), url: sponsored ? e.tag!(url) : url, sponsored };
}

/** Verzeichnis für die Admin-Ansicht: je Partner Kennung der Klickzählung, ob eine Partnerkennung hinterlegt ist, ob ausgeblendet */
export const partnerList = () => (Object.keys(PARTNERS) as PartnerId[]).map(id => {
  const e = PARTNERS[id] as Partner<never>;
  return { id, click: clickId(id), name: e.name, cat: e.cat, ...(e.net ? { net: e.net } : {}), tagged: !!e.tag, off: !!e.off };
});

/** Anzeigenamen nach Kennung der Klickzählung (getYourGuide → getyourguide), für die Admin-Ansicht */
export const clickNames = (): Record<string, string> =>
  Object.fromEntries((Object.keys(PARTNERS) as PartnerId[]).map(id => [clickId(id), PARTNERS[id].name]));

/** Partner einer Kategorie in der Reihenfolge des Verzeichnisses */
export const partnersOf = (cat: PartnerCat) => (Object.keys(PARTNERS) as PartnerId[]).filter(id => PARTNERS[id].cat === cat);

/** Ist unter diesen Links ein Partner-Link? Dann den Hinweis zum Sternchen zeigen */
export const sponsoredAny = (ids: readonly PartnerId[], q: unknown, on: boolean) => ids.some(id => partnerLink(id, q as never, on)?.sponsored);
