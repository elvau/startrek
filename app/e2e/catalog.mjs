/*
 * Reisekatalog (#646): Kachel auf der Startseite, Liste nach Entfernung ab dem Land des Betrachters (hier Schweiz über die
 * Zeitzone, nicht ab Deutschland), Filter, Detail mit Kosten und Route, „Als neue Reise übernehmen“ legt die Reise an.
 * Start: npm run build:emu && node e2e/catalog.mjs (ohne Emulator; Ortsdaten liegen neben der App und werden hier gereicht)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4182/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (f, what, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await f()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeitüberschreitung: " + what); };

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4182", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-CH", timezoneId: "Europe/Zurich" });
  // world.json liegt in der echten Seite neben der App (public/ im Repo), nicht im Build der App
  await ctx.route("**/world.json", r => r.fulfill({ path: "../public/world.json" }));
  await ctx.route("**/packs.json", r => r.fulfill({ path: "../public/packs.json" }));
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(URL);
  await p.locator(".start .home-catalog").click();
  await p.locator(".kat-card").first().waitFor();

  // ohne Wohnort: Land aus der Zeitzone (Schweiz), nicht Deutschland
  await until(async () => ((await p.locator(".kat-from").textContent()) || "").includes("🇨🇭"), "Startort Schweiz");
  const first = await p.locator(".kat-card").first().innerText();
  if (!first.includes("Gardasee")) fail("ab der Schweiz sollte der Gardasee vorne stehen: " + first);
  const bands = await p.locator(".kat-band h2").allInnerTexts();
  if (!bands[0]?.startsWith("Mit Auto oder Bahn")) fail("Bänder: " + bands.join(" | "));
  if (!first.includes("~") || !first.includes("Anreise")) fail("Preis mit Anreise fehlt: " + first);
  log(`Liste ab ${(await p.locator(".kat-from").innerText()).split("·")[0].trim()}: ${await p.locator(".kat-card").count()} Reisen, zuerst Gardasee; Bänder ${bands.map(b => b.split(" ").slice(0, 3).join(" ")).join(", ")}`);

  // Filter „Wer reist: Familie“
  await p.locator(".kat-chips .kat-chip", { hasText: "Wer reist" }).click();
  await p.locator(".kat-opts .kat-chip", { hasText: "Familie" }).click();
  await until(async () => (await p.locator(".kat-card").count()) === 3, "drei Familienreisen");
  await p.locator(".kat-reset").click();
  log("Filter Familie: 3 Reisen, zurückgesetzt");

  // Detail: Route mit Rückweg, Kosten nach Bereichen, Touren
  await p.locator(".kat-card", { hasText: "Gruppenreise Mallorca" }).click();
  await p.locator(".kat-box").waitFor();
  const route = await p.locator(".kat-hero .cr-node").allInnerTexts();
  if (route.length !== 3 || !route[1].includes("Mallorca")) fail("Route: " + route.join(" → "));
  if (!(await p.locator(".kat-hero .cr-ico use[href='#i-plane']").count())) fail("Flug-Symbol fehlt in der Route");
  const rows = await p.locator(".kat-rows li b").allInnerTexts();
  if (rows[0] !== "Anreise (geschätzt)" || !rows.includes("Unterkunft")) fail("Kostenzeilen: " + rows.join(", "));
  if (!(await p.locator(".kat-tours li").count())) fail("Touren fehlen");
  if ((await p.evaluate(() => document.documentElement.scrollWidth)) > 390) fail("Detail breiter als das Handy");
  log(`Detail Mallorca: Route ${route.map(r => r.split("\n")[0]).join(" → ")}, Kosten ${rows.join(", ")}`);

  // übernehmen: neue Reise mit Ziel und Gruppe
  await p.locator(".kat-take .btn").click();
  const current = () => p.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "null"));
  await until(async () => (await current())?.place === "Mallorca", "Reise Mallorca angelegt", 15000);
  const saved = await current();
  if (saved.travelers.length !== 8) fail("Gruppe falsch: " + saved.travelers.length);
  log(`Übernommen: Reise „${saved.name}“ mit ${saved.travelers.length} Personen und ${saved.items.length} Posten`);

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  console.log("\n✓ Reisekatalog in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
