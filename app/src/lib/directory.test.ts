import { describe, expect, it } from "vitest";
import { parseDir, toWrite } from "./directory.svelte";

const j = (o: object) => JSON.stringify(o);
const anna = { id: "p1", first: "Anna", last: "Otter" };
const grp = { id: "g1", name: "Familie", memberIds: ["p1"] };
const terms = { v: "2026-10-13", at: "2026-10-17" };

describe("Profil speichern (#364)", () => {
  it("schreibt den eigenen Stand, wenn das Konto unverändert oder leer ist", () => {
    const local = j({ people: [anna], groups: [] });
    expect(toWrite(local, null, "")).toBe(local);
    expect(toWrite(local, j({ people: [], groups: [] }), j({ people: [], groups: [] }))).toBe(local);
    // gleicher Stand in anderer Reihenfolge der Felder
    expect(toWrite(local, j({ groups: [], people: [anna] }), "")).toBe(local);
  });

  it("zweites Gerät überschreibt Personen und Gruppen eines anderen Geräts nicht", () => {
    // B hat beim Anmelden noch kein Profil gesehen (base leer), A hat inzwischen gespeichert
    const b = j({ people: [], groups: [], terms });
    const a = j({ people: [anna], groups: [grp] });
    const out = JSON.parse(toWrite(b, a, ""));
    expect(out.people).toEqual([anna]);
    expect(out.groups).toEqual([grp]);
    expect(out.terms).toEqual(terms);
  });

  it("Stand im Konto ohne Listen oder unlesbar: eigener Stand bleibt erhalten", () => {
    const local = j({ people: [anna], groups: [] });
    expect(JSON.parse(toWrite(local, "{}", "")).people).toEqual([anna]);
    expect(toWrite(local, "kaputt", "")).toBe(local);
  });

  it("liest fehlende oder kaputte Listen als leer", () => {
    expect(parseDir(null)).toEqual({ people: [], groups: [] });
    expect(parseDir("{}")).toEqual({ people: [], groups: [] });
    expect(parseDir("kaputt")).toEqual({ people: [], groups: [] });
    expect(parseDir(j({ people: [anna], groups: "x", terms }))).toEqual({ people: [anna], groups: [], terms });
  });
});
