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
  // nahes Ziel mit 12 Personen aus Köln: Bahn, Fernbus, Auto und Reisebus statt Flug
  { id: "berlin", name: "Berlin-Wochenende", place: "Berlin", country: "Deutschland", from: "2027-06-04", to: "2027-06-06", ...base,
    travelers: Array.from({ length: 12 }, (_, i) => ({ id: "k" + i, name: "Kegler " + (i + 1), household: "Kegelclub" })),
    households: { Kegelclub: { plz: "50667", geo: { ort: "Köln", lat: 50.94, lon: 6.96 } } }, items: [] },
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
  // Spanien: Preisniveau 0,8 → 34 € am Tag statt 40 €
  if (!(await car.innerText()).includes("170")) fail("Mietwagen-Richtwert (5 Tage × 34 €): " + await car.innerText());
  await p.keyboard.press("Escape");
  // Flughafentransfer PMI → Palma: Taxi für 2, Richtwert hin und zurück, Anbieter zum Vergleichen
  const trInfo = p.locator("#transport .tr-links");
  await until(async () => (await trInfo.count()) && (await trInfo.innerText()).includes("PMI → Palma"), "Transfer PMI → Palma", 10000);
  if (!(await trInfo.innerText()).includes("Taxi") || !(await trInfo.locator("a", { hasText: "Kiwitaxi" }).count())) fail("Transfer-Hinweis: " + await trInfo.innerText());
  await p.locator("#transport .tr-add").click();
  const tr = p.locator("#transport .card[data-item]", { hasText: "Flughafentransfer" });
  await tr.waitFor();
  await until(async () => /\d+ €/.test(await tr.innerText()), "Transfer-Posten mit Richtwert");
  await p.keyboard.press("Escape");
  log("Flughafentransfer PMI → Palma: Taxi für 2, Richtwert hin und zurück als Posten, Kiwitaxi & Co. zum Vergleichen");
  await p.locator("#misc .ins-add").click();
  const ins = p.locator("#misc .card", { hasText: "Reiseversicherung" });
  await ins.waitFor();
  log("Mietwagen: Abholung PMI 15.10. 13:20 bis 19.10. 16:00, Richtwert 5 × 34 € (Preisniveau Spanien), KAYAK vorbefüllt; Reiseversicherung geschätzt");

  // aufgeklappte Suche gehört zur Reise: nach dem Wechsel in eine andere Reise ist sie zu
  await p.locator("#flights .fs-open").click();
  await p.locator("#flights .modal.inline").waitFor();
  // ohne Wohnort: Hinweis mit PLZ-Feld; Hamburger PLZ → Hamburg als Abflughafen (nicht mehr nur NRW)
  const fsm = p.locator("#flights .modal.inline");
  if (!(await fsm.locator(".fs-nohome").isVisible())) fail("Hinweis „Wohnort fehlt“ fehlt");
  await fsm.locator(".fs-plz").fill("20095");
  await until(async () => (await fsm.locator(".fs-aps .chip.on").allInnerTexts()).join() .startsWith("HAM"), "Hamburg als Abflughafen", 10000);
  if (await fsm.locator(".fs-nohome").count()) fail("Hinweis bleibt nach PLZ");
  log("Ohne Wohnort: PLZ in der Flugsuche, danach Hamburg zuerst (" + (await fsm.locator(".fs-aps .chip.on").allInnerTexts()).join(", ") + ")");
  await p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await p.locator(".top .brand-btn").click();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  await p.waitForTimeout(500);
  if (await p.locator(".modal.inline").count()) fail("Suche aus der anderen Reise noch offen");
  log("Reise gewechselt: aufgeklappte Flugsuche der vorigen Reise ist zu");
  if (await p.locator("#transport .ground").count()) fail("Palma ist kein nahes Ziel");

  // nahes Ziel: Bahn, Fernbus, Auto, Reisebus mit Richtwerten; bahn.de vorbefüllt; Reisebus als Posten
  await p.locator(".top .brand-btn").click();
  await p.locator(".start .home-trip", { hasText: "Berlin-Wochenende" }).click();
  const gr = p.locator("#transport .ground");
  await gr.waitFor();
  const grText = await gr.innerText();
  if (await p.locator("#transport .tr-links").count()) fail("nahes Ziel ohne Flug: kein Flughafentransfer");
  for (const w of ["Köln", "Berlin", "Bahn", "Fernbus", "Auto", "Reisebus"]) if (!grText.includes(w)) fail("Bahn/Bus-Vorschlag ohne " + w + ": " + grText);
  // Flug zum Vergleich von Tür zu Tür: nächster eigener Flughafen (CGN), 2 h vorher da, eine Art am schnellsten
  await until(async () => (await gr.locator(".gr-flight").count()) > 0, "Flug im Zeitvergleich");
  const grFl = await gr.locator(".gr-flight").innerText();
  if (!grFl.includes("CGN → BER") || !grFl.includes("2 h vorher da") || !grFl.includes("zum Flughafen")) fail("Flug von Tür zu Tür: " + grFl);
  if ((await gr.locator(".gr-best").count()) !== 1) fail("schnellste Art nicht markiert");
  await gr.screenshot({ path: process.env.SHOT || "/dev/null" }).catch(() => {});
  const bahn = await gr.locator("a", { hasText: "bahn.de" }).getAttribute("href");
  if (!bahn.includes("so=K%C3%B6ln") || !bahn.includes("zo=Berlin") || !bahn.includes("hd=2027-06-04")) fail("bahn.de-Link: " + bahn);
  await gr.locator(".gr-coach-add").click();
  const coach = p.locator("#transport .card[data-item]", { hasText: "Reisebus" });
  await coach.waitFor();
  await until(async () => /Köln → Berlin[\s\S]*\d €/.test(await coach.innerText()), "Reisebus-Posten mit Richtwert");
  await p.keyboard.press("Escape");
  log("Köln → Berlin, 12 Personen: Flug von Tür zu Tür (2 h vorher), Bahn, Fernbus, Auto, Reisebus mit Richtwerten, bahn.de vorbefüllt, Reisebus als Posten");

  // große Gruppe: Flüge in Buchungen à höchstens 5 (12 → 3 × 4), Ferienwohnungen auf 2 Unterkünfte à 6
  await p.locator("#flights .fs-open").click();
  const fm = p.locator("#flights .modal.inline");
  await fm.waitFor();
  if ((await fm.locator(".fs-split select").inputValue()) !== "4") fail("Buchungsgröße: " + await fm.locator(".fs-split select").inputValue());
  const fh = await fm.locator(".fs-split-hint").innerText();
  if (!fh.includes("12 Personen in 3 Buchungen à 4")) fail("Hinweis Aufteilen: " + fh);
  // Suche läuft für eine Buchung (4 Personen), Preise × 3 auf alle 12
  const nFl = asked.flights.length;
  await fm.locator("label.f", { hasText: "Nach" }).locator("input").fill("PMI");
  await fm.locator("form.fs-form > button.btn.primary").click();
  await until(() => asked.flights.length > nFl, "Flugsuche für eine Buchung", 15000);
  if (asked.flights.slice(nFl).some(q => q.adults !== 4)) fail("Flugsuche nicht je Buchung: " + JSON.stringify(asked.flights.slice(nFl).map(q => q.adults)));
  await until(async () => (await fm.innerText()).includes("1.350"), "Preis × 3 (3 × 450 €)", 15000);
  await fm.locator(".fs-split select").selectOption("9");
  await until(async () => (await fm.locator(".fs-split-hint").innerText().catch(() => "")).includes("2 Buchungen à 6"), "höchstens 9 je Suche");
  await p.locator("#flights .fs-open").click();
  await p.locator("#stay .st-open").click();
  const sm = p.locator("#stay .modal.inline");
  await sm.waitFor();
  await sm.locator(".chip", { hasText: "Ganze Unterkunft" }).click();
  if ((await sm.locator(".st-parts").inputValue()) !== "2") fail("Unterkünfte für 12: " + await sm.locator(".st-parts").inputValue());
  // Hotel ebenso aufgeteilt (Anbieter liefern für so viele kaum etwas), ein Zimmer je zwei Gäste
  await sm.locator(".chip", { hasText: "Hotel" }).click();
  await until(async () => (await sm.locator(".st-parts").inputValue()) === "2" && (await sm.locator("input[type=number]").last().inputValue()) === "3", "Hotel: 2 × 3 Zimmer");
  await sm.locator(".chip", { hasText: "Ganze Unterkunft" }).click();
  const nStays = asked.stays.length;
  await sm.locator("form.fs-form > button.btn.primary").click();
  await until(() => asked.stays.length > nStays, "Unterkunftssuche für eine Unterkunft");
  if (asked.stays.at(-1).adults !== 6 || asked.stays.at(-1).rooms !== 1) fail("Anfrage je Unterkunft: " + JSON.stringify(asked.stays.at(-1)));
  await sm.locator(".st-times").first().waitFor();
  await sm.locator(".fs-res", { hasText: "Hostal Sol" }).locator("button.primary").click();
  const fin = p.locator("#stay .card[data-item]", { hasText: "Hostal Sol" });
  await fin.waitFor();
  await until(async () => (await fin.innerText()).includes("960"), "Unterkunft 2 × 480 €");
  // Gesamtanzeige bei kleinem Fenster: passt hinein, scrollt selbst; Posten einer Kategorie erst auf ▾
  await p.setViewportSize({ width: 1280, height: 480 });
  await p.locator("#stay").scrollIntoViewIfNeeded();
  await p.waitForTimeout(600);
  const tk = await p.evaluate(() => { const a = document.querySelector(".aside").getBoundingClientRect(), b = document.querySelector(".aside .tk-b"); return { bottom: a.bottom, h: innerHeight, scroll: b.scrollHeight > b.clientHeight, ov: getComputedStyle(b).overflowY }; });
  if (tk.bottom > tk.h + 1 || !tk.scroll || tk.ov !== "auto") fail("Gesamtanzeige ragt aus dem Fenster oder scrollt nicht: " + JSON.stringify(tk));
  const stayCat = p.locator(".aside .cat", { hasText: "Unterkunft" });
  if (await stayCat.locator(".cat-d").isVisible()) fail("Posten der Kategorie ohne Wunsch aufgeklappt");
  await stayCat.locator(".cat-t").click();
  if (!(await stayCat.locator(".cat-d").innerText()).includes("960")) fail("Posten nach ▾ nicht sichtbar");
  await p.setViewportSize({ width: 1280, height: 900 });
  log("Gesamtanzeige: passt ins Fenster (eigener Scrollbalken), Posten je Kategorie auf ▾");
  log("Große Gruppe: Flug in 3 Buchungen à 4, gesucht für 4, Preise × 3 (wählbar, max. 9 je Suche); Ferienwohnung auf 2 Unterkünfte à 6, gesucht für 6, übernommen 2 × 480 €");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Reisebeobachtung ok");
} finally { await browser.close(); server.kill(); }
