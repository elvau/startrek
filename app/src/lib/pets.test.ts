import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "./i18n/index.svelte";
import { askText, careDays, careEstimate, careItem, careOf, defaultCare, homeCareOn, kindsAlong, petHints, petsAlong, thanksText, updateCareItem } from "./pets";
import { bookingLink, airbnbLink } from "./links";
import { DEFAULT_SETTINGS, type Trip } from "./model";

beforeAll(() => { i18n.lang = "de"; });

const trip = (h: Trip["households"], extra: Partial<Trip> = {}): Trip => ({
  id: "t", name: "T", place: "Riva", country: "Italien", from: "2027-07-12", to: "2027-07-19",
  travelers: [{ id: "a", name: "Anna", household: "Fuchs" }, { id: "b", name: "Ben", household: "Fuchs" }, { id: "c", name: "Cem", household: "Hase" }],
  items: [], tiers: {}, settings: { ...DEFAULT_SETTINGS }, households: h, ...extra
});

describe("Haustiere (#322)", () => {
  it("übliche Betreuung je Art, abweichend einstellbar", () => {
    expect(defaultCare("dog")).toBe("bring");
    expect(defaultCare("fish")).toBe("visit");
    expect(defaultCare("reptile")).toBe("visit");
    expect(careOf({ kinds: ["cat"], care: { cat: "visit" } }, "cat")).toBe("visit");
  });
  it("Anfrage: vorbeibringen bzw. vorbeikommen, mit Zeitraum, ohne Namen", () => {
    expect(askText({ kinds: ["dog"], home: true }, "2027-07-12", "2027-07-19")).toBe("Wer kann vom 12.07. bis 19.07. unseren Hund zu sich nehmen? 🐕");
    expect(askText({ kinds: ["fish"], home: true, often: "few" }, "2027-07-12", "2027-07-19")).toBe("Wer kann vom 12.07. bis 19.07. bei uns unsere Fische füttern (etwa alle 2–3 Tage)? 🐠");
    const both = askText({ kinds: ["dog", "cat", "fish"], home: true });
    expect(both).toContain("unseren Hund und unsere Katze zu sich nehmen?");
    expect(both).toContain("Und wer kann bei uns unsere Fische füttern?");
    expect(both).toContain("während unseres Urlaubs");
  });
  it("Reist mit: nur Familien mit Tier, die mitkommen", () => {
    const tr = trip({ Fuchs: { pets: { kinds: ["dog"] } }, Hase: { pets: { kinds: ["fish"], home: true } } });
    expect(petsAlong(tr)).toBe(true);
    expect(petsAlong(tr, ["c"])).toBe(false);
    expect(kindsAlong(tr)).toEqual(["dog"]);
    expect(petsAlong(trip({ Fuchs: { pets: { kinds: ["dog"], home: true } } }))).toBe(false);
  });
  it("Hinweise: Einreise (EU bzw. außerhalb), Bandwurm für Hunde, Flug nur mit Flügen", () => {
    const dog = trip({ Fuchs: { pets: { kinds: ["dog"] } } });
    expect(petHints(dog, ["IT"]).map(h => h.id)).toEqual(["petEntry"]);
    expect(petHints(dog, ["GB"]).map(h => h.id)).toEqual(["petEntry", "petTapeworm"]);
    expect(petHints(dog, ["US"]).map(h => h.id)).toEqual(["petEntryFar"]);
    expect(petHints(dog, ["DE"])).toEqual([]);
    const fly = trip({ Fuchs: { pets: { kinds: ["cat"] } } }, { items: [{ id: "f", cat: "flights", name: "Flug", status: "idea", options: [] }] });
    expect(petHints(fly, ["NO"]).map(h => h.id)).toEqual(["petEntry", "petFlight"]);
    expect(petHints(trip({ Fuchs: { pets: { kinds: ["dog"], home: true } } }), ["GB"])).toEqual([]);
  });
  it("Posten Tierbetreuung: nur die Familie, Freundeskreis 0 € und Richtwert", () => {
    const tr = trip({});
    expect(careDays(tr)).toBe(8);
    expect(careEstimate({ kinds: ["dog"], home: true }, 8)).toBe(200);
    expect(careEstimate({ kinds: ["fish"], home: true, often: "few" }, 8)).toBe(60);
    const it = careItem(tr, "Fuchs", { kinds: ["dog", "fish"], home: true });
    expect(it.participants).toEqual(["a", "b"]);
    expect(it.hint).toBe("home:Fuchs");
    expect(it.name).toBe("Tierbetreuung Fuchs (Hund und Fische)");
    expect(it.options.map(o => o.price.unit)).toEqual([0, 25 * 8 + 15 * 8]);
  });
  it("Zuhause (#323): Aufgaben, wie oft und Dankeschön in einem Text", () => {
    const c = { tasks: ["plants" as const, "mail" as const], often: "few" as const, thanks: { text: "eine Kiste Bier" } };
    expect(askText(undefined, "2027-07-12", "2027-07-19", c)).toBe("Wer kann vom 12.07. bis 19.07. bei uns die Pflanzen gießen und den Briefkasten leeren (etwa alle 2–3 Tage)? Als Dankeschön: eine Kiste Bier. 🪴");
    const mixed = askText({ kinds: ["dog", "fish"], home: true }, undefined, undefined, { tasks: ["other"], other: "die Rollläden hochziehen", thanks: { eur: 50 } });
    expect(mixed).toContain("unseren Hund zu sich nehmen?");
    expect(mixed).toContain("Und wer kann bei uns unsere Fische füttern und die Rollläden hochziehen?");
    expect(mixed).toContain("Als Dankeschön: 50 €.");
    expect(thanksText({ tasks: [], thanks: { eur: 20, text: "Pizza" } })).toBe("20 € und Pizza");
    // Tier reist mit: nichts zu füttern, nur Aufgaben
    expect(askText({ kinds: ["dog"] }, undefined, undefined, { tasks: ["check"] })).toBe("Wer kann während unseres Urlaubs bei uns nach dem Rechten sehen? 🏠");
  });
  it("Zuhause: sichtbar nur mit bekanntem Haustier oder eingeschaltet (Reise vor Vorlieben)", () => {
    expect(homeCareOn(trip({}), {})).toEqual({ pets: false, home: false });
    expect(homeCareOn(trip({}), { pet: true })).toEqual({ pets: true, home: false });
    expect(homeCareOn(trip({ Fuchs: { pets: { kinds: ["cat"] } } }), {})).toEqual({ pets: true, home: false });
    expect(homeCareOn(trip({}), { homeCare: true })).toEqual({ pets: true, home: true });
    expect(homeCareOn(trip({}, { homeCare: false }), { homeCare: true })).toEqual({ pets: false, home: false });
    expect(homeCareOn(trip({}, { homeCare: true }), {})).toEqual({ pets: true, home: true });
  });
  it("Posten Zuhause: Dankeschön als Betrag, ohne Tiere keine Pension; aktualisieren", () => {
    const tr = trip({});
    const it = careItem(tr, "Hase", undefined, { tasks: ["plants"], thanks: { eur: 50, text: "Kiste Bier" } });
    expect(it.name).toBe("Zuhause versorgt Hase");
    expect(it.participants).toEqual(["c"]);
    expect(it.options.map(o => o.price.unit)).toEqual([50]);
    expect(it.note).toContain("50 € und Kiste Bier");
    updateCareItem(it, careItem(tr, "Hase", { kinds: ["cat"], home: true }, { tasks: ["plants"], thanks: { eur: 20 } }));
    expect(it.options.map(o => o.price.unit)).toEqual([20, 15 * 8]);
    updateCareItem(it, careItem(tr, "Hase", undefined, { tasks: ["plants"] }));
    expect(it.options.map(o => o.price.unit)).toEqual([0]);
  });
  it("Unterkunfts-Links mit Haustier-Filter", () => {
    const q = { place: "Riva", checkin: "2027-07-12", checkout: "2027-07-19", adults: 2, childAges: [], rooms: 1 };
    expect(bookingLink(q)).not.toContain("nflt");
    expect(bookingLink({ ...q, pets: true })).toContain("nflt=hotelfacility%3D4");
    expect(airbnbLink({ ...q, pets: true })).toContain("pets=1");
  });
});
