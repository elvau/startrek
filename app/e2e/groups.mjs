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
  await a.locator(".modal h3", { hasText: "Willkommen" }).waitFor();
  if (!(await a.locator(".modal .who-b.on").textContent()).includes("Solo")) fail("Solo nicht vorausgewählt");
  await a.locator(".modal .btn", { hasText: "Los geht's" }).click();
  const solo = await a.locator(".person:not(.add) b").allTextContents();
  if (solo.length !== 1 || solo[0].includes(" ")) fail("Start nicht mit einem Tier: " + solo);
  log("Erster Start: 1-Personen-Reise als", solo[0]);

  // Gruppen und Personen anlegen
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".hero .grp-btn").click();
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
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".hero .tm-plus").click();
  await a.locator(".newtrip label", { hasText: "Wohin" }).locator("input").fill("Mosel");
  await a.locator(".newtrip label", { hasText: "Von" }).locator("input").fill("2027-05-06");
  await a.locator(".newtrip label", { hasText: "Bis" }).locator("input").fill("2027-05-09");
  if (!(await a.locator(".newtrip .who-b.on").textContent()).includes("Solo")) fail("Solo nicht vorausgewählt");
  await a.locator(".newtrip .who-b", { hasText: "Gespeichert" }).click();
  await a.locator(".newtrip .grp-chip", { hasText: "Kegeln" }).click();
  await a.locator(".newtrip .btn", { hasText: "Reise anlegen" }).click();
  await until(async () => (await a.locator(".hero h1").textContent()).includes("Mosel"), "neue Reise offen");
  const tname = await a.locator(".hero .tm-name").first().textContent();
  if (tname !== "Mosel · Mai 2027 · 4 Tage") fail("Name: " + tname);
  await menu(a);
  const listed = await a.locator(".tm-trip").allInnerTexts();
  if (listed.length !== 1) fail("leere Reise nicht weggeräumt: " + listed.join(" | "));
  await a.keyboard.press("Escape");
  log("Name aus Ziel und Zeitraum:", tname, "· leere Startreise weggeräumt");
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
  await a.locator("#flights .card.edit").waitFor();
  if ((await total(a)) !== "1.500 €") fail("Summe nach Umschalten: " + await total(a));
  const ppIn = await a.locator("#flights .card.edit input[inputmode=decimal]").evaluateAll(xs => xs.map(x => x.value));
  if (!ppIn.some(v => v.startsWith("300"))) fail("Preis pro Person nicht 300: " + ppIn);
  log("Detailliert: neuer Posten offen, 600 € als 300 € pro Person");
  await a.locator("#flights .mode button", { hasText: "Einfach" }).click();
  await a.locator("#flights .simple-hidden").waitFor();
  if ((await total(a)) !== "1.500 €") fail("Summe nach Zurückschalten: " + await total(a));
  const fl = await a.locator(".aside .cat", { hasText: "Flüge" }).first().textContent();
  if (!fl.includes("Gesamtbetrag gleich verteilt")) fail("Übersicht Flüge: " + fl);
  await a.locator("#flights .mode button", { hasText: "Detailliert" }).click();
  await a.locator("#flights .card[data-item]").waitFor();
  if ((await a.locator("#flights .card[data-item]").count()) !== 1) fail("Posten doppelt nach Wiederherstellen");
  if (await a.locator("#flights .card.edit").count()) fail("beim Wiederherstellen sollte die Liste kommen, kein Editor");
  await a.locator("#flights .mode button", { hasText: "Einfach" }).click();
  await a.locator("#flights .simple-hidden").waitFor();
  log("Flüge detailliert und zurück: Betrag wird Posten und umgekehrt, Summe bleibt 1.500 €");

  // Schnell mit Platzhaltern: zwei Tierfamilien (zufällige Tiere)
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".hero .tm-plus").click();
  await a.locator(".newtrip label", { hasText: "Wohin" }).locator("input").fill("Ostsee");
  await a.locator(".newtrip .who-b", { hasText: "Familie" }).click();
  const qf = a.locator(".newtrip .qf");
  await qf.locator(".linkbtn").click();
  // erste Familie: 2 Erwachsene, 3 Kinder; zweite: 2 Erwachsene, 2 Kinder, 1 Kleinkind
  for (let k = 0; k < 3; k++) await qf.locator(".qf-row").nth(0).locator('[aria-label="Kinder mehr"]').click();
  for (let k = 0; k < 2; k++) await qf.locator(".qf-row").nth(1).locator('[aria-label="Kinder mehr"]').click();
  await qf.locator(".qf-row").nth(1).locator('[aria-label="Kleink. mehr"]').click();
  const fams = await qf.locator(".qf-row select").evaluateAll(xs => xs.map(x => x.value));
  const [A, B] = fams;
  if (fams.length !== 2 || A === B) fail("Familien: " + fams);
  await a.locator(".newtrip .btn", { hasText: "Reise anlegen" }).click();
  await until(async () => (await a.locator(".hero h1").textContent()).includes("Ostsee"), "Ostsee offen");
  const ph = await a.locator(".person:not(.add) b").allTextContents();
  if (ph.length !== 10 || ph[0] !== `${A} Erw. 1` || ph[9] !== `${B} Kleinkind 1`) fail("Platzhalter: " + ph);
  const kids = await a.locator(".person", { hasText: `${A} Kind 1` }).locator("span").allTextContents();
  if (!kids.some(x => x.includes("Kind"))) fail("Kind nicht als Kind: " + kids);
  const baby = await a.locator(".person", { hasText: `${B} Kleinkind 1` }).locator("span").allTextContents();
  if (!baby.some(x => x.includes("Kleinkind"))) fail("Kleinkind nicht als Kleinkind: " + baby);
  await amount("stay", "1000");
  await until(async () => (await a.locator("#stay .simple-out b").textContent()) === "100 €", "100 € pro Person");
  const hh2 = await a.evaluate(() => [...document.querySelectorAll(".share .sh-head")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  if (hh2.length !== 2 || !hh2.every(x => x.includes("500 €"))) fail("pro Familie: " + hh2);
  await a.locator("#trav .card").scrollIntoViewIfNeeded();
  await a.locator(".trav-acts .linkbtn", { hasText: "Als Gruppe speichern" }).click();
  await a.locator(".trav-note", { hasText: "Platzhalter werden nicht gespeichert" }).waitFor();
  // Platzhalter durch gespeicherte Person ersetzen
  await a.locator(".person", { hasText: `${A} Erw. 1` }).locator(".repl").click();
  const cand = await a.locator(".repl-pick .chip").allTextContents();
  if (!cand.some(c => c.includes("Dani Klein"))) fail("Kandidaten: " + cand);
  await a.locator(".repl-pick .chip", { hasText: "Dani Klein" }).click();
  const after = await a.locator(".person:not(.add) b").allTextContents();
  if (after.length !== 10 || after[0] !== "Dani Klein" || after.includes(`${A} Erw. 1`)) fail("nach Ersetzen: " + after);
  const hh3 = await a.evaluate(() => [...document.querySelectorAll(".share .sh-head")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  if (!hh3.some(x => x.startsWith("Klein") && x.includes("100 €"))) fail("Klein nach Ersetzen: " + hh3);
  log(`„${A} Erw. 1“ durch die gespeicherte`, " Dani Klein ersetzt, Familie Klein zahlt 100 €");
  log(`Platzhalter: Familie ${A} (2+3) und ${B} (2+2+1 Kleinkind)`, " 1.000 € → 100 € pro Person, je Familie 500 €, nicht als Gruppe gespeichert");

  // Anmelden: Gruppen landen im Konto und sind auf einem zweiten Gerät da
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".hero .acct .tm-btn", { hasText: "Anmelden" }).click();
  await a.locator(".login .test input").fill("Anna");
  await a.locator(".login .test button").click();
  await a.locator(".hero .acct-btn").waitFor();
  await new Promise(r => setTimeout(r, 2000));
  const b = await page("Anna2");
  await b.goto(URL);
  await b.locator(".modal .welcome .linkbtn", { hasText: "schon ein Konto" }).click();
  await b.locator(".login .test input").fill("Anna");
  await b.locator(".login .test button").click();
  await b.locator(".hero .acct-btn").waitFor();
  await b.locator(".hero .grp-btn").click();
  await until(async () => (await b.locator(".modal .grp-h").count()) === 2, "Gruppen auf zweitem Gerät");
  log("Gruppen sind nach der Anmeldung auf dem zweiten Gerät da");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
