import { describe, expect, it } from "vitest";
import { hintsFor, tripCountries } from "./hints";
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
  it("USA: ESTA; Orte auch aus Posten und Tagesplan", () => {
    const t: Trip = { ...eduard(), place: "New York", country: "USA", items: [{ id: "a", cat: "attractions", name: "Tagesausflug nach Venedig", status: "idea", options: [] }] };
    expect(hintsFor(t, cc(t), []).map(h => h.id)).toEqual(["us", "venice"]);
  });
  it("Nordkorea: Warnung für alle, auch ohne Flug (Ort im Namen)", () => {
    const t: Trip = { ...eduard(), place: "Pjöngjang", country: "Nordkorea", items: [] };
    expect(hintsFor(t, ["KP"], []).map(h => h.id)).toEqual(["kp"]);
    expect(hintsFor({ ...t, country: "" }, [], []).map(h => h.id)).toEqual(["kp"]);
  });
});
