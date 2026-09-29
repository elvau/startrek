import { DEFAULT_SETTINGS, uid, type Trip } from "./model";
import { i18n, t } from "./i18n/index.svelte";

/** Ländername in der gewählten Sprache (wird von der Ländererkennung in allen Sprachen verstanden) */
const countryName = (cc: string) => { try { return new Intl.DisplayNames([i18n.lang], { type: "region" }).of(cc) || cc; } catch { return cc; } };

/** Beispielreise für den ersten Start, in der gewählten Sprache. Eigene ID, damit Beispiele verschiedener Personen im Konto nicht kollidieren. */
export function sampleTrip(): Trip {
  return {
    id: "b-" + uid(),
    name: t("seed.name"),
    place: "Makarska",
    country: countryName("HR"),
    kicker: t("seed.kicker"),
    from: "2027-07-18",
    to: "2027-07-29",
    travelers: [
      { id: "anna", name: "Anna", age: 41, household: "Klein", color: "#D2693C" },
      { id: "jonas", name: "Jonas", age: 43, household: "Klein", color: "#2F6FDB" },
      { id: "mia", name: "Mia", age: 11, household: "Klein", color: "#C0487A" },
      { id: "ben", name: "Ben", age: 8, household: "Klein", color: "#1F8A70" }
    ],
    households: {
      Klein: { plz: "40210", geo: { lat: 51.223, lon: 6.779, ort: "Düsseldorf" }, mode: "car", cars: 1 }
    },
    tiers: {},
    settings: { ...DEFAULT_SETTINGS },
    items: [
      {
        id: "flug", cat: "flights", name: t("seed.flight"), status: "idea", chosen: "ew",
        options: [
          {
            id: "ew", label: t("seed.ew"), detail: t("seed.ewDetail"),
            price: { mode: "person", currency: "EUR", adult: 389 },
            source: { name: t("seed.source"), at: "2026-09-27" },
            legs: [
              { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:25", carrier: "Eurowings", stops: 0 },
              { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T09:15", arr: "2027-07-29T11:35", carrier: "Eurowings", stops: 0 }
            ]
          },
          {
            id: "fr", label: t("seed.fr"), detail: t("seed.frDetail"),
            price: { mode: "person", currency: "EUR", adult: 274 },
            legs: [
              { dir: "out", from: "NRN", to: "SPU", dep: "2027-07-18T14:40", arr: "2027-07-18T16:50", carrier: "Ryanair", stops: 0 },
              { dir: "back", from: "SPU", to: "NRN", dep: "2027-07-29T17:20", arr: "2027-07-29T19:30", carrier: "Ryanair", stops: 0 }
            ]
          },
          {
            id: "ou", label: t("seed.ou"),
            price: { mode: "person", currency: "EUR", adult: 331 },
            legs: [
              { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T07:05", arr: "2027-07-18T12:40", carrier: "Croatia Airlines", stops: 1 },
              { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T13:30", arr: "2027-07-29T18:50", carrier: "Croatia Airlines", stops: 1 }
            ]
          }
        ]
      },
      {
        id: "villa", cat: "stay", name: "Villa Maslina, Makarska", status: "booked",
        from: "2027-07-18", to: "2027-07-29",
        booking: { provider: "Booking", cancelUntil: "2027-06-01" },
        payments: [{ amount: 400, note: t("seed.deposit") }],
        options: [{
          id: "v", label: t("seed.apt"),
          price: { mode: "unit", currency: "EUR", unit: 148, basis: "night", capacity: 5 },
          stay: { stars: 4, rating: 89, facts: [t("seed.bedrooms"), t("seed.beach")] }
        }]
      },
      {
        id: "auto", cat: "transport", name: t("seed.car"), icon: "car", status: "chosen",
        note: t("seed.carNote"),
        options: [{ id: "m", label: t("seed.compact"), price: { mode: "unit", currency: "EUR", unit: 35, qty: 11 } }]
      },
      {
        id: "faehre", cat: "transport", name: t("seed.ferry"), icon: "ship", status: "idea",
        note: t("seed.ferryNote"),
        options: [{ id: "f", label: "Jadrolinija", price: { mode: "unit", currency: "EUR", unit: 62 } }]
      },
      {
        id: "krka", cat: "attractions", name: t("seed.krka"), icon: "ticket", status: "chosen",
        options: [{ id: "k", label: t("seed.dayTicket"), price: { mode: "person", currency: "EUR", adult: 40, child: 15 } }]
      },
      {
        id: "boot", cat: "attractions", name: t("seed.boat"), icon: "ship", status: "idea",
        options: [{ id: "b", label: t("seed.fullDay"), price: { mode: "person", currency: "EUR", adult: 75, child: 45 } }]
      },
      {
        id: "essen", cat: "misc", name: t("seed.food"), icon: "food", status: "chosen",
        note: t("seed.foodNote"),
        options: [{ id: "e", label: t("seed.mixed"), estimate: true, price: { mode: "person", currency: "EUR", adult: 28, qty: 11 } }]
      },
      {
        id: "vers", cat: "misc", name: t("seed.insurance"), icon: "shield", status: "paid",
        note: t("seed.insNote"),
        options: [{ id: "r", label: t("seed.family"), price: { mode: "unit", currency: "EUR", unit: 89 } }]
      }
    ]
  };
}
