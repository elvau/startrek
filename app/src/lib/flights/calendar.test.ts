import { describe, expect, it } from "vitest";
import { calendarCells, calendarJobs, fromCalendar, parseCalendarQuery, searchCalendar } from "./calendar";

const q = { from: ["DUS", "CGN"], to: ["PMI"], month: "2027-08", oneWay: false };
const row = (dep: string, ret: string | undefined, price: number, transfers = 0, rt = 0) => ({ departure_at: dep + "T06:00:00+02:00", ...(ret ? { return_at: ret + "T18:00:00+02:00" } : {}), price, transfers, return_transfers: rt });

describe("Preiskalender (Richtpreise)", () => {
  it("Anfrage prüfen: Codes, Monat", () => {
    expect(parseCalendarQuery({ from: ["dus", "x", "DUS"], to: ["PMI"], month: "2027-08", oneWay: true })).toEqual({ from: ["DUS"], to: ["PMI"], month: "2027-08", oneWay: true });
    expect(parseCalendarQuery({ from: [], to: ["PMI"], month: "2027-08" })).toMatch(/Codes/);
    expect(parseCalendarQuery({ from: ["DUS"], to: ["PMI"], month: "2027-13" })).toMatch(/Monat/);
  });
  it("hin und zurück: Rückflug im selben und im nächsten Monat, je Abflughafen", () => {
    const jobs = calendarJobs(q);
    expect(jobs).toHaveLength(4);
    expect(jobs.map(p => `${p.get("origin")} ${p.get("return_at")}`)).toEqual(["DUS 2027-08", "DUS 2027-09", "CGN 2027-08", "CGN 2027-09"]);
    expect(calendarJobs({ ...q, oneWay: true, direct: true })[0].get("one_way")).toBe("true");
    expect(calendarJobs({ ...q, month: "2027-12" })[1].get("return_at")).toBe("2028-01");
  });
  it("je Tagespaar der günstigste Preis und die wenigsten Umstiege; fremder Monat fällt raus", () => {
    const days = fromCalendar([{ data: [row("2027-08-12", "2027-08-19", 89, 1), row("2027-08-12", "2027-08-19", 120, 0), row("2027-08-12", "2027-08-20", 99), row("2027-09-01", "2027-09-08", 50)] },
      { data: [row("2027-08-13", "2027-08-20", 140, 0, 1)] }], q);
    expect(days).toEqual([
      { out: "2027-08-12", back: "2027-08-19", price: 89, stops: 0 },
      { out: "2027-08-12", back: "2027-08-20", price: 99, stops: 0 },
      { out: "2027-08-13", back: "2027-08-20", price: 140, stops: 1 }
    ]);
    expect(calendarCells(days, "out")).toEqual([{ day: "2027-08-12", min: 89, stops: 0, count: 2 }, { day: "2027-08-13", min: 140, stops: 1, count: 1 }]);
    expect(calendarCells(days, "back", "2027-08-12").map(c => [c.day, c.min])).toEqual([["2027-08-19", 89], ["2027-08-20", 99]]);
  });
  it("Token im Kopf; ein Fehler zählt nur, wenn nichts durchkommt", async () => {
    const seen: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>)["x-access-token"]);
      if (url.includes("CGN")) return new Response("x", { status: 500 });
      return new Response(JSON.stringify({ data: [row("2027-08-12", undefined, 70)] }));
    }) as unknown as typeof fetch;
    const days = await searchCalendar({ ...q, oneWay: true }, "geheim", f);
    expect(days).toEqual([{ out: "2027-08-12", price: 70, stops: 0 }]);
    expect(seen.every(t => t === "geheim")).toBe(true);
    await expect(searchCalendar({ ...q, from: ["CGN"], oneWay: true }, "geheim", f)).rejects.toThrow(/500/);
  });
});
