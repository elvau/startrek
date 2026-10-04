import { describe, expect, it } from "vitest";
import { airbnbLink, bookingLink, getYourGuideLink, googleFlightsLink, skyscannerLink, tiqetsLink, viatorLink } from "./links";

const stay = { place: "Trogir", country: "Croatia", checkin: "2027-07-18", checkout: "2027-07-25", adults: 2, childAges: [8, 1], rooms: 1 };
const fl = { from: "DUS", to: "SPU", depart: "2027-07-18", ret: "2027-07-29", adults: 2, children: 1, infants: 1 };

describe("Direkt beim Anbieter suchen", () => {
  it("Booking.com mit Ort, Daten, Gästen und Kinderalter", () => {
    const u = new URL(bookingLink(stay));
    expect(u.hostname).toBe("www.booking.com");
    expect(u.searchParams.get("ss")).toBe("Trogir, Croatia");
    expect(u.searchParams.get("checkin")).toBe("2027-07-18");
    expect(u.searchParams.get("group_adults")).toBe("2");
    expect(u.searchParams.getAll("age")).toEqual(["8", "1"]);
  });
  it("Airbnb: Kinder und Babys getrennt", () => {
    const u = new URL(airbnbLink(stay));
    expect(u.pathname).toBe("/s/Trogir--Croatia/homes");
    expect(u.searchParams.get("children")).toBe("1");
    expect(u.searchParams.get("infants")).toBe("1");
  });
  it("Google Flüge mit Strecke, Daten und Personen", () => {
    const q = new URL(googleFlightsLink(fl)).searchParams.get("q");
    expect(q).toBe("Flüge von DUS nach SPU am 2027-07-18 zurück am 2027-07-29 2 Erwachsene 1 Kinder 1 Babys");
  });
  it("Skyscanner nur mit Flughafencodes", () => {
    expect(skyscannerLink(fl)).toBe("https://www.skyscanner.de/transport/flights/dus/spu/270718/270729/?adultsv2=2&cabinclass=economy&childrenv2=8%7C1");
    expect(skyscannerLink({ ...fl, to: "Split" })).toBeNull();
    expect(skyscannerLink({ ...fl, ret: undefined })).toContain("/270718/?");
  });
});

describe("Erlebnisse beim Anbieter suchen", () => {
  it("GetYourGuide mit Ort und Reisezeitraum, Viator und Tiqets mit Ort", () => {
    const u = new URL(getYourGuideLink({ place: "Split", from: "2027-07-18", to: "2027-07-29" }));
    expect(u.hostname).toBe("www.getyourguide.de");
    expect(Object.fromEntries(u.searchParams)).toEqual({ q: "Split", date_from: "2027-07-18", date_to: "2027-07-29" });
    expect(getYourGuideLink({ place: "Split" })).toBe("https://www.getyourguide.de/s/?q=Split");
    expect(viatorLink({ place: "Plitvicer Seen" })).toBe("https://www.viator.com/de-DE/searchResults/all?text=Plitvicer%20Seen");
    expect(tiqetsLink({ place: "Split" })).toBe("https://www.tiqets.com/de/search?q=Split");
  });
});
