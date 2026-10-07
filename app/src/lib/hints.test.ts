import { describe, expect, it } from "vitest";
import { HINTS, hintsFor, tripCountries, warnHintsFor } from "./hints";
import { DEFAULT_SETTINGS, type Trip } from "./model";

const L = (dir: "out" | "via" | "back", from: string, to: string, dep: string) => ({ dir, from, to, dep: `${dep}T10:00`, arr: `${dep}T18:00` });
// Eduards Reise: Quito → Galápagos → Quito → Lima → Cusco (Machu Picchu) → Rio → nach Hause
const eduard = (): Trip => ({ id: "e", name: "Südamerika", place: "Quito", country: "Ecuador", tiers: {}, settings: DEFAULT_SETTINGS,
  travelers: [{ id: "e", name: "Eduard", household: "Klein" }],
  items: [{ id: "f", cat: "flights", name: "Rundreise", status: "idea", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 1 }, legs: [
    L("out", "DUS", "UIO", "2027-04-01"), L("via", "UIO", "GPS", "2027-04-04"), L("via", "GPS", "UIO", "2027-04-09"), L("via", "UIO", "LIM", "2027-04-09"),
    L("via", "LIM", "CUZ", "2027-04-13"), L("via", "CUZ", "GIG", "2027-04-18"), L("back", "GIG", "DUS", "2027-04-22")] }] }] });
const CC: Record<string, string> = { UIO: "EC", GPS: "EC", LIM: "PE", CUZ: "PE", GIG: "BR", DUS: "DE", JFK: "US" };
const cc = (t: Trip) => tripCountries(t, n => (n === "Ecuador" ? "EC" : n === "USA" ? "US" : null), c => CC[c]);

describe("Einreise & Tipps", () => {
  it("Eduards Reise: Länder aus den Flügen, Galápagos, Machu Picchu und Cristo Redentor; keine Visa-Hinweise", () => {
    const t = eduard();
    expect(cc(t).sort()).toEqual(["BR", "EC", "PE"]);
    expect(hintsFor(t, cc(t), []).map(h => h.id)).toEqual(["galapagos", "machu", "corcovado"]);
  });
  it("nur das gewählte Angebot zählt: Alternative über die USA löst keinen ESTA-Hinweis aus", () => {
    const t = eduard();
    const alt = { id: "alt", label: "über New York", price: { mode: "unit" as const, currency: "EUR" as const, unit: 1 }, legs: [L("out", "DUS", "JFK", "2027-04-01"), L("via", "JFK", "UIO", "2027-04-02")] };
    t.items[0].options.push(alt);
    t.items[0].chosen = "o";
    expect(cc(t)).not.toContain("US");
    expect(hintsFor(t, cc(t), []).map(h => h.id)).not.toContain("us");
    t.items[0].chosen = "alt";
    expect(cc(t)).toContain("US");
    expect(hintsFor(t, cc(t), []).map(h => h.id)).toContain("us");
  });
  it("USA: ESTA; Orte auch aus Posten und Tagesplan", () => {
    const t: Trip = { ...eduard(), place: "New York", country: "USA", items: [{ id: "a", cat: "attractions", name: "Tagesausflug nach Venedig", status: "idea", options: [] }] };
    expect(hintsFor(t, cc(t), []).map(h => h.id)).toEqual(["us", "venice"]);
  });
  it("Nordkorea: Warnung für alle, auch ohne Flug (Ort im Namen)", () => {
    const t: Trip = { ...eduard(), place: "Pjöngjang", country: "Nordkorea", items: [] };
    expect(hintsFor(t, ["KP"], []).map(h => h.id)).toEqual(["kp"]);
    expect(hintsFor({ ...t, country: "" }, [], []).map(h => h.id)).toEqual(["kp"]);
  });
  it("Neue Ziele: Bali (Flughafen), Fuji-Besteigung, Osterinsel, Akropolis; Kuba und Israel als Einreise", () => {
    const base: Trip = { ...eduard(), place: "", country: "", items: [] };
    const named = (name: string): Trip => ({ ...base, items: [{ id: "a", cat: "attractions", name, status: "idea", options: [] }] });
    const bali: Trip = { ...base, items: [{ id: "f", cat: "flights", name: "Flug", status: "idea", options: [{ id: "o", label: "", price: { mode: "unit", currency: "EUR", unit: 1 }, legs: [L("out", "FRA", "DPS", "2027-05-01")] }] }] };
    expect(hintsFor(bali, ["ID"], []).map(h => h.id)).toEqual(["idn", "bali"]);
    expect(hintsFor(named("Fuji besteigen (Yoshida Trail)"), [], []).map(h => h.id)).toEqual(["fuji"]);
    // Fuji nur beim Aufstieg, nicht bei jedem Blick auf den Berg
    expect(hintsFor(named("Fuji-Blick vom Kawaguchiko"), [], []).map(h => h.id)).toEqual([]);
    expect(hintsFor(named("Ahu Tongariki auf der Osterinsel"), [], []).map(h => h.id)).toEqual(["rapanui"]);
    expect(hintsFor(named("Akropolis am Morgen"), [], []).map(h => h.id)).toEqual(["acropolis"]);
    expect(hintsFor(base, ["CU", "IL"], []).map(h => h.id)).toEqual(["il", "cu"]);
  });
  it("Gebühren als Posten: Bali, Fuji und Osterinsel in Landeswährung", () => {
    const fee = (id: string) => HINTS.find(h => h.id === id)?.fee;
    expect(fee("bali")).toMatchObject({ adult: 150000, currency: "IDR" });
    expect(fee("fuji")).toMatchObject({ adult: 4000, currency: "JPY" });
    expect(fee("rapanui")).toMatchObject({ adult: 100, currency: "USD" });
    // jede ID nur einmal
    expect(new Set(HINTS.map(h => h.id)).size).toBe(HINTS.length);
  });
});

describe("Warnhinweise zum Flugziel", () => {
  it("findet Nordkorea über Land oder Ortsnamen, sonst nichts", () => {
    expect(warnHintsFor(["KP"], "").map(h => h.id)).toEqual(["kp"]);
    expect(warnHintsFor([], "Pjöngjang").map(h => h.id)).toEqual(["kp"]);
    expect(warnHintsFor(["CN", undefined], "Peking")).toEqual([]);
  });
});
