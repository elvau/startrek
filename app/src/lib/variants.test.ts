import { describe, expect, it } from "vitest";
import type { Trip } from "./model";
import { asVariant, bundle, commonTitle, ensureCompare, isBundle, leaveCompare, siblings, variantLabel } from "./variants";

const trip = (id: string, place: string, country = "Frankreich"): Trip => ({ id, name: "Chalet-Wochenende", place, country, travelers: [], items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } } });

describe("Varianten als Vergleich (#428)", () => {
  it("Variante anlegen: Original kommt in einen neuen Vergleich, die Kopie in denselben", () => {
    const a = trip("a", "Signy-l'Abbaye"), b = trip("b", "Durbuy", "Belgien");
    asVariant(a, b);
    expect(a.cmp?.title).toBe("Chalet-Wochenende");
    expect(b.cmp?.id).toBe(a.cmp?.id);
    // weitere Variante: derselbe Vergleich
    const c = trip("c", "Monschau", "Deutschland");
    asVariant(a, c);
    expect(c.cmp?.id).toBe(a.cmp?.id);
    expect(ensureCompare(a)).toBe(a.cmp!.id);
    expect([a, b, c].map(variantLabel)).toEqual(["Signy-l'Abbaye", "Durbuy", "Monschau"]);
    expect(variantLabel({ ...c, cmp: { ...c.cmp!, label: "Eifel" } })).toBe("Eifel");
  });

  it("bündeln an der Stelle der ersten Variante; herausnehmen und löschen lösen den Vergleich auf", () => {
    const a = trip("a", "A"), b = trip("b", "B"), x = trip("x", "X"), c = trip("c", "C");
    asVariant(a, b); asVariant(a, c);
    const r = bundle([x, b, a, c]);
    expect(r.length).toBe(2);
    expect(r[0]).toBe(x);
    expect(isBundle(r[1]) && r[1].list.map(t => t.id)).toEqual(["b", "a", "c"]);
    expect(siblings(a, [x, b, a, c]).map(t => t.id)).toEqual(["b", "c"]);
    leaveCompare(c);
    expect(isBundle(bundle([a, b, c])[0])).toBe(true);
    // b gelöscht: nur a übrig → keine Bündelung mehr
    expect(bundle([a, c]).some(isBundle)).toBe(false);
  });

  it("Titel aus gemeinsamem Anfang der Namen", () => {
    expect(commonTitle(["JGA Malle", "JGA Hamburg", "JGA Las Vegas"])).toBe("JGA");
    expect(commonTitle(["Malle", "Hamburg"])).toBe("");
    expect(commonTitle(["Sommer – Kroatien", "Sommer – Italien"])).toBe("Sommer");
  });
});
