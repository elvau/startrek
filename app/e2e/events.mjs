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
    { id: "b:2", source: "booking", sourceName: "Booking.com", name: "Highbury Rooms", total: 160, currency: "EUR", score: 8.6, place: "Islington, London" }
  ],
  sources: [{ id: "booking", name: "Booking.com", configured: true, ok: true, count: 2, ms: 800 }]
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
  await p.route("https://flights.test/flights/search", async r => {
    const q = JSON.parse(r.request().postData());
    asked.push(q);
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(flights(q)) });
  });
  await p.route("https://flights.test/stays/search", async r => {
    stays.push(JSON.parse(r.request().postData()));
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(STAYS) });
  });
  for (const f of ["airports.json", "world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  await p.goto(URL);

  // Start mit „Zu einem Event“: legt die Reise an und öffnet den Planer
  await p.locator(".modal .ev-start").click();
  const m = p.locator(".modal");
  await m.locator(".ev-form").waitFor();
  await m.locator("label.f", { hasText: "Was?" }).locator("input").fill("Arsenal – Bayern");
  await m.locator(".lp input").fill("London");
  await m.locator(".lp-list li", { hasText: "London" }).first().click();
  await m.locator("label.f", { hasText: "Wo genau?" }).locator("input").fill("Emirates Stadium");
  await m.locator("label.f", { hasText: "Datum" }).locator("input").fill("2027-05-15");
  await m.locator("label.f", { hasText: "Beginn" }).locator("input").fill("15:30");
  await m.locator("label.f", { hasText: "Dauer" }).locator("input").fill("2");
  await m.locator(".ev-form .btn.primary").click();
  await m.locator(".ev-card").first().waitFor();

  // drei Vorschläge: ohne Nacht, eine Nacht, ab Vortag; je eine Flug- und (mit Nacht) eine Unterkunftssuche
  const cards = m.locator(".ev-card");
  if ((await cards.count()) !== 3) fail("nicht drei Vorschläge: " + (await cards.count()));
  const dates = asked.map(q => `${q.depart}/${q.ret}`).sort();
  if (dates.join() !== "2027-05-14/2027-05-16,2027-05-15/2027-05-15,2027-05-15/2027-05-16") fail("Flugsuchen: " + dates);
  if (!asked.every(q => q.toAirports.includes("LHR") && q.fromAirports.length && !q.bags)) fail("Anfrage falsch: " + JSON.stringify(asked[0]));
  if (stays.length !== 2 || !stays.every(s => s.place === "London" && s.type === "all")) fail("Unterkunftssuche: " + JSON.stringify(stays));
  log("Drei Vorschläge aus drei Flug- und zwei Unterkunftssuchen");

  // am Spieltag nur der frühe Flug (landet 08:15), ab Vortag der günstigere; Unterkunft: gut bewertet
  const day = cards.filter({ hasText: "Tagesausflug" });
  if (!(await day.locator(".ev-line", { hasText: "07:00" }).count())) fail("Tagesausflug: später Flug genommen");
  if (!(await day.locator(".ev-line", { hasText: "Ohne Übernachtung" }).count())) fail("Tagesausflug mit Unterkunft");
  const relaxed = cards.filter({ hasText: "Entspannt ab Vortag" });
  if (!(await relaxed.locator(".ev-line", { hasText: "12:00" }).count())) fail("ab Vortag: günstigerer Flug fehlt");
  const short = cards.filter({ hasText: "Mit einer Nacht" });
  if (!(await short.locator(".ev-line", { hasText: "Highbury Rooms" }).count())) fail("Unterkunft nicht die gut bewertete");
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

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Event-Reise ok");
} finally { await browser.close(); server.kill(); }
