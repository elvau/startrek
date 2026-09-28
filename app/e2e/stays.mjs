/*
 * Unterkunftssuche in der App: Such-Dienst nachgestellt (keine echten Anbieter), Ergebnis übernehmen.
 * Start: npm run test:cloud (nach flights.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4176/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const RESULT = {
  offers: [
    { id: "booking:496993", source: "booking", sourceName: "Booking.com", name: "Rooms Šećer", total: 720, currency: "EUR", url: "https://www.booking.com/hotel/hr/sobe-a-eaer.html", score: 9.4, reviews: 416, stars: 1, place: "Split Stadtzentrum, Split", facts: ["Parkplatz", "Familienzimmer"] },
    { id: "trivago:c89342aae3a0", source: "trivago", sourceName: "Trivago", via: "Airbnb", name: "Ferienwohnung Klara", total: 783, currency: "EUR", url: "https://www.trivago.de/de/lm/klara", score: 9.4, reviews: 194, place: "Split, 0.9 km bis Zentrum", facts: ["Küche", "Parkplatz"] },
    { id: "trivago:9c4d6ea1f5e0", source: "trivago", sourceName: "Trivago", via: "Trip.com", name: "Cornaro Hotel", total: 2364, currency: "EUR", url: "https://www.trivago.de/de/lm/cornaro", score: 9.6, reviews: 4022, stars: 5, place: "Split, 0.4 km bis Zentrum" }
  ],
  sources: [
    { id: "booking", name: "Booking.com", configured: true, ok: true, count: 1, ms: 2100 },
    { id: "trivago", name: "Trivago", configured: true, ok: true, count: 2, ms: 1800 }
  ]
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4176", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [];
  await p.route("https://flights.test/stays/search", async r => {
    asked.push(JSON.parse(r.request().postData()));
    await new Promise(res => setTimeout(res, 200));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(RESULT) });
  });
  await p.goto(URL);
  await p.locator(".modal .btn", { hasText: "Los geht's" }).click();
  await p.locator("#stay .st-open").scrollIntoViewIfNeeded();
  await p.locator("#stay .st-open").click();
  const m = p.locator(".modal");

  // Ort und Daten eintragen, Art „Ganze Unterkunft“ ist Standard, beide Quellen an
  if (!(await m.locator(".chip.on", { hasText: "Ganze Unterkunft" }).count())) fail("Ganze Unterkunft nicht vorausgewählt");
  if ((await m.locator(".chip.on", { hasText: /Booking\.com|Trivago/ }).count()) !== 2) fail("nicht beide Quellen an");
  await m.locator("label.f", { hasText: "Ort" }).locator("input").fill("Split");
  await m.locator("label.f", { hasText: "Anreise" }).locator("input").fill("2027-07-18");
  await m.locator("label.f", { hasText: "Abreise" }).locator("input").fill("2027-07-25");
  if (!(await m.locator("p", { hasText: "7 Nächte" }).count())) fail("Nächte nicht angezeigt");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q = asked[0];
  if (q.place !== "Split" || q.checkin !== "2027-07-18" || q.checkout !== "2027-07-25" || q.type !== "whole" || q.adults !== 1 || q.rooms !== 1) fail("Anfrage falsch: " + JSON.stringify(q));
  if (q.sources.join() !== "booking,trivago") fail("Quellen falsch: " + q.sources);
  log("Anfrage an den Such-Dienst stimmt");

  const src = await m.locator(".fs-src").textContent();
  if (!src.includes("Booking.com: 1 Treffer") || !src.includes("Trivago: 2 Treffer")) fail("Quellen-Zeile: " + src);
  const first = m.locator(".fs-res").first();
  const t = await first.textContent();
  if (!t.includes("Rooms Šećer") || !t.includes("720") || !t.includes("103 € pro Nacht") || !t.includes("9,4 (416 Bew.)")) fail("Treffer: " + t);
  if (!(await m.locator(".fs-res", { hasText: "Ferienwohnung Klara" }).locator(".fs-badge", { hasText: "Trivago · Airbnb" }).count())) fail("Portal fehlt");
  log("Treffer mit Preis pro Nacht, Bewertung und Quelle");

  // nach Bewertung sortieren
  await m.locator(".chip", { hasText: "Beste Bewertung" }).click();
  if (!(await m.locator(".fs-res").first().textContent()).includes("Cornaro Hotel")) fail("Sortierung nach Bewertung");

  // zwei übernehmen → ein Posten mit 2 Angeboten, Preis für den ganzen Aufenthalt
  await m.locator(".fs-res", { hasText: "Ferienwohnung Klara" }).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".fs-res", { hasText: "Rooms Šećer" }).locator(".btn", { hasText: "Übernehmen" }).click();
  if ((await m.locator(".btn", { hasText: "✓ Übernommen" }).count()) !== 2) fail("Übernommen-Markierung");
  await m.locator(".x").click();
  const cards = p.locator("#stay .card", { hasText: "Unterkunft in Split" });
  if ((await cards.count()) !== 1) fail("Posten nicht angelegt");
  const c = await cards.textContent();
  if (!c.includes("2 Angebote") || !c.includes("7 Nächte")) fail("Posten: " + c);
  if (!c.includes("720")) fail("günstigstes Angebot nicht gewählt: " + c);
  log("Übernommen: ein Posten mit 2 Angeboten, günstigstes zählt");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  console.log("\nUnterkunftssuche: alles in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
