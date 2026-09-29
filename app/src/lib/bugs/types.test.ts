import { describe, expect, it } from "vitest";
import { bugBody, bugTitle, parseBugReport, type BugReport } from "./types";

const ok = { text: "Summe falsch\nBei 3 Personen steht 7 €", page: "https://x.test/?join=abc123&x=1", lang: "de", ua: "Firefox", screen: "390×844", version: "8a9e41b", errors: ["TypeError: a is undefined"], view: "Reise · einfach · 3 Personen" };

describe("Fehlermeldung", () => {
  it("prüft und kürzt, Einladungscode fliegt aus der Adresse", () => {
    const r = parseBugReport(ok) as BugReport;
    expect(r.page).toBe("https://x.test/?join=…&x=1");
    expect(parseBugReport({ text: "kurz" })).toBeTypeOf("string");
    expect(parseBugReport(null)).toBeTypeOf("string");
    expect((parseBugReport({ ...ok, errors: Array.from({ length: 30 }, (_, i) => "e" + i) }) as BugReport).errors).toHaveLength(10);
  });
  it("Titel aus der ersten Zeile, Text als Zitat ohne HTML, Tabelle mit Umgebung", () => {
    const r = parseBugReport({ ...ok, text: "Summe <b>falsch</b> | kaputt\nzweite Zeile" }) as BugReport;
    expect(bugTitle(r)).toBe("🐞 Summe <b>falsch</b> | kaputt");
    const b = bugBody(r, "https://w.test/bug-image/x.jpg", "Anna");
    expect(b).toContain("> Summe &lt;b&gt;falsch&lt;/b&gt; | kaputt\n> zweite Zeile");
    expect(b).toContain("![Bildschirmfoto](https://w.test/bug-image/x.jpg)");
    expect(b).toContain("| Ansicht | Reise · einfach · 3 Personen |");
    expect(b).toContain("| Gemeldet von | Anna |");
    expect(b).toContain("TypeError: a is undefined");
  });
});
