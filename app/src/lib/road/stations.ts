/*
 * Camper-Stationen (#203, #269): je Station ein Unterkunfts-Posten „Campingplatz“ bzw. „Stellplatz“ mit Richtwert je Nacht
 * und Land, dazu der Mietcamper als Posten. Gemeinsam für das Kapitel Transport (CamperPanel) und den KI-Planer: Camper-
 * Reisen bekommen Stationen statt Hotels.
 */
import { t } from "../i18n/index.svelte";
import { uid, type Item, type Trip } from "../model";
import { eur } from "../calc";
import { addDays } from "../calc/travel";
import { FEES_AS_OF } from "../fees";
import { CAMPER_RENT, CAMPING_SOURCE, campNight, type CampStop } from "./camper";

export type { CampKind, CampStop } from "./camper";

/** Reise mit dem Camper? Dann keine Hotels vorschlagen, sondern Stationen */
export const isCamperTrip = (trip: Pick<Trip, "camper">) => !!trip.camper;

/** Unterkunfts-Posten einer Station ab `from` */
export function campItem(s: CampStop & { from: string }, persons: number): Item {
  const to = addDays(s.from, s.nights);
  return {
    id: uid(), cat: "stay", hint: `camp:${s.kind}`, status: "idea", name: t(s.kind === "site" ? "camp.site" : "camp.pitch", { place: s.place }), from: s.from, to,
    options: [{ id: uid(), label: t(s.kind === "site" ? "camp.siteEst" : "camp.pitchEst"), estimate: true,
      price: { mode: "unit", currency: "EUR", unit: campNight(s.kind, s.cc, persons), basis: "night" },
      query: { place: s.place, checkin: s.from, checkout: to, adults: persons, childAges: [], rooms: 1 },
      source: { name: `${CAMPING_SOURCE}, ${FEES_AS_OF}` } }]
  };
}

/** Stationen nacheinander ab `from` (jede beginnt, wo die vorige endet) */
export function campItems(stops: CampStop[], from: string, persons: number): Item[] {
  let d = from;
  return stops.map(s => { const it = campItem({ ...s, from: d }, persons); d = it.to!; return it; });
}

/** Mietcamper: Tagespreis × Tage, Mehrkilometer über dem Paket, Pauschalen, Kaution nur Kreditkarte */
export function rentItem(days: number, extraKm = 0): Item {
  const src = `${CAMPER_RENT.source}, ${FEES_AS_OF}`;
  return {
    id: uid(), cat: "transport", icon: "car", hint: "camper:rent", status: "idea", name: t("camp.rent"),
    note: t("camp.rentNote", { km: CAMPER_RENT.kmPerDay, v: eur(CAMPER_RENT.extraKm) }),
    options: [{ id: uid(), label: t("camp.rentEst"), estimate: true, price: { mode: "unit", currency: "EUR", unit: CAMPER_RENT.day, qty: days },
      extras: [
        { id: `camp:service:${uid()}`, kind: "other", label: t("camp.service"), amount: CAMPER_RENT.service, basis: "booking", pay: "extra", est: true, source: src },
        { id: `camp:cleaning:${uid()}`, kind: "cleaning", amount: CAMPER_RENT.cleaning, basis: "booking", pay: "extra", est: true, off: true, source: src },
        ...(extraKm > 0 ? [{ id: `camp:km:${uid()}`, kind: "other" as const, label: t("camp.extraKm", { km: extraKm }), amount: Math.round(extraKm * CAMPER_RENT.extraKm), basis: "booking" as const, pay: "extra" as const, est: true, source: src }] : [])
      ],
      deposit: { amount: CAMPER_RENT.deposit, how: "credit", est: true, for: t("camp.rent") } }]
  };
}
