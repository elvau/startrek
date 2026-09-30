import { describe, expect, it } from "vitest";
import { addToNew, dropFromNew, toggleSavedGroup, togglePicked, whoCount, whoGroupName, whoMissing, type Who } from "./who";
import type { Directory } from "./model";

const d: Directory = {
  people: [{ id: "a", first: "Anna", last: "Klein" }, { id: "b", first: "Ben", last: "Klein" }, { id: "m", first: "Monika", last: "Klein" }, { id: "u", first: "Uwe", last: "Schmitz" }],
  groups: [{ id: "fam", name: "Familie Klein", memberIds: ["a", "b", "m"] }, { id: "keg", name: "Kegeln", memberIds: ["m", "u"] }]
};
const who = (p: Partial<Who> = {}): Who => ({
  mode: "family", src: "", solo: "Fuchs", partner: "Reh", fams: [{ animal: "Dachs", adults: 2, kids: 1, infants: 0 }], group: { adults: 6, kids: 0 },
  mascot: "Zebra", groups: [], picked: [], ng: { name: "", ids: [], drafts: [] }, ...p
});

describe("Neue Reise: wer fährt mit", () => {
  it("Solo und Partner sofort fertig, Familie und Gruppe erst mit gewähltem Weg", () => {
    expect(whoMissing(who({ mode: "solo" }))).toBe("");
    expect(whoMissing(who({ mode: "partner" }))).toBe("");
    expect(whoMissing(who())).toBe("who.needSrc");
    expect(whoMissing(who({ mode: "group" }))).toBe("who.needSrc");
    expect(whoMissing(who({ src: "animals" }))).toBe("");
    expect(whoCount(who({ src: "animals" }))).toBe(3);
    expect(whoCount(who({ mode: "group", src: "animals" }))).toBe(6);
  });

  it("gespeicherte Gruppen: an- und abwählen, gemeinsame Mitglieder bleiben", () => {
    const w = who({ src: "saved" });
    expect(whoMissing(w)).toBe("who.needPeople");
    toggleSavedGroup(w, d, "fam");
    toggleSavedGroup(w, d, "keg");
    expect(w.picked.sort()).toEqual(["a", "b", "m", "u"]);
    expect(whoGroupName(w, d)).toBe("Familie Klein & Kegeln");
    toggleSavedGroup(w, d, "fam");
    // Monika ist auch beim Kegeln
    expect(w.picked.sort()).toEqual(["m", "u"]);
    togglePicked(w, "u");
    expect(w.picked).toEqual(["m"]);
    expect(whoMissing(w)).toBe("");
    expect(whoCount(w)).toBe(1);
  });

  it("neue Gruppe braucht Namen und Personen, vorhandene nur einmal", () => {
    const w = who({ src: "new" });
    expect(whoMissing(w)).toBe("who.needName");
    w.ng.name = "Familie Klein";
    expect(whoMissing(w)).toBe("who.needPeople");
    addToNew(w, "a"); addToNew(w, "a");
    w.ng.drafts.push({ key: "k", first: "Lea", last: "Klein" });
    expect(whoCount(w)).toBe(2);
    expect(whoMissing(w)).toBe("");
    expect(whoGroupName(w, d)).toBe("Familie Klein");
    dropFromNew(w, "a");
    expect(w.ng.ids).toEqual([]);
  });
});
