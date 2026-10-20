/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { fetchPage, htmlToText, safeUrl } from "./page";
import { toClaude } from "./claude";
import { importPayload } from "../../app/src/lib/import/ai";

describe("Reise importieren per Link (#457)", () => {
  it("nur öffentliche Adressen mit Namen", () => {
    expect(safeUrl("https://www.example.com/deal?id=1")?.hostname).toBe("www.example.com");
    for (const bad of ["ftp://example.com", "http://127.0.0.1/", "http://[::1]/", "http://localhost:8080/", "http://intranet/", "https://router.local/", "https://a:b@example.com/", "https://example.com:8443/", "kein link"]) expect(safeUrl(bad)).toBeNull();
  });
  it("Text der Seite: ohne Skripte, mit Titel, Beschreibung und JSON-LD", () => {
    const html = `<html><head><title>Mallorca &amp; mehr</title><meta property="og:description" content="7 Nächte ab 199 &euro;">
      <script>var x = "geheim";</script><style>.a{}</style><script type="application/ld+json">{"@type":"Offer","price":"199"}</script></head>
      <body><nav>Menü</nav><p>Hotel&nbsp;Sol 3&#9733;</p><div>Flug ab DUS</div><!-- Kommentar --></body></html>`;
    const t = htmlToText(html);
    expect(t).toContain("Mallorca & mehr");
    expect(t).toContain("7 Nächte ab 199 €");
    expect(t).toContain("Hotel Sol 3★");
    expect(t).toContain('"price":"199"');
    expect(t).not.toContain("geheim");
    expect(t).not.toContain("Kommentar");
  });
  it("Abruf: Weiterleitung geprüft, zu wenig Text oder kein HTML → null", async () => {
    const long = `<p>${"Angebot Mallorca 7 Nächte Flug und Hotel. ".repeat(20)}</p>`;
    const pages: Record<string, Response | (() => Response)> = {
      "https://a.example.com/": () => new Response(null, { status: 302, headers: { location: "/ziel" } }),
      "https://a.example.com/ziel": () => new Response(long, { headers: { "content-type": "text/html; charset=utf-8" } }),
      "https://b.example.com/": () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/" } }),
      "https://c.example.com/": () => new Response("<div id=app></div>", { headers: { "content-type": "text/html" } }),
      "https://d.example.com/": () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
      "https://e.example.com/": () => new Response("gesperrt", { status: 403, headers: { "content-type": "text/html" } })
    };
    const f = (async (u: string) => (pages[u] as () => Response)()) as typeof fetch;
    expect(await fetchPage("https://a.example.com/", f)).toContain("Angebot Mallorca");
    for (const u of ["https://b.example.com/", "https://c.example.com/", "https://d.example.com/", "https://e.example.com/", "http://localhost/"]) expect(await fetchPage(u, f)).toBeNull();
    expect(await fetchPage("https://x.example.com/", (async () => { throw new Error("timeout"); }) as typeof fetch)).toBeNull();
  });
  it("Claude bekommt Bilder als image, PDF als document, vor dem Text", () => {
    const b = toClaude(importPayload({ files: [{ mime: "image/png", data: "AAAA" }, { mime: "application/pdf", data: "JVBE" }], text: "Angebot", lang: "de" }), "m");
    expect(b.messages[0].content.slice(0, 2)).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBE" } }
    ]);
    expect(b.messages[0].content[2].type).toBe("text");
    expect(b.tool_choice).toEqual({ type: "tool", name: "fill_trip" });
  });
});
