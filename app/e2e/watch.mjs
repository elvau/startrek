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
  // ohne Ziel, nur Flug nach Palma: Events zwischen Landung + 5 h und Rückflug − 5 h
  { id: "mallorca", name: "Mallorca-Kurztrip", place: "", country: "", travelers: people, ...base,
    items: [{ id: "mf", cat: "flights", name: "Flug", status: "chosen", options: [{ ...flightOpt("o5", 138, [L("out", "EIN", "PMI", "2027-10-15T10:00", "2027-10-15T12:20"), L("back", "PMI", "EIN", "2027-10-19T18:00", "2027-10-19T20:20")]), source: undefined }] }] },
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

  const evAsked = [];
  await p.route("https://flights.test/events/search", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    evAsked.push(JSON.parse(r.request().postData()));
    const e = (id, name, start) => ({ id, source: "ticketmaster", sourceName: "Ticketmaster", name, start, venue: "Son Moix", city: "Palma", cc: "ES" });
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ events: [e("p1", "Zu früh", "2027-10-15T14:00"), e("p2", "Fiesta Palma", "2027-10-16T21:00"), e("p3", "Zu spät", "2027-10-19T15:00")], sources: [{ id: "ticketmaster", name: "Ticketmaster", configured: true, ok: true, count: 3 }] }) });
  });

  // Startseite: geplant, gebucht, Archiv; Karte mit Ziel, Zeitraum, Nächten, Events, Verpflegung, Kosten
  await p.goto(URL);
  await p.locator(".start .home-title").waitFor();
  const heads = await p.locator(".start .home-h").allInnerTexts();
  if (heads.map(h => h.replace(/🧹[\s\S]*$/, "").replace(/\s*\(\d+\)/, "").trim()).join("|") !== "Geplante Reisen|Gebuchte Reisen|Vergangene Reisen") fail("Gruppen: " + heads.join("|"));
  const palma = await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).innerText();
  for (const s of ["Palma, Spanien", "3 Nächte", "2 Events", "Halbpension", "ca. "]) if (!palma.includes(s)) fail(`Karte Palma ohne „${s}“: ${palma}`);
  await until(async () => (await p.locator(".start .home-trip", { hasText: "Balkan" }).innerText()).includes("Rundreise: Kroatien, Montenegro"), "Rundreise mit Ländern");
  if (!(await p.locator(".start .home-trip", { hasText: "Balkan" }).innerText()).includes("gebucht")) fail("Balkan nicht als gebucht markiert");
  if (await p.locator(".start .home-trip", { hasText: "Rom 2025" }).isVisible()) fail("Archiv nicht zugeklappt");
  await p.locator(".start .home-past summary").click();
  await p.locator(".start .home-trip", { hasText: "Rom 2025" }).waitFor();
  log("Startseite: geplant, gebucht (Rundreise Kroatien, Montenegro), Archiv zugeklappt; Karte mit Ziel, Nächten, Events, Verpflegung, Kosten");
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/w-home.png`, fullPage: true });

  // Reise öffnen, Preise prüfen (an der Gesamtkalkulation): dieselben Angebote zum heutigen Preis
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).click();
  await p.locator(".aside .watch-run").click();
  await p.locator(".aside .watch-res").waitFor();
  const fq = asked.flights[0], sq = asked.stays[0];
  if (fq.from !== "DUS" || fq.to !== "PMI" || fq.depart !== "2027-05-07" || fq.ret !== "2027-05-10" || fq.adults !== 2) fail("Flug-Anfrage: " + JSON.stringify(fq));
  if (sq.place !== "Palma" || sq.checkin !== "2027-05-07" || sq.checkout !== "2027-05-10" || sq.adults !== 2) fail("Unterkunft-Anfrage: " + JSON.stringify(sq));
  if (asked.flights.length + asked.stays.length !== 2) fail("zu viele Suchen");
  const fl = await p.locator('[data-item="fl"] .wb').innerText();
  if (!fl.includes("▲") || !fl.includes("50")) fail("Flug ohne roten Pfeil +50: " + fl);
  if (!(await p.locator('[data-item="fl"]').innerText()).includes("470")) fail("neuer Flugpreis nicht übernommen: " + await p.locator('[data-item="fl"]').innerText());
  if (await p.locator('[data-item="st"] .wb-up, [data-item="st"] .wb-down').count()) fail("Unterkunft gleich teuer, trotzdem Pfeil");
  if (await p.locator('[data-item="st"] .wb-best').count()) fail("Preise prüfen schlägt fremde Angebote vor");
  const res = await p.locator(".aside .watch-res").innerText();
  if (!res.includes("1 Preis geändert") || !res.includes("+50")) fail("Ergebnis an der Gesamtkalkulation: " + res);
  log("Preise geprüft an der Gesamtkalkulation: genau dieselbe Suche, Flug auf 450 € aktualisiert (mit Anfahrt 470 €) (▲ 50 €), Unterkunft unverändert");
  if (process.env.SHOTS) {
    await p.screenshot({ path: `${process.env.SHOTS}/w-aside.png` });
    await p.locator('[data-item="fl"]').scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
    await p.screenshot({ path: `${process.env.SHOTS}/w-item.png` });
  }

  // je Posten: günstigere Unterkunft suchen und übernehmen
  await p.locator('[data-item="st"] .wb-cheaper').click();
  await p.locator('[data-item="st"] .wb-best').waitFor();
  const st = await p.locator('[data-item="st"] .wb').innerText();
  if (!st.includes("120") || !st.includes("Hostal Sol")) fail("Günstigeres für die Unterkunft: " + st);
  if (asked.stays.length !== 2 || asked.flights.length !== 1) fail("Günstigeres sucht nur diesen Posten");
  await p.locator('[data-item="st"] .wb-take').click();
  await until(() => p.locator('[data-item="st"] .wb-best').count().then(n => n === 0), "Vorschlag an der Unterkunft weg");
  if (!(await p.locator('[data-item="st"]').innerText()).includes("Hostal Sol")) fail("Hostal Sol nicht gewählt");
  log("Günstigeres je Posten: Hostal Sol 120 € günstiger, übernommen und gewählt");

  // Ergebnis bleibt nach dem Neuladen
  await p.reload();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).click();
  await p.locator('[data-item="fl"] .wb-up').waitFor();
  log("Ergebnis bleibt nach dem Neuladen");

  // Reise ohne Ziel mit Flug EIN → PMI: „Events & Aktivitäten“ im Kopf führt zu den Erlebnissen und sucht in Palma
  await p.evaluate(() => scrollTo(0, 0));
  await p.goto(URL);
  await p.locator(".start .home-trip", { hasText: "Mallorca-Kurztrip" }).click();
  await p.locator(".hero .ht-ev").click();
  // Touren & Tickets zuerst, Events im zweiten Reiter
  await p.locator("#attractions .modal.inline .xp-tab", { hasText: "Events" }).click();
  await p.locator("#attractions .modal.inline .xp-ev").first().waitFor();
  const pq = evAsked.at(-1);
  if (!/Palma/.test(pq?.city || "") || pq.from !== "2027-10-15" || pq.to !== "2027-10-19") fail("Events in Palma: " + JSON.stringify(pq));
  const evNames = await p.locator("#attractions .xp-ev b").allInnerTexts();
  if (evNames.join() !== "Fiesta Palma") fail("Events im Zeitfenster: " + evNames);
  const where = await p.locator("#attractions .xp-where").innerText();
  if (!where.includes("17:20") || !where.includes("13:00")) fail("Zeitfenster nicht angezeigt: " + where);
  log("Ohne Ziel, Flug nach Palma: „Events & Aktivitäten“ → Erlebnisse, nur Events ab Landung + 5 h bis Rückflug − 5 h");

  // Mietwagen aus den Flugzeiten (Richtwert), KAYAK mit Ort und Zeiten; Reiseversicherung als Schätzung
  const kayak = await p.locator("#transport .car-links a", { hasText: "KAYAK" }).getAttribute("href");
  if (kayak !== "https://www.kayak.de/cars/PMI/2027-10-15-13h/2027-10-19-16h") fail("KAYAK-Link: " + kayak);
  await p.locator("#transport .car-add").click();
  const car = p.locator("#transport .card", { hasText: "Mietwagen" });
  await car.waitFor();
  if (!(await car.innerText()).includes("200")) fail("Mietwagen-Richtwert (5 Tage × 40 €): " + await car.innerText());
  await p.keyboard.press("Escape");
  await p.locator("#misc .ins-add").click();
  const ins = p.locator("#misc .card", { hasText: "Reiseversicherung" });
  await ins.waitFor();
  log("Mietwagen: Abholung PMI 15.10. 13:20 bis 19.10. 16:00, Richtwert 5 × 40 €, KAYAK vorbefüllt; Reiseversicherung geschätzt");

  // aufgeklappte Suche gehört zur Reise: nach dem Wechsel in eine andere Reise ist sie zu
  await p.locator("#flights .fs-open").click();
  await p.locator("#flights .modal.inline").waitFor();
  await p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await p.locator(".top .brand-btn").click();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  await p.waitForTimeout(500);
  if (await p.locator(".modal.inline").count()) fail("Suche aus der anderen Reise noch offen");
  log("Reise gewechselt: aufgeklappte Flugsuche der vorigen Reise ist zu");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Reisebeobachtung ok");
} finally { await browser.close(); server.kill(); }
