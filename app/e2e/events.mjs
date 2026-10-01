/*
 * Reise zu einem Event: Such-Dienst nachgestellt, Vorschläge prüfen, einen übernehmen.
 * Start: npm run test:cloud (nach stays.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4177/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const SOURCES = [{ id: "kiwi", name: "Kiwi.com", configured: true, ok: true, count: 2, ms: 900 }];
const leg = (from, to, dep, arr) => ({ from, to, dep, arr, minutes: 75, stops: 0, route: [from, to], carriers: ["Test Air"], flights: ["TA1"] });

/** je Anfrage: ein früher Flug (passt) und ein günstigerer, der erst mittags landet (passt nur ab Vortag) */
function flights(q) {
  const from = q.fromAirports[0], to = q.toAirports[0];
  const back = q.depart === q.ret ? ["21:30", "22:45"] : ["18:00", "19:15"];
  return {
    offers: [
      { id: `early${q.depart}${q.ret}`, source: "kiwi", sourceName: "Kiwi.com", price: 400, currency: "EUR", url: "https://kiwi.com/u/early",
        out: leg(from, to, `${q.depart}T07:00:00`, `${q.depart}T08:15:00`), back: leg(to, from, `${q.ret}T${back[0]}:00`, `${q.ret}T${back[1]}:00`) },
      { id: `late${q.depart}${q.ret}`, source: "kiwi", sourceName: "Kiwi.com", price: 250, currency: "EUR", url: "https://kiwi.com/u/late",
        out: leg(from, to, `${q.depart}T12:00:00`, `${q.depart}T13:15:00`), back: leg(to, from, `${q.ret}T${back[0]}:00`, `${q.ret}T${back[1]}:00`) }
    ],
    sources: SOURCES
  };
}
const STAYS = {
  offers: [
    { id: "b:1", source: "booking", sourceName: "Booking.com", name: "Billig Inn", total: 90, currency: "EUR", score: 6.1 },
    { id: "b:3", source: "booking", sourceName: "Booking.com", name: "Airport Lodge", total: 130, currency: "EUR", score: 8.9, lat: 51.47, lon: -0.45 },
    { id: "b:2", source: "booking", sourceName: "Booking.com", name: "Highbury Rooms", total: 160, currency: "EUR", score: 8.6, place: "Islington, London", lat: 51.558, lon: -0.103 }
  ],
  sources: [{ id: "booking", name: "Booking.com", configured: true, ok: true, count: 2, ms: 800 }]
};

const EVENTS = {
  events: [
    { id: "fd:1", source: "footballdata", sourceName: "football-data.org", name: "Arsenal – Bayern", start: "2027-05-15T15:30", venue: "Emirates Stadium", cc: "GB",
      address: "75 Drayton Park London N5 1BU", category: "UEFA Champions League", lat: 51.555, lon: -0.108, url: "https://tickets.example/ars-fcb" },
    { id: "fd:2", source: "footballdata", sourceName: "football-data.org", name: "Chelsea – Arsenal", start: "2027-05-22T17:30", venue: "Stamford Bridge", cc: "GB", category: "Premier League" },
    // gleiche ID doppelt (älterer Such-Dienst): die Liste darf nicht leer bleiben
    { id: "fd:2", source: "footballdata", sourceName: "football-data.org", name: "Chelsea – Arsenal (VIP)", start: "2027-05-23T17:30", cc: "GB" }
  ],
  sources: [{ id: "footballdata", name: "football-data.org", configured: true, ok: true, count: 2 }]
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4177", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [], stays = [];
  const cors = { "access-control-allow-origin": "*" };
  // die erste Flugsuche scheitert bei Kiwi (überlastet): die App versucht es einmal neu
  let kiwiDown = true;
  await p.route("https://flights.test/flights/search", async r => {
    const q = JSON.parse(r.request().postData());
    asked.push(q);
    const down = { offers: [], sources: [{ id: "kiwi", name: "Kiwi.com", configured: true, ok: false, count: 0, ms: 8000, error: "keine Antwort nach 25 s" }] };
    const body = kiwiDown ? down : flights(q);
    kiwiDown = false;
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  });
  await p.route("https://flights.test/stays/search", async r => {
    stays.push(JSON.parse(r.request().postData()));
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(STAYS) });
  });
  const evAsked = [];
  await p.route("https://flights.test/events/search", async r => {
    const q = JSON.parse(r.request().postData());
    evAsked.push(q);
    // „Events vor Ort“: nach Stadt und Zeitraum, mit Ticketpreis
    const body = q.city ? { events: [{ id: "tm:77", source: "ticketmaster", sourceName: "Ticketmaster", name: "Coldplay", start: "2027-05-15T20:00", venue: "Wembley Stadium", city: "London", cc: "GB", url: "https://tickets.example/coldplay", price: { min: 89, max: 250, currency: "EUR" } }],
      sources: [{ id: "ticketmaster", name: "Ticketmaster", configured: true, ok: true, count: 1 }] }
      // Champions League gegen eine Mannschaft ohne Anschrift: nur das Land ist bekannt (Fehlerbericht #14)
      : q.q === "Sabah" ? { events: [{ id: "fd:9", source: "footballdata", sourceName: "football-data.org", name: "Sabah FK – Dortmund", start: "2027-10-20T20:45", cc: "AZ", category: "UEFA Champions League" }],
        sources: [{ id: "footballdata", name: "football-data.org", configured: true, ok: true, count: 1 }] } : EVENTS;
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  });
  await p.route("https://media-cdn.tripadvisor.com/**", r => r.fulfill({ path: "public/brand/logo-120.png" }));
  const tourAsked = [];
  await p.route("https://flights.test/activities/search", async r => {
    tourAsked.push(JSON.parse(r.request().postData()));
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ activities: [
      { id: "viator:1", source: "viator", sourceName: "Viator", title: "Tower of London: Kronjuwelen", rating: 4.7, reviews: 5210, minutes: 180, price: 42, currency: "EUR", url: "https://www.viator.com/t/1", image: "https://media-cdn.tripadvisor.com/media/tower.jpg" }
    ], sources: [{ id: "viator", name: "Viator", configured: true, ok: true, count: 1 }] }) });
  });
  for (const f of ["airports.json", "world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  await p.goto(URL);

  // Start mit „Zu einem Event“: legt die Reise an und öffnet den Planer
  await p.locator(".start .home-event").click();
  const m = p.locator(".modal");
  await m.locator(".ev-form").waitFor();
  // Event suchen und auswählen: Name, Stadt (aus der Anschrift), Stadion, Datum, Uhrzeit werden ausgefüllt
  // auf einem kleinen Handy: die Treffer müssen sichtbar sein (die Liste wurde im Fenster auf 0 zusammengedrückt)
  await p.setViewportSize({ width: 406, height: 761 });
  await m.locator(".ev-find input").fill("Arsenal");
  await m.locator(".ev-find .btn").click();
  await m.locator(".ev-hit").first().waitFor();
  const box = await m.locator(".ev-hits").boundingBox();
  if (!box || box.height < 100) fail("Treffer auf dem Handy nicht sichtbar, Höhe " + box?.height);
  await p.setViewportSize({ width: 1280, height: 900 });
  if (evAsked[0]?.q !== "Arsenal") fail("Event-Suche: " + JSON.stringify(evAsked));
  if ((await m.locator(".ev-hit").count()) !== 2) fail("nicht zwei Termine");
  await m.locator(".ev-hit", { hasText: "Arsenal – Bayern" }).click();
  const val = async label => m.locator("label.f", { hasText: label }).locator("input").inputValue();
  if (await val("Was?") !== "Arsenal – Bayern" || await val("Wo genau?") !== "Emirates Stadium" || await val("Datum") !== "2027-05-15" || await val("Beginn") !== "15:30") fail("Felder nicht ausgefüllt");
  // Stadt kommt nach dem Laden der Orte aus der Anschrift, das Ziel aus der Lage des Stadions: Flughäfen im Umkreis
  const dest = m.locator(".ev-form .lp").first().locator("input");
  for (let i = 0; i < 40 && !(await dest.inputValue()).startsWith("Umkreis London"); i++) await p.waitForTimeout(150);
  if (!/^Umkreis London: .*LHR/.test(await dest.inputValue())) fail("Ziel nicht aus Stadt und Stadion: " + await dest.inputValue());
  // antippen: Flughäfen rund ums Stadion zur Auswahl
  await dest.focus();
  if (!(await m.locator(".lp-list li", { hasText: "LCY" }).count())) fail("Flughäfen am Stadion nicht zur Auswahl");
  await dest.press("Escape");
  log("Event gesucht und übernommen: Name, Stadt, Stadion, Datum, Uhrzeit; Ziel aus der Lage des Stadions, Flughäfen dort zur Auswahl");
  // Abflughäfen: vorausgewählte abwählen, weitere hinzufügen
  const chips = m.locator(".ev-form .fs-aps .chip");
  const first = (await chips.first().textContent()).trim();
  await chips.first().click();
  await m.locator(".ev-form .fs-add input").fill("AMS");
  await m.locator(".lp-list li", { hasText: "AMS" }).first().click();
  if (!(await m.locator(".ev-form .fs-aps .chip.on", { hasText: "AMS" }).count())) fail("AMS nicht hinzugefügt");
  await m.locator("label.f", { hasText: "Dauer" }).locator("input").fill("2");
  await m.locator(".ev-form .btn.primary").click();
  await m.locator(".ev-card").first().waitFor();

  // drei Vorschläge: ohne Nacht, eine Nacht, ab Vortag; je eine Flug- und (mit Nacht) eine Unterkunftssuche
  const cards = m.locator(".ev-card");
  if ((await cards.count()) !== 3) fail("nicht drei Vorschläge: " + (await cards.count()));
  if (asked.length !== 4) fail("gescheiterte Flugsuche nicht wiederholt: " + asked.length);
  const dates = [...new Set(asked.map(q => `${q.depart}/${q.ret}`))].sort();
  if (dates.join() !== "2027-05-14/2027-05-16,2027-05-15/2027-05-15,2027-05-15/2027-05-16") fail("Flugsuchen: " + dates);
  if (!asked.every(q => q.toAirports.includes("LHR") && q.fromAirports.includes("AMS") && !q.fromAirports.includes(first) && !q.bags)) fail("Anfrage falsch: " + JSON.stringify(asked[0]));
  if (stays.length !== 2 || !stays.every(s => s.place === "London" && s.type === "all")) fail("Unterkunftssuche: " + JSON.stringify(stays));
  log("Drei Vorschläge aus drei Flug- und zwei Unterkunftssuchen, gescheiterte Flugsuche (Kiwi) einmal wiederholt");

  // am Spieltag nur der frühe Flug (landet 08:15), ab Vortag der günstigere; Unterkunft: gut bewertet
  const day = cards.filter({ hasText: "Tagesausflug" });
  if (!(await day.locator(".ev-line", { hasText: "07:00" }).count())) fail("Tagesausflug: später Flug genommen");
  if (!(await day.locator(".ev-line", { hasText: "Ohne Übernachtung" }).count())) fail("Tagesausflug mit Unterkunft");
  const relaxed = cards.filter({ hasText: "Entspannt ab Vortag" });
  if (!(await relaxed.locator(".ev-line", { hasText: "12:00" }).count())) fail("ab Vortag: günstigerer Flug fehlt");
  const short = cards.filter({ hasText: "Mit einer Nacht" });
  if (!(await short.locator(".ev-line", { hasText: "Highbury Rooms" }).count())) fail("Unterkunft nicht die nahe gut bewertete");
  if (!(await short.locator(".ev-line", { hasText: "km zum Veranstaltungsort" }).count())) fail("Entfernung zum Stadion fehlt");
  if (!(await m.locator("a.ev-tickets").count())) fail("Ticket-Link fehlt");
  log("Passende Flüge je Vorschlag, gut bewertete Unterkunft");

  // übernehmen: Reise heißt wie das Event, Daten gesetzt, Flug und Unterkunft angelegt
  await short.locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".ev-done").waitFor();
  await m.locator(".x").first().click();
  await p.locator(".hero h1", { hasText: "Arsenal – Bayern" }).waitFor();
  const meta = await p.locator(".hero .meta").innerText();
  if (!meta.includes("London") || !meta.includes("1 Nacht")) fail("Kopf: " + meta);
  if (!(await p.locator(".hero .ev-hero", { hasText: "Emirates Stadium" }).count())) fail("Event nicht im Kopf");
  if (!(await p.locator("#flights .card", { hasText: "Test Air" }).count())) fail("Flug nicht übernommen");
  if (!(await p.locator("#stay .card", { hasText: "Highbury Rooms" }).count())) fail("Unterkunft nicht übernommen");
  log("Vorschlag übernommen: Name, Daten, Flug und Unterkunft");

  // Erlebnisse finden: was am Reiseort im Reisezeitraum läuft, Touren; Übernehmen legt Posten an
  // Touren & Tickets zuerst, dann Events vor Ort
  const attBtns = await p.locator("#attractions .search-row .btn").allInnerTexts();
  if (!attBtns[0]?.includes("Touren") || !attBtns[1]?.includes("Events")) fail("Reihenfolge Erlebnisse: " + attBtns);
  await p.locator("#attractions .xp-open").click();
  const x = p.locator(".modal .xp");
  await x.locator(".xp-ev").first().waitFor();
  const eq = evAsked[evAsked.length - 1];
  if (eq.city !== "London" || eq.from !== "2027-05-15" || eq.to !== "2027-05-16" || eq.q !== "" || eq.lat == null) fail("Events vor Ort: " + JSON.stringify(eq));
  if (!(await x.locator(".xp-ev", { hasText: "ab 89" }).count())) fail("Ticketpreis fehlt");
  await x.locator(".xp-ev", { hasText: "Coldplay" }).locator(".xp-take").click();
  await x.locator(".xp-ev .xp-take", { hasText: "In der Reise" }).waitFor();
  await x.locator(".xp-tab", { hasText: "Touren" }).click();
  await x.locator(".xp-tour").first().waitFor();
  if (tourAsked[0]?.place !== "London" || tourAsked[0]?.lang !== "de" || tourAsked[0]?.from !== "2027-05-15") fail("Touren-Anfrage: " + JSON.stringify(tourAsked));
  await x.locator(".xp-tour .xp-take").click();
  await p.keyboard.press("Escape");
  const att = p.locator("#attractions");
  await att.locator(".card", { hasText: "Coldplay" }).waitFor();
  if (!(await att.locator(".card", { hasText: "Tower of London" }).count())) fail("Tour nicht übernommen");
  await att.locator(".card", { hasText: "Tower of London" }).locator(".row-img").waitFor();
  const prices = () => p.evaluate(() => { const t = JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current"))); return t.items.filter(i => i.cat === "attractions").map(i => i.options[0].price.adult).join(); });
  for (let i = 0; i < 20 && (await prices()) !== "89,42"; i++) await p.waitForTimeout(150);
  if ((await prices()) !== "89,42") fail("Preise der Erlebnisse: " + await prices());
  log("Erlebnisse: Events vor Ort (Stadt, Zeitraum, Preis ab 89 €) und Tour (42 €, mit Foto) als Posten übernommen");

  // nur das Land bekannt (Sabah FK, Aserbaidschan): Hauptstadt Baku angenommen, mit Hinweis zum Prüfen
  // Event-Planer auch im Kapitel Erlebnisse, mit dem gewählten Event
  if (!(await att.locator(".att-event", { hasText: "Emirates Stadium" }).count())) fail("Event nicht bei den Erlebnissen");
  await att.locator(".att-ev", { hasText: "Event ändern" }).click();
  log("Erlebnisse: gewähltes Event und „Event ändern“ öffnet den Event-Planer");
  const m2 = p.locator(".modal");
  await m2.locator(".ev-find input").fill("Sabah");
  await m2.locator(".ev-find .btn").click();
  await m2.locator(".ev-hit", { hasText: "Sabah FK" }).click();
  const city2 = m2.locator(".ev-form .lp").first().locator("input");
  for (let i = 0; i < 40 && (await city2.inputValue()) !== "Baku"; i++) await p.waitForTimeout(150);
  if ((await city2.inputValue()) !== "Baku") fail("keine Stadt bei Sabah FK: " + await city2.inputValue());
  if (!(await m2.locator(".ev-guess", { hasText: "Baku" }).count())) fail("Hinweis zur angenommenen Stadt fehlt");
  await p.keyboard.press("Escape");
  log("Event nur mit Land (Sabah FK): Hauptstadt Baku angenommen, Hinweis zum Prüfen");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Event-Reise ok");
} finally { await browser.close(); server.kill(); }
