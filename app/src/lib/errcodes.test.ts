import { beforeAll, describe, expect, it } from "vitest";
import { ERR_CODES, errCode, withCode } from "./errcodes";
import { serverError } from "./neterror";
import { i18n, loadLang, LANGS, t } from "./i18n/index.svelte";
import type { Key } from "./i18n/types";

describe("Fehlercodes des Such-Dienstes (#466)", () => {
  beforeAll(async () => { for (const l of LANGS) await loadLang(l.code); });
  it("feste Texte und Status ergeben einen Code, vorhandene bleiben", () => {
    expect(errCode("Herkunft nicht erlaubt", 403)).toBe("origin");
    expect(errCode("Währung ungültig", 400)).toBe("bad_request");
    expect(errCode("Tageslimit erreicht (5 Importe). Morgen geht es weiter.", 429)).toBe("daily_limit");
    expect(errCode("irgendwas", 503)).toBe("unavailable");
    expect(withCode({ error: "Bitte anmelden" }, 401)).toEqual({ error: "Bitte anmelden", code: "login" });
    expect(withCode({ error: "x", code: "own" }, 400)).toEqual({ error: "x", code: "own" });
    expect(withCode({ offers: [] }, 200)).toEqual({ offers: [] });
  });
  it("jeder Code hat einen Text in allen 7 Sprachen", () => {
    for (const l of LANGS) {
      i18n.lang = l.code;
      for (const c of ERR_CODES) expect(t(`err.${c}` as Key)).not.toBe(`err.${c}`);
    }
    i18n.lang = "de";
  });
  it("Anzeige: übersetzt, auf Deutsch genaue Prüfmeldung, ohne Code der Text", () => {
    i18n.lang = "en";
    expect(serverError({ error: "Bitte anmelden", code: "login" }, 401)).toBe("Please sign in.");
    expect(serverError({ error: "Währung ungültig", code: "bad_request" }, 400)).toBe(t("err.bad_request"));
    expect(serverError({ error: "Alter Text" }, 400)).toBe("Alter Text");
    expect(serverError(null, 502)).toBe(t("search.status", { s: 502 }));
    i18n.lang = "de";
    expect(serverError({ error: "Währung ungültig", code: "bad_request" }, 400)).toBe("Währung ungültig");
  });
});
