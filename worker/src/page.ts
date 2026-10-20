/*
 * Reise importieren per Link (#457): Seite abrufen und als Text an die KI geben. So weit es geht: viele Reiseseiten
 * sperren automatische Abrufe oder laden die Preise erst per JavaScript. Dann meldet der Such-Dienst das sofort, und
 * die App bittet um einen Screenshot oder den Text des Angebots.
 * Nur öffentliche http(s)-Adressen mit Namen (keine IP-Adressen, kein localhost), höchstens 1,5 MB, 8 Sekunden.
 */
const MAX_BYTES = 1_500_000;
/** darunter ist auf der Seite kaum mehr als Navigation (Preise per JavaScript) */
export const PAGE_MIN = 400;
export const PAGE_MAX = 20000;

/** erlaubte Adresse für den Abruf, sonst null */
export function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  // IP-Adressen (v4, v6), interne Namen und Namen ohne Punkt
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(":") || host.startsWith("[") || !host.includes(".")) return null;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null;
  if (u.port && !["80", "443"].includes(u.port)) return null;
  return u;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß" };
const decode = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] ?? m);

/** sichtbarer Text einer Seite, dazu Titel, Beschreibung und strukturierte Daten (JSON-LD enthält oft Preise) */
export function htmlToText(html: string): string {
  const meta = [...html.matchAll(/<meta\s[^>]*(?:property|name)=["'](?:og:title|og:description|description|og:price:amount|product:price:amount)["'][^>]*>/gi)]
    .map(m => m[0].match(/content=["']([^"']*)["']/i)?.[1] || "").filter(Boolean);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const ld = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim()).join("\n");
  const body = html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = [title, ...meta, body, ld ? `Structured data:\n${ld}` : ""].map(s => decode(s).replace(/[ \t\f\v ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim()).filter(Boolean).join("\n");
  return text.slice(0, PAGE_MAX);
}

/** Seite abrufen; null, wenn es nicht geht oder zu wenig Text da ist (dann Screenshot erbitten) */
export async function fetchPage(raw: string, f: typeof fetch = fetch): Promise<string | null> {
  let u = safeUrl(raw);
  if (!u) return null;
  try {
    // Weiterleitungen von Hand, damit auch das Ziel geprüft wird
    for (let hop = 0; hop < 4; hop++) {
      const res = await f(u.toString(), {
        redirect: "manual", signal: AbortSignal.timeout(8000),
        headers: { "user-agent": "Mozilla/5.0 (compatible; SplitAndFly-Import/1.0; +https://splitandfly.com)", accept: "text/html,application/xhtml+xml", "accept-language": "de,en;q=0.8" }
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        u = next ? safeUrl(new URL(next, u).toString()) : null;
        if (!u) return null;
        continue;
      }
      if (!res.ok || !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") || "")) return null;
      const text = htmlToText(await readCapped(res));
      return text.length >= PAGE_MIN ? text : null;
    }
  } catch { /* Zeitüberschreitung, Netzfehler */ }
  return null;
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
  }
  void reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(n, MAX_BYTES));
  let o = 0;
  for (const c of chunks) { const part = c.subarray(0, all.length - o); all.set(part, o); o += part.length; if (o >= all.length) break; }
  return new TextDecoder().decode(all);
}
