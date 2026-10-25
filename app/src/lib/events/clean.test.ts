import { describe, expect, it } from "vitest";
import { cleanHit, cleanText } from "./clean";
import { mergeEvents } from "./search";
import { fromTicketmaster } from "./ticketmaster";
import type { EventHit } from "./types";

const hit = (x: Partial<EventHit> = {}): EventHit => ({ id: "a", source: "s", sourceName: "S", name: "Forest U21 – Dortmund U21", start: "2026-12-21T19:00", ...x });

describe("Platzhalter vom Anbieter sind kein Ort (#547)", () => {
  it("cleanText", () => {
    for (const v of ["undefined", "Undefined", " null ", "TBA", "tbd", "", "  ", "n/a", undefined, null, 5]) expect(cleanText(v)).toBeUndefined();
    expect(cleanText(" Wembley Stadium ")).toBe("Wembley Stadium");
  });
  it("cleanHit lässt das Feld weg", () => {
    const c = cleanHit(hit({ venue: "Undefined", city: "TBA", address: "null", category: "undefined" }));
    expect(c).toEqual(hit());
    expect("venue" in c).toBe(false);
    expect(cleanHit(hit({ venue: "Stadion", city: "Dortmund" }))).toMatchObject({ venue: "Stadion", city: "Dortmund" });
  });
  it("Ticketmaster: Ort „Undefined“ entfällt", () => {
    const [h] = fromTicketmaster({ _embedded: { events: [{ id: "1", name: "X", dates: { start: { localDate: "2026-12-21" } }, _embedded: { venues: [{ name: "undefined", city: { name: "TBA" } }] } }] } });
    expect(h.venue).toBeUndefined();
    expect(h.city).toBeUndefined();
  });
  it("Zusammenführen: Platzhalter überdeckt keine Angabe der anderen Quelle", () => {
    const [m] = mergeEvents([[hit({ id: "1", venue: "Undefined" })], [hit({ id: "2", venue: "City Ground" })]]);
    expect(m.venue).toBe("City Ground");
  });
});
