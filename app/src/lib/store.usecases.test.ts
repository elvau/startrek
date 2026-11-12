import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "./model";

/*
 * Reisen auf dem Gerät (ohne Konto) verändern: Posten, Namen, einfache Einträge, einfach/detailliert, Kopien,
 * Varianten und Vergleiche, Löschen. Der Store braucht localStorage und scrollTo; im Testlauf (node) nachgebildet.
 */
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear() });
vi.stubGlobal("scrollTo", () => {});
vi.stubGlobal("location", { href: "http://localhost/", search: "", hash: "", pathname: "/", origin: "http://localhost" });

const load = () => import("./store.svelte");
/** was auf dem Gerät gespeichert ist */
const stored = (id: string): Trip | null => JSON.parse(mem.get("rk2-t:" + id) || "null");
const two = [{ id: "a", name: "Anna", household: "Klein" }, { id: "b", name: "Ben", household: "Hase" }];

beforeEach(() => { mem.clear(); vi.resetModules(); });

describe("Posten anlegen und entfernen", () => {
  it("Unterkunft übernimmt den Reisezeitraum und rechnet pauschal, Erlebnis pro Person", async () => {
    const s = await load();
    s.newTrip({ place: "Split", from: "2027-07-18", to: "2027-07-25" });
    const stay = s.addItem("stay");
    expect([stay.from, stay.to]).toEqual(["2027-07-18", "2027-07-25"]);
    expect(stay.options[0].price.mode).toBe("unit");
    expect(s.addItem("transport").options[0].price.mode).toBe("unit");
    const tour = s.addItem("attractions");
    expect(tour.options[0].price.mode).toBe("person");
    expect(tour.from).toBeUndefined();
    expect(s.app.trip.items.map(i => i.cat)).toEqual(["stay", "transport", "attractions"]);
  });

  it("neuer Posten ist zum Bearbeiten offen; entfernen schließt ihn", async () => {
    const s = await load();
    s.newTrip({ place: "Split" });
    const a = s.addItem("misc"), b = s.addItem("misc");
    expect(s.app.editing).toBe(b.id);
    s.removeItem(a.id);
    expect(s.app.editing).toBe(b.id);
    s.removeItem(b.id);
    expect(s.app.editing).toBeNull();
    expect(s.app.trip.items).toHaveLength(0);
  });
});

describe("Reise benennen", () => {
  it("eigener Name bleibt, leerer Name folgt wieder dem Ort", async () => {
    const s = await load();
    s.newTrip({ place: "Split" });
    const auto = s.app.trip.name;
    expect(auto).toContain("Split");
    s.renameTrip("  Sommer mit Oma  ");
    expect(s.app.trip.name).toBe("Sommer mit Oma");
    expect(s.app.trip.autoName).toBe(false);
    s.renameTrip("   ");
    expect(s.app.trip.autoName).toBe(true);
    expect(s.app.trip.name).toBe(auto);
  });
});

describe("Einfacher Modus: einzelne Einträge", () => {
  it("neuer Eintrag gilt für alle; abgewählte Person steht in der Auswahl, wieder alle dabei: Auswahl fällt weg", async () => {
    const s = await load();
    s.newTrip({ place: "London", travelers: [...two, { id: "c", name: "Cleo", household: "Hase" }] });
    const l = s.addLine("attractions");
    expect(l.who).toBeUndefined();
    s.toggleLineWho(l, "c");
    expect(l.who).toEqual(["a", "b"]);
    s.toggleLineWho(l, "b");
    expect(l.who).toEqual(["a"]);
    s.toggleLineWho(l, "b");
    s.toggleLineWho(l, "c");
    expect(l.who).toBeUndefined();
  });

  it("wer nicht mehr mitreist, zählt in der Auswahl nicht mit", async () => {
    const s = await load();
    s.newTrip({ place: "London", travelers: [...two, { id: "c", name: "Cleo", household: "Hase", active: false }] });
    const l = s.addLine("attractions");
    // alte Auswahl mit der inzwischen ausgestiegenen Person
    l.who = ["a", "c"];
    s.toggleLineWho(l, "b");
    expect(l.who).toBeUndefined();
  });

  it("der zurückgegebene Eintrag ist der gespeicherte (Änderungen landen in der Reise); entfernen nimmt nur ihn", async () => {
    const s = await load();
    s.newTrip({ place: "London", travelers: two });
    const a = s.addLine("attractions"), b = s.addLine("misc");
    a.label = "Stadionführung"; a.amount = 50;
    expect(s.app.trip.lines).toEqual([expect.objectContaining({ label: "Stadionführung", amount: 50 }), expect.objectContaining({ id: b.id })]);
    s.removeLine(a.id);
    expect(s.app.trip.lines!.map(x => x.id)).toEqual([b.id]);
  });
});

describe("Einfach oder detailliert", () => {
  it("ganze Reise: einfach, gemischt, detailliert", async () => {
    const s = await load();
    s.newTrip({ place: "Split", travelers: two });
    s.setAllDetailed(false);
    expect(s.tripMode()).toBe("simple");
    s.setDetailed("stay", true);
    expect(s.tripMode()).toBe("mixed");
    s.setAllDetailed(true);
    expect(s.tripMode()).toBe("detail");
  });

  it("einzelne Einträge werden beim Umschalten zu Posten mit denselben Beteiligten; leere fallen weg", async () => {
    const s = await load();
    s.newTrip({ place: "London", travelers: two });
    s.setDetailed("attractions", false);
    const tour = s.addLine("attractions"), dinner = s.addLine("attractions"), empty = s.addLine("attractions");
    Object.assign(tour, { label: "Stadionführung", amount: 50, who: ["a"] });
    Object.assign(dinner, { label: "", amount: 80 });
    void empty;
    s.setDetailed("attractions", true);
    const items = s.app.trip.items.filter(i => i.cat === "attractions" && !i.auto);
    expect(items.map(i => [i.name, i.participants, i.options[0].price.unit])).toEqual([["Stadionführung", ["a"], 50], [expect.any(String), undefined, 80]]);
    // der Eintrag ohne Text bekommt den Namen des Bereichs
    expect(items[1].name).not.toBe("");
    expect((s.app.trip.lines || []).filter(l => l.cat === "attractions")).toHaveLength(0);
  });

  it("einfacher Betrag wird beim Umschalten ein Posten pro Person, die Summe bleibt", async () => {
    const s = await load();
    s.newTrip({ place: "Split", travelers: two });
    s.setDetailed("stay", false);
    s.setSimple("stay", 300);
    s.setDetailed("stay", true, true);
    const [it] = s.app.trip.items.filter(i => i.cat === "stay");
    expect(it.options[0].price).toMatchObject({ mode: "person", adult: 150 });
    expect(s.app.editing).toBe(it.id);
  });

  it("negativer Betrag wird 0, kein Betrag löscht die Angabe", async () => {
    const s = await load();
    s.newTrip({ place: "Split" });
    s.setSimple("misc", -5);
    expect(s.app.trip.simple!.misc).toBe(0);
    s.setSimple("misc", undefined);
    expect("misc" in s.app.trip.simple!).toBe(false);
    s.setSimple("misc", NaN);
    expect("misc" in s.app.trip.simple!).toBe(false);
  });
});

describe("Kopie und Varianten", () => {
  it("Kopie: eigene Kennung, „(Kopie)“ im Namen, ohne Vergleich und ohne Katalogeintrag; das Original bleibt gespeichert", async () => {
    const s = await load();
    s.newTrip({ place: "Split", name: "Kroatien", travelers: two });
    s.app.trip.pub = { id: "p1", uid: "u", at: "2027-01-01" } as Trip["pub"];
    const orig = s.app.trip.id;
    s.duplicateTrip();
    expect(s.app.trip.id).not.toBe(orig);
    expect(s.app.trip.name).toBe("Kroatien (Kopie)");
    expect(s.app.trip.cmp).toBeUndefined();
    expect(s.app.trip.pub).toBeUndefined();
    expect(s.app.trip.travelers.map(t => t.name)).toEqual(["Anna", "Ben"]);
    expect(stored(orig)?.name).toBe("Kroatien");
    expect(stored(orig)?.pub?.id).toBe("p1");
    expect(s.allTrips().map(t => t.id).sort()).toEqual([orig, s.app.trip.id].sort());
  });

  it("Variante: selber Vergleich wie das Original, „Ort – Variante n“, ohne dessen Abstimmungen", async () => {
    const s = await load();
    s.newTrip({ place: "Durbuy", name: "Chalet-Wochenende", travelers: two });
    s.app.trip.polls = [{ id: "q", q: "Wohin?", opts: [] }] as unknown as Trip["polls"];
    const orig = s.app.trip.id;
    s.addVariant();
    const v2 = s.app.trip.id;
    expect(v2).not.toBe(orig);
    expect(s.app.trip.name).toBe("Chalet-Wochenende");
    expect(s.app.trip.polls).toBeUndefined();
    expect(s.app.trip.cmp?.label).toBe("Durbuy – Variante 2");
    // das Original steht jetzt auch im Vergleich, gespeichert
    expect(stored(orig)?.cmp?.id).toBe(s.app.trip.cmp!.id);
    expect(stored(orig)?.polls).toHaveLength(1);
    s.addVariant();
    expect(s.app.trip.cmp?.label).toBe("Durbuy – Variante 3");
    expect(s.app.home).toBe(false);
  });

  it("„Diese nehmen“: gewählt ist genau eine, die anderen sind archiviert; neu wählen dreht es um", async () => {
    const s = await load();
    s.newTrip({ place: "Durbuy", name: "Chalet", travelers: two });
    const a = s.app.trip.id;
    s.addVariant();
    const b = s.app.trip.id;
    await s.takeVariant(a);
    expect(s.tripFor(a)?.cmp?.chosen).toBeTruthy();
    expect(s.tripFor(a)?.cmp?.archived).toBeUndefined();
    expect(s.tripFor(b)?.cmp?.chosen).toBeUndefined();
    expect(s.tripFor(b)?.cmp?.archived).toBeTruthy();
    await s.takeVariant(b);
    expect(s.tripFor(b)?.cmp?.chosen).toBeTruthy();
    expect(s.tripFor(b)?.cmp?.archived).toBeUndefined();
    expect(s.tripFor(a)?.cmp?.chosen).toBeUndefined();
    expect(s.tripFor(a)?.cmp?.archived).toBeTruthy();
    // die nicht offene Reise ist auf dem Gerät geändert, nicht nur im Speicher
    expect(stored(a)?.cmp?.archived).toBeTruthy();
  });
});

describe("Vergleich aus eigenständigen Reisen", () => {
  it("zwei Reisen zusammenziehen: gemeinsamer Vergleich, Name der Reise als Name der Variante; trennen löst ihn auf", async () => {
    const s = await load();
    s.newTrip({ place: "Palma", name: "JGA Malle", travelers: two });
    const a = s.app.trip.id;
    s.newTrip({ place: "Hamburg", name: "JGA Hamburg", travelers: two });
    const b = s.app.trip.id;
    const cid = await s.joinCompare(a, b);
    expect(cid).toBeTruthy();
    expect(s.tripFor(a)?.cmp).toMatchObject({ id: cid, title: "JGA", label: "JGA Malle" });
    expect(s.tripFor(b)?.cmp).toMatchObject({ id: cid, title: "JGA", label: "JGA Hamburg" });
    // noch einmal dieselben: nichts Neues, derselbe Vergleich
    expect(await s.joinCompare(a, b)).toBe(cid);
    await s.splitCompare(cid!);
    expect(s.tripFor(a)?.cmp).toBeUndefined();
    expect(s.tripFor(b)?.cmp).toBeUndefined();
    expect(s.allTrips()).toHaveLength(2);
  });

  it("eine Reise auf sich selbst oder auf eine unbekannte ziehen ändert nichts", async () => {
    const s = await load();
    s.newTrip({ place: "Palma", name: "JGA Malle", travelers: two });
    const a = s.app.trip.id;
    expect(await s.joinCompare(a, a)).toBeNull();
    expect(await s.joinCompare(a, "gibt-es-nicht")).toBeNull();
    expect(s.app.trip.cmp).toBeUndefined();
  });
});

describe("Reise ändern, ohne sie zu öffnen", () => {
  it("nicht offene Reise: Änderung steht auf dem Gerät und in der Anzeige; unbekannte Reise: nichts", async () => {
    const s = await load();
    s.newTrip({ place: "Palma", name: "Erste", travelers: two });
    const a = s.app.trip.id;
    s.newTrip({ place: "Rom", name: "Zweite", travelers: two });
    await s.editTrip(a, t => { t.name = "Erste, umbenannt"; });
    expect(stored(a)?.name).toBe("Erste, umbenannt");
    expect(s.tripFor(a)?.name).toBe("Erste, umbenannt");
    expect(s.app.trip.name).toBe("Zweite");
    const fn = vi.fn();
    await s.editTrip("gibt-es-nicht", fn);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("Löschen", () => {
  it("offene Reise löschen: weg vom Gerät und von der Startseite, die andere bleibt", async () => {
    const s = await load();
    s.newTrip({ place: "Palma", name: "Erste", travelers: two });
    const a = s.app.trip.id;
    s.newTrip({ place: "Rom", name: "Zweite", travelers: two });
    const b = s.app.trip.id;
    await s.deleteTrip(b);
    expect(stored(b)).toBeNull();
    expect(s.allTrips().some(t => t.id === b)).toBe(false);
    expect(s.homeTrips().map(t => t.id)).toEqual([a]);
    expect(stored(a)?.name).toBe("Erste");
    expect(s.app.trip.id).not.toBe(b);
  });

  it("löschen nur, wenn die Bedingung für die Reise gilt (offene Reise: für den Stand im Fenster)", async () => {
    const s = await load();
    s.newTrip({ place: "Palma", name: "Erste", travelers: two });
    const a = s.app.trip.id;
    s.newTrip({ place: "Rom", name: "Zweite", travelers: two });
    expect(await s.deleteIf(a, t => t.place === "Rom")).toBe(false);
    expect(stored(a)).not.toBeNull();
    expect(await s.deleteIf(a, t => t.place === "Palma")).toBe(true);
    expect(stored(a)).toBeNull();
    // offene Reise: gespeichert steht noch „Rom“, im Fenster schon „Wien“; die Bedingung muss für beide gelten
    s.app.trip.place = "Wien";
    expect(await s.deleteIf(s.app.trip.id, t => t.place === "Rom")).toBe(false);
  });
});

describe("Entwurf ohne Reise (Realitätscheck)", () => {
  it("übernimmt die Wohnorte der offenen Reise als Kopie und öffnet nichts", async () => {
    const s = await load();
    s.newTrip({ place: "Palma", travelers: two, households: { Klein: { plz: "40210" } } });
    const open = s.app.trip.id;
    const d = s.draftTrip(two);
    expect(d.id).not.toBe(open);
    expect(d.households).toEqual({ Klein: { plz: "40210" } });
    d.households!.Klein.plz = "50667";
    expect(s.app.trip.households!.Klein.plz).toBe("40210");
    expect(s.app.trip.id).toBe(open);
    expect(s.allTrips().some(t => t.id === d.id)).toBe(false);
  });
});
