import { describe, expect, it } from "vitest";
import { parkQuery } from "./park";
import { AWIN_PUBLISHER, PARTNERS, partnerLink, partnersOf, sponsoredAny, type PartnerId } from ".";

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

  it("Travelpayouts: Ziel-Link über tp.media mit Marker, Projekt und Programm (Klook)", () => {
    const k = partnerLink("klook", act, true)!;
    expect(k.sponsored).toBe(true);
    const u = new URL(k.url);
    expect(u.origin + u.pathname).toBe("https://tp.media/r");
    expect(Object.fromEntries(u.searchParams)).toEqual({ campaign_id: "137", marker: "783080", p: "4110", trs: "584426", u: "https://www.klook.com/de/search/result/?query=Split" });
    expect(partnerLink("klook", act, false)!.url).toBe("https://www.klook.com/de/search/result/?query=Split");
    // freigeschaltet: Tiqets, Kiwitaxi, Welcome Pickups
    for (const [id, pp, c] of [["tiqets", "2074", "89"], ["kiwitaxi", "647", "1"], ["welcomePickups", "8919", "627"]] as const) {
      const l = new URL(partnerLink(id, Q[PARTNERS[id].cat] as never, true)!.url);
      expect([l.searchParams.get("p"), l.searchParams.get("campaign_id")], id).toEqual([pp, c]);
    }
  });

  it("Hinweis zum Sternchen nur, wenn ein Partner-Link dabei ist", () => {
    expect(sponsoredAny(partnersOf("activity"), act, true)).toBe(true);
    expect(sponsoredAny(partnersOf("activity"), act, false)).toBe(false);
    expect(sponsoredAny(partnersOf("car"), Q.car, true)).toBe(false);
  });

  it("Kategorien in der Reihenfolge des Verzeichnisses", () => {
    expect(partnersOf("activity")).toEqual(["getYourGuide", "viator", "tiqets", "klook"]);
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
  it("Parken und Fliegen über Awin: Zielseite als ued, Programm 14793, nur mit Partner-Links an", () => {
    const on = partnerLink("parkenUndFliegen", undefined, true)!;
    const u = new URL(on.url);
    expect(u.origin + u.pathname).toBe("https://www.awin1.com/cread.php");
    expect(u.searchParams.get("awinmid")).toBe("14793");
    expect(u.searchParams.get("awinaffid")).toBe(AWIN_PUBLISHER);
    expect(u.searchParams.get("ued")).toBe("https://www.parken-und-fliegen.de/");
    expect(on.sponsored).toBe(true);
    expect(partnerLink("parkenUndFliegen", undefined, false)).toMatchObject({ url: "https://www.parken-und-fliegen.de/", sponsored: false });
    expect(partnersOf("parking")[0]).toBe("parkenUndFliegen");
  });
  it("Parken und Fliegen vorausgefüllt: Flughafen, 3 h vor Abflug bis 1 h nach Landung, Personen nach Flug-Regel", () => {
    const trip = { travelers: [{ id: "a", name: "A", kind: "adult" }, { id: "b", name: "B", age: 40 }, { id: "c", name: "C", age: 7 }, { id: "d", name: "D", age: 1 }] } as never;
    const item = { id: "f", cat: "flights", name: "", status: "idea", options: [] } as never;
    const q = parkQuery(trip, item, { dir: "out", from: "dus", to: "PMI", dep: "2027-05-10T06:10", arr: "2027-05-10T08:30" }, { dir: "back", from: "PMI", to: "DUS", dep: "2027-05-17T21:40", arr: "2027-05-17T23:55" })!;
    expect(q).toEqual({ ap: "DUS", from: "2027-05-10T03:10", to: "2027-05-18T00:55", adults: 2, children: 1, infants: 1 });
    const h = new URLSearchParams(partnerLink("parkenUndFliegen", q, false)!.url.split("#/categories?")[1]);
    expect([h.get("depart"), h.get("out"), h.get("in"), h.get("park_from"), h.get("park_to"), h.get("adults"), h.get("children"), h.get("infants")])
      .toEqual(["DUS", "2027-05-10", "2027-05-18", "03:10", "00:55", "2", "1", "1"]);
    const tagged = new URL(partnerLink("parkenUndFliegen", q, true)!.url);
    expect(tagged.searchParams.get("ued")).toContain("#/categories?");
    expect(parkQuery(trip, item, undefined, undefined)).toBeUndefined();
  });
});

describe("Awin-Programme mit Kennung (10/2026)", () => {
  it("Airparks und HanseMerkur: Link über awin1.com mit awinmid, als Partner-Link; ohne Partner-Links direkt", () => {
    for (const [id, mid] of [["airparks", "14699"], ["hanseMerkur", "11705"]] as const) {
      const on = partnerLink(id, undefined, true)!;
      expect(on.url).toContain("awin1.com");
      expect(on.url).toContain(`awinmid=${mid}`);
      expect(on.url).toContain("awinaffid=3121582");
      expect(on.sponsored).toBe(true);
      const off = partnerLink(id, undefined, false)!;
      expect(off.url).not.toContain("awin1.com");
      expect(off.sponsored).toBe(false);
    }
  });
});
