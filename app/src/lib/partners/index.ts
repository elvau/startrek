/*
 * Partner-Verzeichnis: alle Anbieter, zu denen die App verlinkt, an einer Stelle (Anleitung: docs/PARTNER.md).
 * Je Partner: Kategorie, Netzwerk der Provision, Link mit vorausgefüllten Angaben und, falls freigeschaltet,
 * die Partnerkennung. Kennungen gehen nur in Links, wenn Partner-Links im Such-Dienst an sind (PARTNER_LINKS);
 * sonst bleiben alle Links neutral. Treffer aus Schnittstellen (Flüge, Touren) kennzeichnen ihre Quellen selbst.
 */
import { kayakCarLink, type CarWindow } from "../extras";
import type { Key } from "../i18n/types";
import {
  airbnbLink, bookingLink, getYourGuideLink, googleFlightsLink, skyscannerLink, tiqetsLink, tripadvisorRestaurantsLink, viatorLink,
  type ActivityLinkQuery, type FlightLinkQuery, type StayLinkQuery
} from "../links";

export type PartnerCat = "flight" | "stay" | "activity" | "food" | "car" | "transfer" | "insurance";
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
  tiqets: p<ActivityLinkQuery>({ name: "Tiqets", cat: "activity", net: "travelpayouts", link: tiqetsLink }),
  /* Essen */
  tripadvisor: p<string>({ name: "Tripadvisor", cat: "food", link: tripadvisorRestaurantsLink }),
  /* Mietwagen: KAYAK mit Ort und Zeiten, die anderen zum Vergleichen */
  kayakCars: p<CarLinkQuery>({ name: "KAYAK", cat: "car", link: q => (q.w ? kayakCarLink(q.w, q.place) : null) }),
  check24Cars: p<CarLinkQuery>({ name: "CHECK24", cat: "car", link: home("https://www.check24.de/mietwagen/") }),
  discoverCars: p<CarLinkQuery>({ name: "DiscoverCars", cat: "car", net: "travelpayouts", link: home("https://www.discovercars.com/de") }),
  /* Flughafentransfer */
  kiwitaxi: p<void>({ name: "Kiwitaxi", cat: "transfer", net: "travelpayouts", link: home("https://kiwitaxi.com/de") }),
  getTransfer: p<void>({ name: "GetTransfer", cat: "transfer", net: "travelpayouts", link: home("https://gettransfer.com/de") }),
  intui: p<void>({ name: "Intui.travel", cat: "transfer", net: "travelpayouts", link: home("https://intui.travel/de/") }),
  welcomePickups: p<void>({ name: "Welcome Pickups", cat: "transfer", net: "travelpayouts", link: home("https://www.welcomepickups.com/de/") }),
  bookingTaxi: p<void>({ name: "Booking.com Taxi", cat: "transfer", link: home("https://taxi.booking.com/") }),
  /* Reiseversicherung: nur als Tipp, keine Beratung (§ 34d GewO) */
  check24Insurance: p<void>({ name: "CHECK24", cat: "insurance", link: home("https://www.check24.de/reiseversicherung/") }),
  ergo: p<void>({ name: "ERGO Reiseversicherung", cat: "insurance", net: "awin", link: home("https://www.reiseversicherung.de/") }),
  hanseMerkur: p<void>({ name: "HanseMerkur", cat: "insurance", net: "awin", link: home("https://www.hansemerkur.de/reiseversicherung") }),
  allianz: p<void>({ name: "Allianz Travel", cat: "insurance", link: home("https://www.allianz-reiseversicherung.de/") })
};

export type PartnerId = keyof typeof PARTNERS;
export type PartnerQuery<K extends PartnerId> = Parameters<(typeof PARTNERS)[K]["link"]>[0];

export interface PartnerHref {
  id: PartnerId;
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
  return { id, name: e.name, ...(e.nameKey ? { nameKey: e.nameKey } : {}), url: sponsored ? e.tag!(url) : url, sponsored };
}

/** Partner einer Kategorie in der Reihenfolge des Verzeichnisses */
export const partnersOf = (cat: PartnerCat) => (Object.keys(PARTNERS) as PartnerId[]).filter(id => PARTNERS[id].cat === cat);

/** Ist unter diesen Links ein Partner-Link? Dann den Hinweis zum Sternchen zeigen */
export const sponsoredAny = (ids: readonly PartnerId[], q: unknown, on: boolean) => ids.some(id => partnerLink(id, q as never, on)?.sponsored);
