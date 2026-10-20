import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Trip } from "./model";
import { totals } from "./calc";
import { breakPkg, createPackage, pkgCompare, pkgInfo, pkgOf, pkgState, restorePkg, setStatus } from "./package";
import { activeOption } from "./calc";
import { uid, type Item } from "./model";
import { importToTrip } from "./import/apply";

const trip = (): Trip => ({ id: "t", name: "Mallorca", autoName: false, place: "Palma", country: "ES", from: "2027-05-10", to: "2027-05-17",
  travelers: [1, 2, 3, 4].map(i => ({ id: `p${i}`, name: `P${i}`, household: i < 3 ? "A" : "B" })), items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS } });

describe("Pauschalreise als Posten (#188)", () => {
  it("von Hand: Unterkunft mit Paketpreis, Flug und Transfer zu 0 €, gemeinsame Kennung", () => {
    const tr = trip();
    const [st, fl, tf] = createPackage(tr, { provider: "Reisebüro", price: 796, parts: ["flights", "stay", "transport"], url: "https://example.com/p" });
    expect([st.cat, fl.cat, tf.cat]).toEqual(["stay", "flights", "transport"]);
    expect(st).toMatchObject({ from: "2027-05-10", to: "2027-05-17" });
    expect(tf.hint).toBe("transfer");
    expect(pkgOf(st)).toEqual({ id: expect.any(String), main: true, off: false, active: true });
    expect(pkgOf(fl)?.id).toBe(pkgOf(st)?.id);
    const info = pkgInfo(tr, pkgOf(st)!.id)!;
    expect(info.main).toBe(st);
    expect(info.parts).toEqual([fl, tf]);
    expect(st.options[0].source).toMatchObject({ name: "Reisebüro", url: "https://example.com/p" });
    const T = totals(tr);
    // Paketpreis plus automatisch geschätzte Kurtaxe (Mallorca 2 € × 7 Nächte × 4)
    expect(T.items[st.id].gross).toBe(796 + 56);
    expect(T.items[tf.id].gross).toBe(0);
    // Paketpreis nach Nächten auf die Familien verteilt wie bei jeder Unterkunft
    expect(Object.values(T.items[st.id].per).reduce((a, b) => a + b, 0)).toBeCloseTo(796 + 56);
  });
  it("Status gilt für alle Teile", () => {
    const tr = trip();
    const [st, fl] = createPackage(tr, { price: 500, parts: ["stay", "flights"] });
    setStatus(tr, fl, "booked");
    expect([st.status, fl.status]).toEqual(["booked", "booked"]);
    setStatus(tr, st, "paid");
    expect(fl.status).toBe("paid");
    expect(createPackage(trip(), { parts: [] })).toEqual([]);
  });
  it("Import einer Pauschalreise: gleiche Kennung an Flug, Unterkunft und enthaltenem Transfer; in bestehende Reise ohne Ziel und Name zu ändern", () => {
    const tr = trip();
    importToTrip(tr, { kind: "package", place: "Alcúdia", title: "Anderer Name", price: { total: 900 }, flights: { legs: [{ dir: "out", from: "DUS", to: "PMI" }] }, stay: { name: "Hotel Sol" }, transfer: { included: true } }, "2026-10-20T12:00:00Z", true);
    expect([tr.place, tr.name]).toEqual(["Palma", "Mallorca"]);
    const ids = tr.items.map(i => pkgOf(i)?.id);
    expect(new Set(ids).size).toBe(1);
    expect(tr.items.filter(i => pkgOf(i)?.main).map(i => i.cat)).toEqual(["stay"]);
  });
});

describe("Paket gegen einzeln, aufbrechen (#460)", () => {
  const alt = (it: Item, label: string, unit: number) => { const o = { id: uid(), label, price: { ...it.options[0].price, unit } }; delete (o as { pkg?: unknown }).pkg; it.options.push(o); return o; };
  it("eigene Angebote ändern nichts, bis man wählt; Vergleich erst mit Flug und Unterkunft einzeln", () => {
    const tr = trip();
    const [st, fl, tf] = createPackage(tr, { price: 800, parts: ["stay", "flights", "transport"] });
    const info = () => pkgInfo(tr, pkgOf(st)!.id)!;
    alt(st, "Hotel einzeln", 420);
    expect(activeOption(st, tr)?.pkg).toBeTruthy();
    expect(pkgCompare(tr, info())).toBeNull();
    alt(fl, "Flug einzeln", 500);
    const c = pkgCompare(tr, info())!;
    expect(c.single - c.pkg).toBeCloseTo(120);
    expect(c.missing).toEqual(["transport"]);
    expect(pkgState(info())).toBe("whole");
    fl.chosen = fl.options[1].id;
    expect(pkgState(info())).toBe("mixed");
    breakPkg(tr, info().id);
    expect(pkgState(info())).toBe("off");
    expect(activeOption(st, tr)?.label).toBe("Hotel einzeln");
    expect(activeOption(fl, tr)?.label).toBe("Flug einzeln");
    // Transfer ohne eigenes Angebot: leeres Angebot, „Preis fehlt“
    expect(activeOption(tf, tr)).toMatchObject({ label: "", price: { mode: "unit" } });
    restorePkg(tr, info().id);
    expect(pkgState(info())).toBe("whole");
    expect(tf.options.length).toBe(1);
    expect(activeOption(st, tr)?.pkg?.main).toBe(true);
    expect(st.options.length).toBe(2);
  });
});
