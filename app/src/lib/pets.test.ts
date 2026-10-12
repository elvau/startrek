import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "./i18n/index.svelte";
import { askText, careDays, careEstimate, careItem, careOf, defaultCare, kindsAlong, petHints, petsAlong } from "./pets";
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
    expect(askText({ kinds: ["fish"], home: true, often: "few" }, "2027-07-12", "2027-07-19")).toBe("Wer kann vom 12.07. bis 19.07. bei uns vorbeischauen und unsere Fische füttern (etwa alle 2–3 Tage)? 🐠");
    const both = askText({ kinds: ["dog", "cat", "fish"], home: true });
    expect(both).toContain("unseren Hund und unsere Katze zu sich nehmen?");
    expect(both).toContain("Und wer schaut bei uns vorbei, um unsere Fische zu füttern?");
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
    expect(it.hint).toBe("pet:Fuchs");
    expect(it.name).toBe("Tierbetreuung Fuchs (Hund und Fische)");
    expect(it.options.map(o => o.price.unit)).toEqual([0, 25 * 8 + 15 * 8]);
  });
  it("Unterkunfts-Links mit Haustier-Filter", () => {
    const q = { place: "Riva", checkin: "2027-07-12", checkout: "2027-07-19", adults: 2, childAges: [], rooms: 1 };
    expect(bookingLink(q)).not.toContain("nflt");
    expect(bookingLink({ ...q, pets: true })).toContain("nflt=hotelfacility%3D4");
    expect(airbnbLink({ ...q, pets: true })).toContain("pets=1");
  });
});
