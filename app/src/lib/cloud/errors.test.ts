import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";

describe("Fehlerzuordnung der Anmeldung", () => {
  it("abgebrochene Fenster erzeugen keine Meldung", () => {
    expect(errorMessage({ code: "auth/popup-closed-by-user" })).toBe("");
    expect(errorMessage({ code: "auth/cancelled-popup-request" })).toBe("");
  });
  it("andere Fehler bleiben sichtbar", () => {
    expect(errorMessage(new Error("kaputt"))).toBe("kaputt");
    expect(errorMessage({ code: "auth/network-request-failed", message: "Netz" })).toBe("Netz");
  });
});
