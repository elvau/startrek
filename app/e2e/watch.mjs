/*
 * Startseite mit geplanten, gebuchten und vergangenen Reisen; Reisebeobachtung: Preise prüfen,
 * Pfeile an den Posten, Potenzial unten, günstigere Unterkunft übernehmen. Such-Dienst nachgestellt.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4179/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };

const people = [{ id: "a", name: "Anna", household: "Klein" }, { id: "b", name: "Ben", household: "Klein" }];
const base = { tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, households: {} };
const L = (dir, from, to, dep, arr) => ({ dir, from, to, dep, arr, carrier: "Sun Air", stops: 0 });
const flightOpt = (id, price, legs) => ({ id, label: "Sun Air ab DUS, direkt", price: { mode: "unit", currency: "EUR", unit: price }, source: { name: "Kiwi.com", at: "2026-09-01" }, legs });
const stayOpt = (id, name, price, q) => ({ id, label: name, price: { mode: "unit", basis: "stay", currency: "EUR", unit: price, capacity: 2 }, source: { name: "Booking.com", at: "2026-09-01" }, query: q });
const q = { place: "Palma", country: "Spanien", checkin: "2027-05-07", checkout: "2027-05-10", adults: 2, childAges: [], rooms: 1 };

const TRIPS = [
  { id: "palma", name: "Sonne in Palma", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-10", travelers: people, ...base,
    event: { name: "Konzert", start: "2027-05-08T20:00" }, food: { on: true, style: "hb" },
    items: [
      { id: "fl", cat: "flights", name: "Flug", status: "chosen", options: [flightOpt("o1", 400, [L("out", "DUS", "PMI", "2027-05-07T08:00", "2027-05-07T10:30"), L("back", "PMI", "DUS", "2027-05-10T18:00", "2027-05-10T20:30")])] },
      { id: "st", cat: "stay", name: "Unterkunft Palma", status: "idea", from: "2027-05-07", to: "2027-05-10", options: [stayOpt("o2", "Casa Palma", 600, q)] },
      { id: "at", cat: "attractions", name: "Bootstour", status: "idea", options: [{ id: "o3", label: "", price: { mode: "person", currency: "EUR", adult: 40 } }] }
    ] },
  { id: "balkan", name: "Balkan", place: "Split", country: "Kroatien", from: "2027-08-01", to: "2027-08-10", travelers: people, ...base,
    items: [{ id: "rf", cat: "flights", name: "Rundreise", status: "booked", options: [flightOpt("o4", 700, [L("out", "DUS", "SPU", "2027-08-01T08:00", "2027-08-01T10:00"), L("via", "SPU", "TGD", "2027-08-05T12:00", "2027-08-05T13:00"), L("back", "TGD", "DUS", "2027-08-10T15:00", "2027-08-10T17:30")])] }] },
  { id: "rom", name: "Rom 2025", place: "Rom", country: "Italien", from: "2025-04-01", to: "2025-04-05", travelers: people, ...base, items: [] }
];

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4179", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await ctx.addInitScript(trips => {
    if (localStorage.getItem("rk2-index")) return;
    for (const t of trips) localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify(trips.map(t => ({ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 2 }))));
    localStorage.setItem("rk2-current", trips[0].id);
  }, TRIPS);
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  for (const f of ["airports.json", "world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  const asked = { flights: [], stays: [] };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  const leg = (from, to, dep, arr) => ({ from, to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["Sun Air"], flights: ["SA1"] });
  await p.route("https://flights.test/flights/search", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    asked.flights.push(JSON.parse(r.request().postData()));
    const offer = (price, dep) => ({ id: "x" + price, source: "kiwi", sourceName: "Kiwi.com", price, currency: "EUR", out: leg("DUS", "PMI", dep, "2027-05-07T10:30:00"), back: leg("PMI", "DUS", "2027-05-10T18:00:00", "2027-05-10T20:30:00") });
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offers: [offer(450, "2027-05-07T08:00:00"), offer(480, "2027-05-07T13:00:00")], sources: [] }) });
  });
  await p.route("https://flights.test/stays/search", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    asked.stays.push(JSON.parse(r.request().postData()));
    const s = (name, total) => ({ id: name, source: "booking", sourceName: "Booking.com", name, total, currency: "EUR", score: 8.4 });
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offers: [s("Casa Palma", 600), s("Hostal Sol", 480)], sources: [] }) });
  });

  // Startseite: geplant, gebucht, Archiv; Karte mit Ziel, Zeitraum, Nächten, Events, Verpflegung, Kosten
  await p.goto(URL);
  await p.locator(".start .home-title").waitFor();
  const heads = await p.locator(".start .home-h").allInnerTexts();
  if (heads.map(h => h.replace(/\s*\(\d+\)/, "").trim()).join("|") !== "Geplante Reisen|Gebuchte Reisen|Vergangene Reisen") fail("Gruppen: " + heads.join("|"));
  const palma = await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).innerText();
  for (const s of ["Palma, Spanien", "3 Nächte", "2 Events", "Halbpension", "ca. "]) if (!palma.includes(s)) fail(`Karte Palma ohne „${s}“: ${palma}`);
  await until(async () => (await p.locator(".start .home-trip", { hasText: "Balkan" }).innerText()).includes("Rundreise: Kroatien, Montenegro"), "Rundreise mit Ländern");
  if (!(await p.locator(".start .home-trip", { hasText: "Balkan" }).innerText()).includes("gebucht")) fail("Balkan nicht als gebucht markiert");
  if (await p.locator(".start .home-trip", { hasText: "Rom 2025" }).isVisible()) fail("Archiv nicht zugeklappt");
  await p.locator(".start .home-past summary").click();
  await p.locator(".start .home-trip", { hasText: "Rom 2025" }).waitFor();
  log("Startseite: geplant, gebucht (Rundreise Kroatien, Montenegro), Archiv zugeklappt; Karte mit Ziel, Nächten, Events, Verpflegung, Kosten");
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/w-home.png`, fullPage: true });

  // Reise öffnen, Preise prüfen
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).click();
  await p.locator(".hero .watch-btn").click();
  await until(() => p.locator(".watch-pot b").count().then(n => n > 0), "Ergebnis der Beobachtung");
  const fq = asked.flights[0], sq = asked.stays[0];
  if (fq.from !== "DUS" || fq.to !== "PMI" || fq.depart !== "2027-05-07" || fq.ret !== "2027-05-10" || fq.adults !== 2) fail("Flug-Anfrage: " + JSON.stringify(fq));
  if (sq.place !== "Palma" || sq.checkin !== "2027-05-07" || sq.checkout !== "2027-05-10" || sq.adults !== 2) fail("Unterkunft-Anfrage: " + JSON.stringify(sq));
  if (asked.flights.length + asked.stays.length !== 2) fail("zu viele Suchen");
  const fl = await p.locator('[data-item="fl"] .wb').innerText();
  if (!fl.includes("▲") || !fl.includes("50")) fail("Flug ohne roten Pfeil +50: " + fl);
  const st = await p.locator('[data-item="st"] .wb').innerText();
  if (!st.includes("▼") || !st.includes("120") || !st.includes("Hostal Sol")) fail("Unterkunft ohne grünen Pfeil −120: " + st);
  const pot = await p.locator(".watch-pot b").innerText();
  if (!pot.includes("120")) fail("Potenzial: " + pot);
  if (!(await p.locator(".watch-rise b").innerText()).includes("50")) fail("Teurer geworden fehlt");
  if (!(await p.locator(".hero .watch-btn").innerText()).includes("120")) fail("Knopf zeigt Ersparnis nicht");
  log("Preise geprüft: genau dieselbe Suche; Flug ▲ 50 €, Unterkunft ▼ 120 € (Hostal Sol), Potenzial 120 €");
  if (process.env.SHOTS) {
    await p.locator('[data-item="st"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${process.env.SHOTS}/w-item.png` });
    await p.locator(".watch").scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${process.env.SHOTS}/w-panel.png` });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('[data-item="fl"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${process.env.SHOTS}/w-item-m.png` });
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
    await p.screenshot({ path: `${process.env.SHOTS}/w-hero-m.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
  }

  // günstigere Unterkunft übernehmen: gewählt, Pfeil weg, Potenzial 0
  await p.locator('[data-item="st"] .wb-take').click();
  await until(() => p.locator('[data-item="st"] .wb').count().then(n => n === 0), "Pfeil an der Unterkunft weg");
  if (!(await p.locator('[data-item="st"]').innerText()).includes("Hostal Sol")) fail("Hostal Sol nicht gewählt");
  await until(async () => (await p.locator(".watch-pot b").innerText()).includes("Nichts Günstigeres"), "Potenzial aufgebraucht");
  log("Günstigere Unterkunft übernommen: gewählt, Pfeil weg, kein Potenzial mehr");

  // zurück: Karte zeigt kein Potenzial mehr, Ergebnis bleibt nach dem Neuladen
  await p.reload();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).click();
  await p.locator('[data-item="fl"] .wb-up').waitFor();
  log("Ergebnis bleibt nach dem Neuladen");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Reisebeobachtung ok");
} finally { await browser.close(); server.kill(); }
