/*
 * Einfacher Modus mit einzelnen Einträgen (Text, Betrag, wer dabei ist) und Cent bei Anteilen pro Person.
 * Beispiel aus der Beta: zu viert, Stadionführung nur Daniel und Henning, Abendessen alle.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4180/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };

const TRIP = {
  id: "vier", name: "Zu viert", place: "London", country: "Vereinigtes Königreich", from: "2027-05-14", to: "2027-05-16",
  travelers: [
    { id: "d", name: "Daniel", household: "Klein" }, { id: "h", name: "Henning", household: "Klein" },
    { id: "m", name: "Monika", household: "Hase" }, { id: "s", name: "Sarah", household: "Hase" }
  ],
  items: [], tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, households: {},
  detail: { flights: false, stay: false, transport: false, attractions: false, misc: false }
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4180", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await ctx.addInitScript(t => {
    if (localStorage.getItem("rk2-index")) return;
    localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 4 }]));
    localStorage.setItem("rk2-current", t.id);
  }, TRIP);
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(URL);
  await p.locator(".start .home-trip", { hasText: "Zu viert" }).click();

  const card = p.locator("#attractions .simple-card");
  await card.scrollIntoViewIfNeeded();

  // Stadionführung 50 € nur Daniel und Henning
  await card.locator(".sl-add").click();
  let row = card.locator(".sl").nth(0);
  await row.locator(".sl-t").fill("Stadionführung");
  await row.locator(".sl-v input").fill("50");
  if ((await row.locator(".sl-who .chip.on").count()) !== 4) fail("neuer Eintrag nicht für alle");
  await row.locator(".sl-who .chip", { hasText: "Monika" }).click();
  await row.locator(".sl-who .chip", { hasText: "Sarah" }).click();
  await until(async () => (await row.locator(".sl-pp").innerText()).includes("25 €"), "Stadionführung 25 € pro Person");

  // Abendessen 200 € alle, Technikmuseum 40 € Sarah und Daniel
  await card.locator(".sl-add").click();
  row = card.locator(".sl").nth(1);
  await row.locator(".sl-t").fill("Abendessen");
  await row.locator(".sl-v input").fill("200");
  await card.locator(".sl-add").click();
  row = card.locator(".sl").nth(2);
  await row.locator(".sl-t").fill("Technikmuseum");
  await row.locator(".sl-v input").fill("40");
  for (const n of ["Henning", "Monika"]) await row.locator(".sl-who .chip", { hasText: n }).click();
  await until(async () => (await card.locator(".simple-out").innerText()).includes("290 €"), "zusammen 290 €");
  if (!(await p.locator("#attractions .ch-sum b").innerText()).includes("290")) fail("Kapitelsumme nicht 290 €");
  if (process.env.SHOTS) {
    await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await card.screenshot({ path: `${process.env.SHOTS}/sl-d.png` });
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(600);
    await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await card.screenshot({ path: `${process.env.SHOTS}/sl-m.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
  }
  log("Einträge: Stadionführung 50 € (Daniel, Henning), Abendessen 200 € (alle), Technikmuseum 40 € (Sarah, Daniel), zusammen 290 €");

  // Abrechnung: Klein trägt 25+25 + 50+50 + 20 = 170, Hase 50+50 + 20 = 120
  const hh = async () => [await p.locator('[id="hh-Klein"] .sh-tot b').innerText(), await p.locator('[id="hh-Hase"] .sh-tot b').innerText()];
  let [k, h] = await hh();
  if (!k.includes("170") || !h.includes("120")) fail(`Abrechnung pro Familie: Klein ${k}, Hase ${h}`);
  log("Abrechnung: Familie Klein 170 €, Familie Hase 120 €");

  // Anteil pro Person mit Cent: 10 € für alle 4 → 2,50 €
  const misc = p.locator("#misc .simple-card");
  await misc.scrollIntoViewIfNeeded();
  await misc.locator(".simple-in input").fill("10");
  await until(async () => (await misc.locator(".simple-out").innerText()).includes("2,50 €"), "10 € auf 4 = 2,50 €");
  log("Anteil pro Person mit Cent: 10 € auf 4 → 2,50 €");

  // Neu laden: alles gespeichert
  await p.reload();
  await p.locator(".start .home-trip", { hasText: "Zu viert" }).click();
  await p.locator("#attractions .sl").nth(2).waitFor();
  if ((await p.locator("#attractions .sl").nth(0).locator(".sl-who .chip.on").count()) !== 2) fail("Auswahl nicht gespeichert");
  log("Nach dem Neuladen alles da");

  // Auf detailliert: Einträge werden Posten mit denselben Beteiligten, Summe bleibt
  await p.locator("#attractions .mode button", { hasText: "Detailliert" }).click();
  await p.locator("#attractions .card[data-item]").nth(2).waitFor();
  const names = await p.locator("#attractions .card[data-item]").allInnerTexts();
  for (const n of ["Stadionführung", "Abendessen", "Technikmuseum"]) if (!names.some(x => x.includes(n))) fail("Posten fehlt: " + n);
  [k, h] = await hh();
  // Sonstiges (10 € auf 4) ist noch einfach und zählt weiter mit: + 5 € je Familie
  if (!k.includes("175") || !h.includes("125")) fail(`Summe nach Umschalten: Klein ${k}, Hase ${h}`);
  log("Detailliert: drei Posten mit denselben Beteiligten, Abrechnung unverändert");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Einfacher Modus ok");
} finally { await browser.close(); server.kill(); }
