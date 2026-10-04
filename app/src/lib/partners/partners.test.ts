import { describe, expect, it } from "vitest";
import { PARTNERS, partnerLink, partnersOf, sponsoredAny, type PartnerId } from ".";

const stay = { place: "Trogir", country: "Croatia", checkin: "2027-07-18", checkout: "2027-07-25", adults: 2, childAges: [8], rooms: 1 };
const fl = { from: "DUS", to: "SPU", depart: "2027-07-18", ret: "2027-07-29", adults: 2, children: 0, infants: 0 };
const act = { place: "Split", from: "2027-07-18", to: "2027-07-29" };
const cw = { ap: "PMI", pick: "2026-10-15T13:00", drop: "2026-10-19T16:00", days: 4 };
/** passende Beispielangaben je Kategorie */
const Q: Record<string, unknown> = { flight: fl, stay, activity: act, food: "Split", car: { w: cw, place: "Palma" } };

const ids = Object.keys(PARTNERS) as PartnerId[];

describe("Partner-Verzeichnis", () => {
  it("jeder Partner liefert einen https-Link, mit und ohne Partner-Links", () => {
    for (const id of ids) for (const on of [false, true]) {
      const l = partnerLink(id, Q[PARTNERS[id].cat] as never, on);
      expect(l, id).not.toBeNull();
      expect(new URL(l!.url).protocol, id).toBe("https:");
      expect(l!.name, id).toBeTruthy();
    }
  });

  it("ohne Schalter keine Partnerkennung und nichts gekennzeichnet", () => {
    for (const id of ids) {
      const l = partnerLink(id, Q[PARTNERS[id].cat] as never, false)!;
      expect(l.sponsored, id).toBe(false);
      expect(l.url, id).not.toMatch(/[?&](pid|mcid|marker)=/);
    }
  });

  it("mit Schalter: Kennung nur bei freigeschalteten Partnern (Viator)", () => {
    const v = partnerLink("viator", act, true)!;
    expect(v.sponsored).toBe(true);
    expect(v.url).toBe("https://www.viator.com/de-DE/searchResults/all?text=Split&pid=P00322974&mcid=42383&medium=link");
    expect(partnerLink("viator", act, false)!.url).toBe("https://www.viator.com/de-DE/searchResults/all?text=Split");
    // ohne Kennung im Verzeichnis bleibt der Link neutral, auch wenn der Schalter an ist
    const g = partnerLink("getYourGuide", act, true)!;
    expect(g.sponsored).toBe(false);
    expect(g.url).toBe("https://www.getyourguide.de/s/?q=Split&date_from=2027-07-18&date_to=2027-07-29");
  });

  it("Hinweis zum Sternchen nur, wenn ein Partner-Link dabei ist", () => {
    expect(sponsoredAny(partnersOf("activity"), act, true)).toBe(true);
    expect(sponsoredAny(partnersOf("activity"), act, false)).toBe(false);
    expect(sponsoredAny(partnersOf("car"), Q.car, true)).toBe(false);
  });

  it("Kategorien in der Reihenfolge des Verzeichnisses", () => {
    expect(partnersOf("activity")).toEqual(["getYourGuide", "viator", "tiqets"]);
    expect(partnersOf("stay")).toEqual(["booking", "airbnb"]);
    expect(partnersOf("car")).toEqual(["kayakCars", "check24Cars", "discoverCars"]);
    expect(partnersOf("transfer")).toHaveLength(5);
    expect(partnersOf("insurance")).toHaveLength(4);
  });

  it("vorausgefüllte Angaben: Mietwagen mit Zeitfenster, Flüge mit Namen für Google", () => {
    expect(partnerLink("kayakCars", { w: cw, place: "Palma" }, false)!.url).toBe("https://www.kayak.de/cars/PMI/2026-10-15-13h/2026-10-19-16h");
    // ohne Zeitfenster kein KAYAK-Link, die anderen Mietwagen-Links bleiben
    expect(partnerLink("kayakCars", { w: null, place: "Palma" }, false)).toBeNull();
    expect(partnerLink("check24Cars", { w: null, place: "Palma" }, false)).not.toBeNull();
    const g = new URL(partnerLink("googleFlights", { ...fl, fromName: "London" }, false)!.url).searchParams.get("q");
    expect(g).toContain("von London nach SPU");
    // Skyscanner nur mit Flughafencodes
    expect(partnerLink("skyscanner", { ...fl, to: "Split" }, false)).toBeNull();
    expect(partnerLink("booking", stay, false)!.url).toContain("ss=Trogir%2C+Croatia");
  });
});
