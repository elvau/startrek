import { describe, expect, it } from "vitest";
import { i18n } from "./i18n/index.svelte";
import { legalUrl } from "./legal";

describe("Rechtstexte je Sprache", () => {
  it("deutsch: Impressum und Datenschutz, sonst die englische Übersetzung", () => {
    i18n.lang = "de";
    expect(legalUrl("imprint", "/")).toBe("/impressum.html");
    expect(legalUrl("privacy", "/startrek/")).toBe("/startrek/datenschutz.html");
    for (const l of ["en", "fr", "ar"] as const) {
      i18n.lang = l;
      expect(legalUrl("imprint", "/")).toBe("/imprint.html");
      expect(legalUrl("privacy", "/")).toBe("/privacy.html");
    }
    i18n.lang = "de";
  });
});
