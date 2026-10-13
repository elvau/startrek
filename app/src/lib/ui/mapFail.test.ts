import { describe, expect, it } from "vitest";
import { nextFailed } from "./mapFail";

describe("nextFailed", () => {
  it("Fehler vor dem ersten load zeigt den Hinweis", () => expect(nextFailed(false, "error", false)).toBe(true));
  it("Kachelfehler nach dem load lässt die Karte stehen", () => expect(nextFailed(false, "error", true)).toBe(false));
  it("load setzt den Hinweis zurück", () => expect(nextFailed(true, "load", true)).toBe(false));
  it("Hinweis bleibt nach späterem Fehler unverändert", () => expect(nextFailed(true, "error", true)).toBe(true));
});
