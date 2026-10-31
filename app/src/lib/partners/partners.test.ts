import { describe, expect, it } from "vitest";
import { expediaMisId } from "./expedia";
import { parkQuery } from "./park";
import { AWIN_PUBLISHER, CJ_PUBLISHER, PARTNERS, cj, fillOf, partnerLink, partnersOf, sponsoredAny, type PartnerId } from ".";

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
    expect(sponsoredAny(partnersOf("car"), Q.car, true)).toBe(true);
    expect(sponsoredAny(["kayakCars", "check24Cars"], Q.car, true)).toBe(false);
  });

  it("Kategorien in der Reihenfolge des Verzeichnisses", () => {
    expect(partnersOf("activity")).toEqual(["getYourGuide", "viator", "tiqets", "klook", "expediaActivities"]);
    expect(partnersOf("stay")).toEqual(["booking", "airbnb", "expediaHotels"]);
    expect(partnersOf("car")).toEqual(["kayakCars", "check24Cars", "discoverCars", "expediaCars"]);
    expect(partnersOf("flight")).toEqual(["googleFlights", "skyscanner", "expediaFlights", "expediaPackage"]);
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
  it("CJ: Ziel-Link über anrdoezrs.net mit PID und Link-ID", () => {
    const u = new URL(cj(12345)("https://www.getyourguide.de/s/?q=Rom"));
    expect(u.origin + u.pathname).toBe(`https://www.anrdoezrs.net/click-${CJ_PUBLISHER}-12345`);
    expect(u.searchParams.get("url")).toBe("https://www.getyourguide.de/s/?q=Rom");
  });
  it("eSIM: Yesim und Airalo über Travelpayouts, nur mit Partner-Links an", () => {
    expect(partnersOf("esim")).toEqual(["yesim", "airalo"]);
    const u = new URL(partnerLink("airalo", undefined, true)!.url);
    expect([u.origin, u.searchParams.get("p"), u.searchParams.get("campaign_id"), u.searchParams.get("u")]).toEqual(["https://tp.media", "8310", "541", "https://www.airalo.com/"]);
    expect(new URL(partnerLink("yesim", undefined, true)!.url).searchParams.get("p")).toBe("5998");
    expect(partnerLink("yesim", undefined, false)).toMatchObject({ url: "https://yesim.app/", sponsored: false });
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
    for (const [id, mid] of [["airparks", "14699"], ["holidayExtras", "55335"], ["hanseMerkur", "11705"]] as const) {
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

describe("Expedia DACH über CJ (Link-ID 15261175)", () => {
  const E = ["expediaFlights", "expediaPackage", "expediaHotels", "expediaActivities", "expediaCars"] as const;
  it("mit Partner-Links über anrdoezrs.net, Ziel auf expedia.de; ohne direkt", () => {
    for (const id of E) {
      const on = partnerLink(id, Q[PARTNERS[id].cat] as never, true)!;
      const u = new URL(on.url);
      expect(u.origin + u.pathname, id).toBe(`https://www.anrdoezrs.net/click-${CJ_PUBLISHER}-15261175`);
      expect(new URL(u.searchParams.get("url")!).origin, id).toBe("https://www.expedia.de");
      expect(on.sponsored, id).toBe(true);
      const off = partnerLink(id, Q[PARTNERS[id].cat] as never, false)!;
      expect(off.url.startsWith("https://www.expedia.de/"), id).toBe(true);
      expect(off.sponsored, id).toBe(false);
    }
  });
  it("Hotel: Ziel, Zeitraum, Erwachsene je Zimmer, Kinder mit Alter, Haustiere", () => {
    const u = new URL(partnerLink("expediaHotels", stay, false)!.url);
    expect(u.pathname).toBe("/Hotel-Search");
    expect(Object.fromEntries(u.searchParams)).toEqual({ destination: "Trogir, Croatia", startDate: "2027-07-18", endDate: "2027-07-25", rooms: "1", adults: "2", children: "1_8" });
    const two = new URL(partnerLink("expediaHotels", { ...stay, adults: 5, childAges: [8, 3], rooms: 2, pets: true }, false)!.url).searchParams;
    expect([two.get("rooms"), two.get("adults"), two.get("children"), two.get("amenities")]).toEqual(["2", "3,2", "1_8,2_3", "PETS"]);
  });
  it("Flug: Hin- und Rückflug mit Datum TT.MM.JJJJ, Kinder und Babys mit Alter", () => {
    const u = new URL(partnerLink("expediaFlights", { ...fl, children: 1, infants: 1 }, false)!.url).searchParams;
    expect([u.get("trip"), u.get("leg1"), u.get("leg2"), u.get("passengers")]).toEqual([
      "roundtrip", "from:DUS,to:SPU,departure:18.07.2027TANYT", "from:SPU,to:DUS,departure:29.07.2027TANYT", "adults:2,children:2[8;1],infantinlap:N"
    ]);
    const one = new URL(partnerLink("expediaFlights", { ...fl, ret: undefined }, false)!.url).searchParams;
    expect([one.get("trip"), one.get("leg2"), one.get("passengers")]).toEqual(["oneway", null, "adults:2,children:0,infantinlap:N"]);
  });
  it("Flug + Hotel: nur mit Rückflug, Ziel als Name, wenn bekannt", () => {
    expect(partnerLink("expediaPackage", { ...fl, ret: undefined }, true)).toBeNull();
    const u = new URL(partnerLink("expediaPackage", { ...fl, toName: "Split" }, false)!.url);
    expect(u.pathname).toBe("/Hotel-Search");
    const { misId, ...rest } = Object.fromEntries(u.searchParams);
    expect(rest).toEqual({ packageType: "fh", searchProduct: "hotel", adults: "2", tripType: "ROUND_TRIP", cabinClass: "COACH", startDate: "2027-07-18", endDate: "2027-07-29", destination: "Split", origin: "DUS", originAirportCode: "DUS" });
    expect(misId).toBe(expediaMisId([["DUS", "2027-07-18"], ["SPU", "2027-07-29"]]));
    // ohne Flughafencodes: Startseite Flug + Hotel
    expect(partnerLink("expediaPackage", { ...fl, to: "Split" }, false)!.url).toBe("https://www.expedia.de/Flug-und-Hotel");
  });
  it("misId wie von Expedia getestet (DUS 10.05. → BCN 14.05.2027)", () => {
    expect(expediaMisId([["DUS", "2027-05-10"], ["BCN", "2027-05-14"]])).toBe("~ARIHGgUIAhIBCBooCAESEQoDRFVTKgoyMDI3LTA1LTEwEhEKA0JDTioKMjAyNy0wNS0xNA");
  });
  it("Mietwagen: Flughafen und Zeiten (12 h mit AM/PM), sonst nur Ort, ohne Ort kein Link", () => {
    const u = new URL(partnerLink("expediaCars", { w: cw, place: "Palma" }, false)!.url);
    expect(u.pathname).toBe("/carsearch");
    expect(Object.fromEntries(u.searchParams)).toEqual({ locn: "PMI", date1: "15.10.2026", time1: "0100PM", date2: "19.10.2026", time2: "0400PM" });
    expect(new URL(partnerLink("expediaCars", { w: { ...cw, pick: "2026-10-15T00:30", drop: "2026-10-19T09:00", dropAp: "IBZ" }, place: "" }, false)!.url).searchParams.toString())
      .toBe("locn=PMI&loc2=IBZ&date1=15.10.2026&time1=1230AM&date2=19.10.2026&time2=0900AM");
    expect(partnerLink("expediaCars", { w: null, place: "Palma" }, false)!.url).toBe("https://www.expedia.de/carsearch?locn=Palma");
    expect(partnerLink("expediaCars", { w: null, place: "" }, false)).toBeNull();
  });
  it("Aktivitäten: Ort und Zeitraum", () => {
    expect(partnerLink("expediaActivities", act, false)!.url).toBe("https://www.expedia.de/things-to-do/search?location=Split&startDate=2027-07-18&endDate=2027-07-29");
  });
});

describe("Suchlinks: vorausgefüllt oder nur Startseite (#619)", () => {
  it("aus dem Verzeichnis abgeleitet (home())", () => {
    expect(fillOf("googleFlights")).toBe("search");
    expect(fillOf("booking")).toBe("search");
    expect(fillOf("kiwitaxi")).toBe("home");
    expect(fillOf("check24Cars")).toBe("home");
    expect(partnerLink("kiwitaxi", undefined as never, true)!.fill).toBe("home");
  });
  it("Flüge und Unterkünfte haben vorausgefüllte Suchen, Fähren nur Startseiten", () => {
    expect(partnersOf("flight").every(id => fillOf(id) === "search")).toBe(true);
    expect(partnersOf("stay").every(id => fillOf(id) === "search")).toBe(true);
    expect(partnersOf("ferry").every(id => fillOf(id) === "home")).toBe(true);
  });
});
