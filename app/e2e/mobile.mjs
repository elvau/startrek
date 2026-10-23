/*
 * Handy-Ansicht (#530): Reise als Pager mit Reitern oben und Leiste unten (390 × 844, Touch).
 * Start: npm run test:cloud (nach den anderen)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { reloadHome } from "./nav.mjs";

const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
async function until(fn, what, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  fail("Zeitüberschreitung: " + what);
}
const fam = (h, list) => list.map(([n, a], i) => ({ id: h + i, name: n, household: h, age: a }));
const P = (adult, child, infant) => ({ mode: "person", currency: "EUR", adult, child, infant: infant ?? child });
const TRIP = {
  id: "demo", name: "Kroatien mit Freunden", place: "Split", country: "Kroatien", from: "2027-07-17", to: "2027-07-24",
  travelers: [...fam("Klein", [["Anna", 38], ["Ben", 40], ["Mila", 9], ["Jonas", 6]]), ...fam("Hase", [["Lena", 36], ["Tom", 37], ["Emma", 4]])],
  households: { Klein: { plz: "50667", geo: { ort: "Köln", lat: 50.94, lon: 6.96 } }, Hase: { plz: "40213", geo: { ort: "Düsseldorf", lat: 51.23, lon: 6.78 } } },
  items: [
    { id: "f1", cat: "flights", name: "Flug Köln – Split", status: "chosen", options: [
      { id: "f1a", label: "Sun Air", price: P(139, 129, 29), source: { name: "Suche", at: "2027-01-10" }, legs: [
        { dir: "out", from: "CGN", to: "SPU", dep: "2027-07-17T06:10", arr: "2027-07-17T08:05", carrier: "Sun Air", stops: 0 },
        { dir: "back", from: "SPU", to: "CGN", dep: "2027-07-24T18:40", arr: "2027-07-24T20:35", carrier: "Sun Air", stops: 0 }] },
      { id: "f1b", label: "Blue Wings", price: P(112, 99, 29), legs: [
        { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-17T11:30", arr: "2027-07-17T15:10", carrier: "Blue Wings", stops: 1 },
        { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-24T09:20", arr: "2027-07-24T13:00", carrier: "Blue Wings", stops: 1 }] }] },
    { id: "s1", cat: "stay", name: "Ferienhaus mit Pool", status: "booked", from: "2027-07-17", to: "2027-07-24",
      options: [{ id: "s1a", label: "Villa Marina", price: { mode: "unit", basis: "night", currency: "EUR", unit: 245 }, stay: { stars: 4, rating: 92, nights: 7, board: "none" } }] },
    { id: "t1", cat: "transport", name: "Mietwagen (Van)", status: "idea", options: [{ id: "t1a", label: "7-Sitzer", price: { mode: "unit", currency: "EUR", unit: 420 } }] },
    { id: "a1", cat: "attractions", name: "Bootstour Hvar", status: "chosen", day: "2027-07-20", options: [{ id: "a1a", label: "Tagestour", price: P(55, 28, 0) }] },
    { id: "a2", cat: "attractions", name: "Krka-Wasserfälle", status: "idea", day: "2027-07-22", options: [{ id: "a2a", label: "Eintritt", price: P(40, 15, 0) }] },
    { id: "m1", cat: "misc", name: "Reiseversicherung", status: "paid", options: [{ id: "m1a", label: "Gruppe", price: P(24, 24, 24) }] }
  ],
  tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, days: {},
  detail: { flights: true, stay: true, transport: true, attractions: true, misc: true }
};
const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4183", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto("http://127.0.0.1:4183/");
  await reloadHome(p, { set: { "rk2-t:demo": TRIP, "rk2-index": [{ id: "demo", name: TRIP.name, place: TRIP.place }], "rk2-current": "demo" } });
  // Startseite (#533): Einstiege in zwei Spalten, Seite scrollt
  const acts = p.locator(".home-acts .home-act");
  await acts.first().waitFor();
  const [a0, a1] = [await acts.nth(0).boundingBox(), await acts.nth(1).boundingBox()];
  if (Math.abs(a0.y - a1.y) > 4 || a1.x <= a0.x) fail("Startseite: Kacheln nicht nebeneinander");
  if (await p.evaluate(() => getComputedStyle(document.body).overflow === "hidden")) fail("Startseite scrollt nicht");
  log("Startseite: Einstiege in zwei Spalten, Seite scrollbar");
  await p.locator(".home-trip", { hasText: "Kroatien" }).first().click();
  const on = () => p.locator(".mbar .mb.on").getAttribute("data-pg");
  await p.locator("main.pager").waitFor();
  if ((await p.locator(".mbar .mb").count()) !== 9) fail("Reiter: " + await p.locator(".mbar .mb").count());
  if (await on() !== "hero") fail("Start nicht auf der Übersicht");
  if (await p.locator(".mtabs").count()) fail("Reiter oben noch da");
  if (!/€/.test(await p.locator(".mbar .mb-tot").innerText())) fail("Gesamtsumme unten fehlt");
  if (await p.locator(".bug-fab").isVisible()) fail("Fehler melden schwebt noch");
  if (await p.locator(".dock").count()) fail("alte Leiste unten noch da");
  // Übersicht: nichts ragt über den Bildschirmrand (langer Name, Kostenbox)
  const wide = await p.evaluate(() => [...document.querySelectorAll(".pg-hero *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 40).map(e => e.className));
  if (wide.length) fail("Übersicht breiter als der Bildschirm: " + wide.join(", "));
  // Seite hat keine lange Seite mehr: Fenster scrollt nicht
  if ((await p.evaluate(() => document.documentElement.scrollHeight)) > 900) fail("Seite scrollt noch");
  // Leiste: Unterkunft
  await p.locator('.mbar [data-pg="stay"]').click();
  await until(async () => (await on()) === "stay", "Leiste Unterkunft");
  if (!(await p.locator('main.pager > [data-ch="stay"]').innerText()).includes("Ferienhaus mit Pool")) fail("Unterkunft: Posten fehlt");
  // wischen nach links: nächste Seite (erst, wenn der Sprung angekommen ist)
  await p.waitForTimeout(900);
  await p.evaluate(() => { const m = document.querySelector("main.pager"); m.scrollBy({ left: m.clientWidth }); });
  await until(async () => (await on()) === "transport", "wischen → Vor Ort");
  // Leiste: Tage, Abrechnung, Übersicht
  await p.locator('.mbar [data-pg="plan"]').click();
  await until(async () => (await on()) === "plan", "Leiste Tage");
  await p.locator('.mbar [data-pg="split"]').click();
  await until(async () => (await on()) === "split", "Leiste Abrechnung");
  await p.locator('.mbar [data-pg="hero"]').click();
  await until(async () => (await on()) === "hero", "Leiste Übersicht");
  // Kachel der Übersicht springt ins Kapitel
  await p.locator(".ht-tile.ht-st").click();
  await until(async () => (await on()) === "stay", "Kachel Unterkunft");
  // Posten kompakt (#531): eine Zeile, Antippen klappt auf, nur einer offen
  const stay = p.locator('main.pager > [data-ch="stay"]');
  const villa = stay.locator(".card[data-item=s1]");
  if (!(await villa.evaluate(e => e.classList.contains("compact")))) fail("Unterkunft nicht zugeklappt");
  if ((await villa.boundingBox()).height > 110) fail("zugeklappte Zeile zu hoch: " + (await villa.boundingBox()).height);
  if (!(await villa.innerText()).includes("1.792")) fail("Zeile ohne Preis: " + await villa.innerText());
  await villa.click();
  await until(async () => !(await villa.evaluate(e => e.classList.contains("compact"))), "Posten aufklappen");
  await villa.locator(".ic-fold").click();
  await until(async () => villa.evaluate(e => e.classList.contains("compact")), "Posten zuklappen");
  await p.locator('.mbar [data-pg="attractions"]').click();
  await until(async () => (await on()) === "attractions", "Reiter Erlebnisse");
  const att = p.locator('main.pager > [data-ch="attractions"]');
  await att.locator(".card[data-item=a1]").click();
  await att.locator(".card[data-item=a2]").click();
  await until(async () => (await att.locator(".card:not(.compact)").count()) === 1 && !(await att.locator(".card[data-item=a2]").evaluate(e => e.classList.contains("compact"))), "nur ein Posten offen");
  // Anbieter-Links erst auf „⋯“
  if (await att.locator(".fs-direct").isVisible()) fail("Anbieter-Links sichtbar ohne ⋯");
  await att.locator(".ch-links").click();
  if (!(await att.locator(".fs-direct").isVisible())) fail("⋯ zeigt keine Anbieter-Links");
  log("Posten zugeklappt als Zeile (Preis, Status), Antippen klappt auf, nur einer offen; Anbieter-Links hinter ⋯");
  // Abrechnung (#532): Familien als Karussell mit Reitern, Kasse und Zuschüsse dahinter
  await p.locator('.mbar [data-pg="split"]').click();
  await until(async () => (await on()) === "split", "Leiste Abrechnung");
  const sp = p.locator('main.pager > [data-ch="split"]');
  const shTabs = sp.locator(".sh-tab");
  if ((await shTabs.count()) !== 4) fail("Abrechnung: Reiter " + (await shTabs.allTextContents()).join(" | "));
  if (!(await shTabs.nth(0).innerText()).includes("Klein") || !(await shTabs.nth(1).innerText()).includes("Hase")) fail("Abrechnung: Familien in den Reitern");
  if (await sp.locator(".sh-cats details[open]").count()) fail("Abrechnung: Kapitel nicht zugeklappt");
  await shTabs.nth(1).click();
  await until(async () => (await sp.locator(".sh-tab.on").innerText()).includes("Hase"), "Reiter Hase");
  const hase = sp.locator("#hh-Hase");
  const vb = await sp.boundingBox();
  await until(async () => { const hb = await hase.boundingBox(); return hb.x >= vb.x - 2 && hb.x <= vb.x + 40; }, "Karussell zeigt Hase");
  await hase.locator(".sh-cats summary").first().click();
  if (!(await hase.locator(".sh-cats details[open] li").count())) fail("Kapitelzeile zeigt keine Posten");
  if ((await sp.evaluate(e => e.scrollHeight)) > 1300) fail("Abrechnung noch zu lang: " + await sp.evaluate(e => e.scrollHeight));
  log("Abrechnung: Familien als Karussell mit Beträgen in den Reitern, Kasse und Zuschüsse dahinter, Kapitel zugeklappt");
  // Mehr: Fehler melden, Kostenübersicht, Fußzeile
  await p.locator(".mbar .mb-tot").click();
  const sh = p.locator(".mb-sheet");
  await sh.waitFor();
  if (!(await sh.locator(".foot-legal").innerText()).includes("Impressum")) fail("Mehr: Fußzeile fehlt");
  await sh.locator(".sheet-x").click();
  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Handy: Pager mit 9 Seiten, Wischen, Leiste unten mit allen Seiten und Gesamtsumme (öffnet Mehr), Kachel springt ins Kapitel, kein langes Scrollen");
  console.log("\nHandy-Ansicht: alles in Ordnung");
} finally { await b.close(); server.kill(); }
