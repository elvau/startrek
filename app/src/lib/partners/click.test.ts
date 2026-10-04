import { describe, expect, it, vi } from "vitest";
import { clickCat, clickId, countClick } from "./click";
import { clickNames, partnerList } from ".";
import { clickRows, partnerRows, type UsageReport } from "../admin/usage";

describe("Klicks auf Anbieter-Links", () => {
  it("Kennungen nur aus Buchstaben, Ziffern und Bindestrich", () => {
    expect(clickId("getYourGuide")).toBe("getyourguide");
    expect(clickId("Booking.com Taxi")).toBe("booking-com-taxi");
    expect(clickId("Travelpayouts, Duffel")).toBe("travelpayouts-duffel");
    expect(clickId("x".repeat(60))).toHaveLength(40);
    expect(clickCat("flights")).toBe("flights");
    expect(clickCat("Stay 2")).toBe("stay");
  });

  it("sendet nur Partner und Kategorie, nebenher per sendBeacon", () => {
    const sendBeacon = vi.fn(() => true);
    countClick("Viator", "activity", "https://dienst.example", { sendBeacon });
    expect(sendBeacon).toHaveBeenCalledWith("https://dienst.example/click", JSON.stringify({ p: "viator", c: "activity" }));
  });

  it("ohne Such-Dienst oder ohne Kennung nichts senden", () => {
    const sendBeacon = vi.fn(() => true);
    countClick("Viator", "activity", "", { sendBeacon });
    countClick("", "activity", "https://dienst.example", { sendBeacon });
    countClick("!!!", "activity", "https://dienst.example", { sendBeacon });
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("klappt sendBeacon nicht, per fetch mit keepalive", () => {
    const f = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", f);
    countClick("Kiwitaxi", "transfer", "https://dienst.example", { sendBeacon: () => false });
    expect(f).toHaveBeenCalledWith("https://dienst.example/click", { method: "POST", body: JSON.stringify({ p: "kiwitaxi", c: "transfer" }), keepalive: true });
    vi.unstubAllGlobals();
  });

  it("Admin-Ansicht: je Partner und Kategorie, meistgeklickt zuerst, mit Anzeigenamen", () => {
    const rep: UsageReport = {
      at: "", days: ["2026-10-03", "2026-10-04"], errors: {}, config: {},
      series: [
        { kind: "route", name: "flights", detail: "", byDay: [9, 9] },
        { kind: "click", name: "tiqets", detail: "activity", byDay: [1, 0] },
        { kind: "click", name: "getyourguide", detail: "activity", byDay: [2, 3] }
      ]
    };
    const rows = clickRows(rep, clickNames());
    expect(rows.map(r => r.label)).toEqual(["GetYourGuide · activity", "Tiqets · activity"]);
    expect(rows[0]).toMatchObject({ value: 3, week: [2, 3], share: null });
    expect(clickRows({ ...rep, series: [] })).toEqual([]);
  });

  it("Partnerliste: Status nach Kennung und Schalter, Klicks über alle Kategorien", () => {
    const rep = (on: boolean): UsageReport => ({
      at: "", days: ["2026-10-03", "2026-10-04"], errors: {}, config: { partnerLinks: on },
      series: [{ kind: "click", name: "viator", detail: "activity", byDay: [1, 2] }, { kind: "click", name: "viator", detail: "attractions", byDay: [0, 1] }]
    });
    const by = (r: UsageReport | null) => Object.fromEntries(partnerRows(r, partnerList()).map(x => [x.id, x]));
    expect(by(rep(true)).viator).toMatchObject({ state: "active", clicks: 4, net: "direct", cat: "activity" });
    expect(by(rep(false)).viator.state).toBe("ready");
    expect(by(rep(true)).booking).toMatchObject({ state: "neutral", clicks: 0 });
    expect(by(null).viator).toMatchObject({ state: "ready", clicks: 0 });
    const off = partnerRows(null, [{ id: "x", click: "x", name: "X", cat: "car", tagged: true, off: true }]);
    expect(off[0].state).toBe("off");
  });
});
