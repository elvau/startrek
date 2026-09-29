/*
 * KI-Planer: ohne Anmeldung nur der Hinweis, nach der Anmeldung Wunsch schicken (Such-Dienst nachgestellt),
 * Vorschlag übernehmen. Start: npm run test:cloud (braucht den Auth-Emulator)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4178/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const leg = (from, to, dep, arr) => ({ from, to, fromCity: from, toCity: to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["Sun Air"], flights: ["SA1"] });
const RESULT = {
  remaining: 4,
  trips: [
    { title: "Sonne in Palma", summary: "Kurzer Flug, Altstadt und Strand.", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-10", total: 1080,
      flight: { id: "kiwi:x1", source: "kiwi", sourceName: "Kiwi.com", price: 480, currency: "EUR", url: "https://kiwi.com/u/x1",
        out: leg("DUS", "PMI", "2027-05-07T08:00:00", "2027-05-07T10:30:00"), back: leg("PMI", "DUS", "2027-05-10T18:00:00", "2027-05-10T20:30:00") },
      stay: { id: "b:1", source: "booking", sourceName: "Booking.com", name: "Casa Palma", total: 600, currency: "EUR", score: 8.7, place: "Altstadt" },
      stayQuery: { place: "Palma", country: "Spain", checkin: "2027-05-07", checkout: "2027-05-10", adults: 1, childAges: [], rooms: 1, type: "all", currency: "EUR" } },
    { title: "Lissabon", summary: "Stadt am Meer.", place: "Lissabon", from: "2027-05-14", to: "2027-05-17", total: 350,
      flight: { id: "kiwi:x2", source: "kiwi", sourceName: "Kiwi.com", price: 350, currency: "EUR",
        out: leg("DUS", "LIS", "2027-05-14T07:00:00", "2027-05-14T09:30:00"), back: leg("LIS", "DUS", "2027-05-17T19:00:00", "2027-05-17T23:00:00") } }
  ]
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4178", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [];
  await p.route("https://flights.test/agent", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" } });
    asked.push({ auth: r.request().headers()["authorization"] || "", body: JSON.parse(r.request().postData()) });
    await new Promise(res => setTimeout(res, 300));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(RESULT) });
  });
  await p.goto(URL);
  await p.locator(".modal .btn", { hasText: "Los geht's" }).click();

  // ohne Anmeldung: nur der Hinweis mit Anmelde-Knopf
  await p.locator(".hero .ai-open").click();
  const m = p.locator(".modal");
  await m.locator(".ai-login").waitFor();
  if (await m.locator(".ai-form").count()) fail("Formular ohne Anmeldung sichtbar");
  await m.locator(".ai-login .btn").click();
  await p.locator(".login .test input").fill("Kira");
  await p.locator(".login .test button").click();
  await p.locator(".hero .acct-btn").waitFor({ timeout: 15000 });
  log("Ohne Anmeldung nur Hinweis, Anmeldung über den Planer");

  // Wunsch schicken: Beispiel übernehmen, Anfrage mit Anmelde-Nachweis und Reisenden
  await p.locator(".hero .ai-open").click();
  await m.locator(".ai-ex .chip").first().click();
  if (!(await m.locator(".ai-in").inputValue()).includes("Wochenende")) fail("Beispiel nicht übernommen");
  await m.locator(".ai-form .btn.primary").click();
  await m.locator(".ai-card").first().waitFor();
  const a = asked[0];
  if (!a.auth.startsWith("Bearer ") || a.auth.length < 30) fail("kein Anmelde-Nachweis mitgeschickt");
  if (a.body.lang !== "de" || a.body.adults !== 1 || !a.body.origins.length || !/^\d{4}-\d{2}-\d{2}$/.test(a.body.today)) fail("Anfrage falsch: " + JSON.stringify(a.body));
  if ((await m.locator(".ai-card").count()) !== 2) fail("nicht zwei Vorschläge");
  if (!(await m.locator("p", { hasText: "noch 4 Anfragen heute" }).count())) fail("verbleibende Anfragen fehlen");
  log("Anfrage mit Anmeldung und Reisenden, zwei Vorschläge, 4 Anfragen übrig");

  // übernehmen: Ziel, Daten, Name, Flug und Unterkunft
  await m.locator(".ai-card", { hasText: "Sonne in Palma" }).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".ev-done").waitFor();
  await m.locator(".x").first().click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  const meta = await p.locator(".hero .meta").innerText();
  if (!meta.includes("Palma") || !meta.includes("3 Nächte")) fail("Kopf: " + meta);
  if (!(await p.locator("#flights .card", { hasText: "Sun Air" }).count())) fail("Flug nicht übernommen");
  if (!(await p.locator("#stay .card", { hasText: "Casa Palma" }).count())) fail("Unterkunft nicht übernommen");
  log("Vorschlag übernommen: Name, Ziel, Daten, Flug und Unterkunft");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("KI-Planer ok");
} finally { await browser.close(); server.kill(); }
