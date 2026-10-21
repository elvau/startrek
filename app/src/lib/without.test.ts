import { describe, expect, it } from "vitest";
import type { Trip } from "./model";
import { newPoll, VETO } from "./together";
import { applyOption, familyOf, vetoedIds, vetoNotes, without } from "./without";

const trip = (): Trip => ({
  id: "t", name: "Malle", place: "", country: "", from: "2027-06-10", to: "2027-06-14",
  travelers: [
    { id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 42 },
    { id: "c", name: "Cleo", household: "Aram", age: 35 }, { id: "d", name: "Dani", household: "Aram", age: 36 }
  ],
  items: [
    { id: "f", cat: "attractions", name: "Bootstour", status: "idea", options: [{ id: "fo", label: "Boot", price: { mode: "person", currency: "EUR", adult: 200 } }] },
    { id: "h", cat: "stay", name: "Ferienhaus", status: "idea", options: [
      { id: "h1", label: "Finca", price: { mode: "unit", currency: "EUR", unit: 1200 } },
      { id: "h2", label: "Hotel", price: { mode: "unit", currency: "EUR", unit: 300, capacity: 2, multiply: true } }] },
  ],
  tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
});

describe("„Ohne mich“ durchrechnen (#439)", () => {
  it("pro Person fällt weg, pro Einheit bleibt und verteilt sich; die Reise bleibt unverändert", () => {
    const t = trip(), before = JSON.stringify(t);
    const p = newPoll("Wo?", "offers", [{ label: "Finca", itemId: "h", optionId: "h1" }, { label: "Hotel", itemId: "h", optionId: "h2" }]);
    const w = without(t, ["c"], tr => applyOption(tr, p, p.options[0].id));
    expect(w.before).toEqual({ total: 2000, people: 4, perPerson: 500 });
    expect(w.after).toEqual({ total: 1800, people: 3, perPerson: 600 });
    expect(w.dropped).toEqual(["Bootstour"]);
    expect(w.stays).toEqual([{ name: "Ferienhaus", net: 1200 }]);
    expect(w.fewer).toEqual([]);
    expect(JSON.stringify(t)).toBe(before);
  });

  it("mehrere Einheiten: eine weniger (Zimmer)", () => {
    const p = newPoll("Wo?", "offers", [{ label: "Hotel", itemId: "h", optionId: "h2" }]);
    const w = without(trip(), ["c", "d"], tr => applyOption(tr, p, p.options[0].id));
    expect(w.fewer).toEqual([{ name: "Ferienhaus", before: 2, after: 1 }]);
    expect(w.after.total).toBe(400 + 300);
  });

  it("wer wegfällt: Person, mit Familie der ganze Haushalt; Unbekannte und Inaktive zählen nicht", () => {
    const t = trip();
    t.travelers[1].active = false;
    const votes = { a: { x: VETO }, c: { x: VETO }, "u:konto": { x: VETO }, d: { x: 1 } };
    expect(vetoedIds(t, votes, "x").sort()).toEqual(["a", "c"]);
    expect(vetoedIds(t, votes, "x", { c: { x: { f: true } }, a: { x: { f: true } } }).sort()).toEqual(["a", "c", "d"]);
    expect(familyOf(t, "c").map(x => x.id)).toEqual(["d"]);
    expect(without(t, ["b"]).ids).toEqual([]);
  });

  it("Info an Abstimmende: neu nicht dabei bzw. doch wieder dabei, mit Preis pro Person vorher und jetzt", () => {
    const p = newPoll("Wo?", "offers", [{ label: "Finca", itemId: "h", optionId: "h1" }, { label: "Hotel", itemId: "h", optionId: "h2" }]);
    const [fi] = p.options;
    expect(vetoNotes(trip(), p, { [fi.id]: ["c"] }, {})).toEqual([{ option: fi.id, label: "Finca", gone: ["Cleo"], back: [], before: 500, after: 600 }]);
    expect(vetoNotes(trip(), p, {}, { [fi.id]: ["c"] })).toEqual([{ option: fi.id, label: "Finca", gone: [], back: ["Cleo"], before: 600, after: 500 }]);
    expect(vetoNotes(trip(), p, { [fi.id]: ["c"] }, { [fi.id]: ["c"] })).toEqual([]);
  });

  it("Varianten (#432): Info an der jeweiligen Variante gerechnet", () => {
    const p = newPoll("Welche?", "variants", [{ label: "Malle", tripId: "t" }, { label: "Hamburg", tripId: "t2" }]);
    const [, hh] = p.options;
    // Hamburg: nur die Bootstour pro Person (200 €), ohne Ferienhaus
    const hamburg: Trip = { ...trip(), id: "t2", items: [trip().items[0]] };
    expect(vetoNotes(trip(), p, { [hh.id]: ["c"] }, {}, undefined, o => (o === hh.id ? hamburg : trip()))).toEqual([{ option: hh.id, label: "Hamburg", gone: ["Cleo"], back: [], before: 200, after: 200 }]);
  });
});

