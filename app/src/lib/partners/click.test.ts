import { describe, expect, it, vi } from "vitest";
import { clickCat, clickId, countClick } from "./click";
import { clickNames } from ".";
import { clickRows, type UsageReport } from "../admin/usage";

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
});
