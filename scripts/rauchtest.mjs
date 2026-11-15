/*
 * Rauchtest nach einem Release (release.yml): antwortet der neue Stand?
 *   - Seite: Startseite lädt, die ausgelieferte App trägt die Version aus app/package.json
 *   - Such-Dienst: /health meldet ok und dieselbe Version
 * Beides wird ein paar Minuten lang wiederholt (Auslieferung braucht einen Moment).
 *
 *   node scripts/rauchtest.mjs https://splitandfly.com https://…workers.dev [--nur-seite] [--dienst-nachsichtig]
 *     [--start=assets/main-….js] [--stand=<Commit>]
 *
 * --nur-seite            Such-Dienst nicht prüfen (wöchentlicher Neubau: er wurde nicht neu veröffentlicht)
 * --dienst-nachsichtig   meldet der Such-Dienst eine andere Version, nur warnen (er wird nicht von GitHub veröffentlicht);
 *                        antwortet er gar nicht oder nicht ok, bleibt das ein Fehler
 * --start=…              Start-Chunk des gerade gebauten Stands: die Seite muss genau ihn laden. Ohne das besteht der
 *                        Test bei gleicher Version (wöchentlicher Neubau, zweiter Lauf) schon mit der alten Seite.
 * --stand=…              Commit, den der Such-Dienst unter /health melden muss (von GitHub veröffentlicht)
 */
import { readFileSync } from "node:fs";

const WAIT = Number(process.env.RAUCHTEST_WARTEN ?? 180) * 1000, STEP = 10000;

const get = async url => { const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r; };

/** Trägt die ausgelieferte App diese Version? Sie steht im Start-Chunk (assets/main-….js), den die Startseite lädt */
export async function siteHas(base, version, fetchText = async u => (await get(u)).text(), start = "") {
  const html = await fetchText(base);
  const m = html.match(/assets\/main-[\w-]+\.js/);
  if (!m) throw new Error("Startseite ohne assets/main-….js");
  if (start && m[0] !== start) return false;
  const js = await fetchText(new URL(m[0], base).href);
  // als eigene Zahl, nicht als Teil einer längeren (0.62.1 passt nicht auf 0.62.10 oder 10.62.1)
  return new RegExp(`(?<![\\d.])${version.replace(/\./g, "\\.")}(?![\\d.])`).test(js);
}

/** bis zum Ablauf wiederholen; gibt die letzte Meldung zurück, wenn es nicht klappt */
async function retry(what, fn) {
  const end = Date.now() + WAIT;
  for (;;) {
    let msg;
    try { msg = await fn(); } catch (e) { msg = e.message; }
    if (!msg) { console.log(`✓ ${what}`); return ""; }
    if (Date.now() + STEP > end) return msg;
    console.log(`… ${what}: ${msg}`);
    await new Promise(r => setTimeout(r, STEP));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [site, service, ...flags] = process.argv.slice(2);
  if (!site || !service) { console.error("Aufruf: rauchtest.mjs <Seite> <Such-Dienst> [--nur-seite] [--dienst-nachsichtig]"); process.exit(2); }
  const opt = name => flags.find(f => f.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
  const start = opt("start"), stand = opt("stand");
  const version = JSON.parse(readFileSync(new URL("../app/package.json", import.meta.url), "utf8")).version;
  let failed = false;
  const s = await retry(`Seite ${site} liefert Version ${version}`, async () => ((await siteHas(site.replace(/\/?$/, "/"), version, undefined, start)) ? "" : `noch nicht ${start || "Version " + version}`));
  if (s) { console.log(`::error::Seite: ${s}`); failed = true; }
  if (!flags.includes("--nur-seite")) {
    const lenient = flags.includes("--dienst-nachsichtig");
    let down = false;
    const d = await retry(`Such-Dienst ${service} meldet Version ${version}${stand ? ", Stand " + stand.slice(0, 7) : ""}`, async () => {
      down = true;
      const h = await (await get(service.replace(/\/$/, "") + "/health")).json();
      if (!h.ok) return "/health meldet nicht ok";
      down = false;
      if (h.version !== version) return `meldet Version ${h.version ?? "(keine)"}`;
      return !stand || h.stand === stand ? "" : `meldet Stand ${h.stand ?? "(keinen)"}`;
    });
    // nachsichtig nur bei anderem Stand; ein Dienst, der nicht antwortet, ist immer ein Fehler
    const soft = lenient && !down;
    if (d) { console.log(`::${soft ? "warning" : "error"}::Such-Dienst: ${d}`); if (!soft) failed = true; }
  }
  process.exit(failed ? 1 : 0);
}
