/*
 * Gruppen und einfacher Modus, gegen die Firebase-Emulatoren.
 * Start: npm run test:cloud (läuft nach e2e/cloud.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4174/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4174", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
async function page(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  p.on("dialog", d => d.accept(d.type() === "prompt" ? "Kegeltruppe" : undefined));
  return p;
}
async function until(fn, what, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); }
  fail("Zeitüberschreitung: " + what);
}
const total = p => p.locator(".tk-top b").textContent();
const menu = async p => { await p.evaluate(() => scrollTo(0, 0)); await p.locator(".hero .tm-btn").first().click(); };

try {
  const a = await page("Anna");
  await a.goto(URL);

  // Gruppen und Personen anlegen
  await menu(a);
  await a.locator(".tm-act", { hasText: "Gruppen und Personen" }).click();
  const d = a.locator(".modal");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("input").fill("Familie Klein");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("button").click();
  const addP = async (f, l) => {
    const form = d.locator("form", { hasText: "Vorname" });
    await form.locator("input").nth(0).fill(f);
    await form.locator("input").nth(1).fill(l);
    await form.locator("button").click();
  };
  // Pflichtfelder
  await d.locator("form", { hasText: "Vorname" }).locator("input").nth(0).fill("Ohne");
  await d.locator("form", { hasText: "Vorname" }).locator("button").click();
  if (!(await d.locator(".err", { hasText: "Pflicht" }).count())) fail("Nachname nicht als Pflicht erkannt");
  await addP("Dani", "Klein");
  await addP("Monika", "Klein");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("input").fill("Kegeln");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("button").click();
  await d.locator(".grp.open .chip", { hasText: "Monika Klein" }).click();
  await addP("Uwe", "Schmitz");
  const groups = await d.locator(".grp-h").allTextContents();
  if (!groups.some(g => g.includes("Familie Klein") && g.includes("2 Personen")) || !groups.some(g => g.includes("Kegeln") && g.includes("2 Personen"))) fail("Gruppen falsch: " + groups);
  log("Gruppen angelegt, Monika ist in beiden:", groups.map(g => g.replace(/\s+/g, " ")).join(" | "));
  await a.keyboard.press("Escape");

  // Neue Reise für die Kegelgruppe, einfacher Modus
  await menu(a);
  await a.locator(".tm-act", { hasText: "+ Neue Reise" }).click();
  await a.locator(".newtrip input").first().fill("Kegeltour Mosel");
  await a.locator(".newtrip .grp-chip", { hasText: "Kegeln" }).click();
  await a.locator(".newtrip .btn", { hasText: "Reise anlegen" }).click();
  await until(async () => (await a.locator(".hero h1").textContent()).includes("Kegeltour"), "neue Reise offen");
  const names = (await a.locator(".person:not(.add) b").allTextContents()).join(", ");
  if (names !== "Monika Klein, Uwe Schmitz") fail("Reisende: " + names);
  if ((await a.locator(".simple-card").count()) !== 5) fail("nicht alle Bereiche einfach");
  log("Neue Reise für „Kegeln“:", names, "· alle Bereiche einfach");

  const amount = async (cat, v) => { const i = a.locator(`#${cat} .simple-in input`); await i.scrollIntoViewIfNeeded(); await i.fill(v); };
  await amount("flights", "600");
  await amount("stay", "900");
  await until(async () => (await total(a)) === "1.500 €", "Summe 1.500 €");
  const pp = await a.locator("#stay .simple-out b").textContent();
  if (pp !== "450 €") fail("Unterkunft pro Person: " + pp);
  log("Einfach: 600 € + 900 € = 1.500 €, Unterkunft 450 € pro Person");

  // Dani dazu, Uwe nicht dabei
  await a.locator("#trav .card").scrollIntoViewIfNeeded();
  await a.locator(".trav-acts .linkbtn", { hasText: "Aus Gruppe hinzufügen" }).click();
  await a.locator(".pick .chip", { hasText: "Familie Klein" }).click();
  await a.locator(".person", { hasText: "Uwe" }).locator(".dabei").click();
  await until(async () => (await a.locator("#stay .simple-out b").textContent()) === "450 €", "zwei Aktive");
  const hh = await a.evaluate(() => [...document.querySelectorAll(".share .sh-head")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  if (hh.length !== 1 || !hh[0].startsWith("Klein") || !hh[0].includes("1.500 €")) fail("pro Familie: " + hh);
  log("Dani dazu, Uwe nicht dabei: 2 Aktive, Familie Klein zahlt 1.500 €");

  // Flüge auf detailliert und zurück, ohne dass sich die Summe ändert
  await a.locator("#flights .mode button", { hasText: "Detailliert" }).click();
  await a.locator("#flights .card[data-item]").waitFor();
  if ((await total(a)) !== "1.500 €") fail("Summe nach Umschalten: " + await total(a));
  await a.locator("#flights .mode button", { hasText: "Einfach" }).click();
  await a.locator("#flights .simple-hidden").waitFor();
  if ((await total(a)) !== "1.500 €") fail("Summe nach Zurückschalten: " + await total(a));
  const fl = await a.locator(".aside .cat", { hasText: "Flüge" }).first().textContent();
  if (!fl.includes("Gesamtbetrag gleich verteilt")) fail("Übersicht Flüge: " + fl);
  await a.locator("#flights .mode button", { hasText: "Detailliert" }).click();
  await a.locator("#flights .card[data-item]").waitFor();
  if ((await a.locator("#flights .card[data-item]").count()) !== 1) fail("Posten doppelt nach Wiederherstellen");
  await a.locator("#flights .mode button", { hasText: "Einfach" }).click();
  await a.locator("#flights .simple-hidden").waitFor();
  log("Flüge detailliert und zurück: Betrag wird Posten und umgekehrt, Summe bleibt 1.500 €");

  // Anmelden: Gruppen landen im Konto und sind auf einem zweiten Gerät da
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".hero .acct .tm-btn", { hasText: "Anmelden" }).click();
  await a.locator(".login .test input").fill("Anna");
  await a.locator(".login .test button").click();
  await a.locator(".hero .acct-btn").waitFor();
  await new Promise(r => setTimeout(r, 2000));
  const b = await page("Anna2");
  await b.goto(URL);
  await b.locator(".hero .acct .tm-btn", { hasText: "Anmelden" }).click();
  await b.locator(".login .test input").fill("Anna");
  await b.locator(".login .test button").click();
  await b.locator(".hero .acct-btn").waitFor();
  await menu(b);
  await b.locator(".tm-act", { hasText: "Gruppen und Personen" }).click();
  await until(async () => (await b.locator(".modal .grp-h").count()) === 2, "Gruppen auf zweitem Gerät");
  log("Gruppen sind nach der Anmeldung auf dem zweiten Gerät da");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
