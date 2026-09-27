import { DEFAULT_SETTINGS, type Trip } from "./model";

/** Beispielreise für den ersten Start */
export function sampleTrip(): Trip {
  return {
    id: "beispiel",
    name: "Sommer in Kroatien",
    place: "Makarska",
    country: "Kroatien",
    kicker: "Sommerferien 2027 · Familie Klein",
    from: "2027-07-18",
    to: "2027-07-29",
    home: "40210 Düsseldorf · Anreise mit dem Auto",
    travelers: [
      { id: "anna", name: "Anna", age: 41, household: "Klein", color: "#D2693C" },
      { id: "jonas", name: "Jonas", age: 43, household: "Klein", color: "#2F6FDB" },
      { id: "mia", name: "Mia", age: 11, household: "Klein", color: "#C0487A" },
      { id: "ben", name: "Ben", age: 8, household: "Klein", color: "#1F8A70" }
    ],
    tiers: {},
    settings: { ...DEFAULT_SETTINGS },
    items: [
      {
        id: "flug", cat: "flights", name: "Flug Düsseldorf – Split", status: "idea", chosen: "ew",
        options: [
          {
            id: "ew", label: "Eurowings ab DUS, direkt", detail: "inkl. Koffer",
            price: { mode: "person", currency: "EUR", adult: 389 },
            source: { name: "Beispiel", at: "2026-09-27" },
            legs: [
              { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:25", carrier: "Eurowings", stops: 0 },
              { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T09:15", arr: "2027-07-29T11:35", carrier: "Eurowings", stops: 0 }
            ]
          },
          {
            id: "fr", label: "Ryanair ab Weeze, direkt", detail: "+45 min Anreise, Gepäck extra",
            price: { mode: "person", currency: "EUR", adult: 274 },
            legs: [
              { dir: "out", from: "NRN", to: "SPU", dep: "2027-07-18T14:40", arr: "2027-07-18T16:50", carrier: "Ryanair", stops: 0 },
              { dir: "back", from: "SPU", to: "NRN", dep: "2027-07-29T17:20", arr: "2027-07-29T19:30", carrier: "Ryanair", stops: 0 }
            ]
          },
          {
            id: "ou", label: "Croatia Airlines ab DUS, via Zagreb",
            price: { mode: "person", currency: "EUR", adult: 331 },
            legs: [
              { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T07:05", arr: "2027-07-18T12:40", carrier: "Croatia Airlines", stops: 1 },
              { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T13:30", arr: "2027-07-29T18:50", carrier: "Croatia Airlines", stops: 1 }
            ]
          }
        ]
      },
      {
        id: "parken", cat: "flights", name: "Parken am Flughafen", icon: "park", status: "paid",
        note: "P7 Holiday · 12 Tage · Auto 25 min",
        options: [{ id: "p", label: "P7 Holiday", price: { mode: "unit", currency: "EUR", unit: 96 } }]
      },
      {
        id: "villa", cat: "stay", name: "Villa Maslina, Makarska", status: "booked",
        booking: { provider: "Booking", cancelUntil: "2027-06-01" },
        payments: [{ amount: 400, note: "Anzahlung" }],
        options: [{
          id: "v", label: "Apartment, 2 Schlafzimmer",
          price: { mode: "unit", currency: "EUR", unit: 148, qty: 11 },
          stay: { stars: 4, rating: 89, nights: 11, facts: ["2 Schlafzimmer", "350 m zum Strand"] }
        }]
      },
      {
        id: "auto", cat: "transport", name: "Mietwagen", icon: "car", status: "chosen",
        note: "Kompaktklasse · 11 Tage · ab Flughafen Split",
        options: [{ id: "m", label: "Kompaktklasse", price: { mode: "unit", currency: "EUR", unit: 35, qty: 11 } }]
      },
      {
        id: "faehre", cat: "transport", name: "Fähre nach Brač", icon: "ship", status: "idea",
        note: "Makarska → Sumartin, hin und zurück, mit Auto",
        options: [{ id: "f", label: "Jadrolinija", price: { mode: "unit", currency: "EUR", unit: 62 } }]
      },
      {
        id: "krka", cat: "attractions", name: "Nationalpark Krka", icon: "ticket", status: "chosen",
        options: [{ id: "k", label: "Tagesticket", price: { mode: "person", currency: "EUR", adult: 40, child: 15 } }]
      },
      {
        id: "boot", cat: "attractions", name: "Bootstour Blaue Grotte", icon: "ship", status: "idea",
        options: [{ id: "b", label: "Ganztagestour", price: { mode: "person", currency: "EUR", adult: 75, child: 45 } }]
      },
      {
        id: "essen", cat: "misc", name: "Verpflegung", icon: "food", status: "chosen",
        note: "Gemischt · 28 € pro Person und Tag",
        options: [{ id: "e", label: "Gemischt", estimate: true, price: { mode: "person", currency: "EUR", adult: 28, qty: 11 } }]
      },
      {
        id: "vers", cat: "misc", name: "Reiseversicherung", icon: "shield", status: "paid",
        note: "Familie · Rücktritt und Krankheit",
        options: [{ id: "r", label: "Familientarif", price: { mode: "unit", currency: "EUR", unit: 89 } }]
      }
    ]
  };
}
