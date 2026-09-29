/*
 * KI-Planer: ohne Anmeldung nur der Hinweis, nach der Anmeldung Wunsch schicken (Such-Dienst nachgestellt),
 * Vorschlag übernehmen. Start: npm run test:cloud (braucht den Auth-Emulator)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4178/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };
const leg = (from, to, dep, arr) => ({ from, to, fromCity: from, toCity: to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["Sun Air"], flights: ["SA1"] });
const RESULT = {
  remaining: 4,
  trips: [
    { title: "Sonne in Palma", summary: "Kurzer Flug, Altstadt und Strand.", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-10", total: 1080,
      flight: { id: "kiwi:x1", source: "kiwi", sourceName: "Kiwi.com", price: 480, currency: "EUR", url: "https://kiwi.com/u/x1",
        out: leg("DUS", "PMI", "2027-05-07T08:00:00", "2027-05-07T10:30:00"), back: leg("PMI", "DUS", "2027-05-10T18:00:00", "2027-05-10T20:30:00") },
      stay: { id: "b:1", source: "booking", sourceName: "Booking.com", name: "Casa Palma", total: 600, currency: "EUR", score: 8.7, place: "Altstadt" },
      stayQuery: { place: "Palma", country: "Spain", checkin: "2027-05-07", checkout: "2027-05-10", adults: 1, childAges: [], rooms: 1, type: "all", currency: "EUR" },
      board: "half", transport: { label: "Mietwagen 3 Tage", eur: 120 }, extras: [{ name: "Bootstour", eur: 80 }] },
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
  for (const f of ["world.json", "packs.json", "airports.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  const asked = [];
  await p.route("https://flights.test/agent", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" } });
    const body = JSON.parse(r.request().postData());
    asked.push({ auth: r.request().headers()["authorization"] || "", body });
    await new Promise(res => setTimeout(res, 300));
    // Strandurlaub mit Kindern: erst eine Rückfrage, nach der Antwort Vorschläge für die Familie
    const beach = body.prompt.includes("Strandurlaub");
    const out = beach && !body.asked ? { trips: [], question: "Von wo fliegt ihr los und wie alt sind die Kinder?", options: ["Köln, Kinder 5 und 8", "Düsseldorf, Kinder 3 und 10"], remaining: 3 }
      : beach ? { ...RESULT, remaining: 2, trips: RESULT.trips.map(x => ({ ...x, party: { adults: 2, childAges: [5, 8], infants: 0 } })) } : RESULT;
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(out) });
  });
  // Bildschirmfotos zur Sichtprüfung: SHOTS=<Ordner> node e2e/agent.mjs
  const shot = async (name, w = 1280, h = 900) => {
    if (!process.env.SHOTS) return;
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    await p.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
  };
  await p.goto(URL);

  // Startseite: KI-Knopf unten rechts; ohne Anmeldung nur der Hinweis mit Anmelde-Knopf
  await p.locator(".start .home-title").waitFor();
  await shot("home");
  await p.locator(".ai-fab").click();
  const c = p.locator(".ai-chat");
  await c.locator(".ai-login").waitFor();
  if (await c.locator(".ai-bar").count()) fail("Eingabe ohne Anmeldung sichtbar");
  await c.locator(".ai-login .btn").click();
  await p.locator(".login .test input").fill("Kira");
  await p.locator(".login .test button").click();
  await p.locator(".start .acct-btn").waitFor({ timeout: 15000 });
  log("Chat unten rechts: ohne Anmeldung nur Hinweis, Anmeldung daraus");

  // Beispiel antippen schickt den Wunsch; Anfrage mit Anmelde-Nachweis und Reisenden
  await c.locator(".ai-ex .chip").first().click();
  await c.locator(".ai-card").first().waitFor();
  const a = asked[0];
  if (!a.auth.startsWith("Bearer ") || a.auth.length < 30) fail("kein Anmelde-Nachweis mitgeschickt");
  if (!a.body.prompt.includes("Wochenende") || a.body.lang !== "de" || a.body.adults !== 1 || !a.body.origins.length || !/^\d{4}-\d{2}-\d{2}$/.test(a.body.today)) fail("Anfrage falsch: " + JSON.stringify(a.body));
  if ((await c.locator(".ai-card").count()) !== 2) fail("nicht zwei Vorschläge");
  if (!(await c.locator(".ai-foot", { hasText: "noch 4 Anfragen heute" }).count())) fail("verbleibende Anfragen fehlen");
  log("Wunsch per Beispiel, Anfrage mit Anmeldung und Reisenden, zwei Vorschläge, 4 Anfragen übrig");

  // nachschärfen: der frühere Wunsch geht als Zusammenhang mit
  await c.locator(".ai-bar textarea").fill("lieber günstiger bitte");
  await c.locator(".ai-bar textarea").press("Enter");
  await until(() => asked.length === 2 && c.locator(".ai-msg.me").count().then(n => n === 2), "zweite Anfrage");
  await until(() => c.locator(".ai-card").count().then(n => n === 4), "zweite Antwort");
  const p2 = asked[1].body.prompt;
  if (!p2.includes("Bisherige Wünsche") || !p2.includes("Wochenende") || !p2.includes("lieber günstiger")) fail("Zusammenhang fehlt: " + p2);
  log("Nachschärfen im Chat mit Zusammenhang");
  await shot("chat");
  await shot("chat-m", 390, 844);

  // von der Startseite übernehmen: neue Reise mit Ziel, Daten, Name, Flug und Unterkunft; Chat schließt
  await c.locator(".ai-card", { hasText: "Sonne in Palma" }).last().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  await shot("trip");
  await shot("trip-m", 390, 844);
  if (await p.locator(".ai-chat").count()) fail("Chat nicht geschlossen");
  if (!(await p.locator("#transport .card", { hasText: "Mietwagen 3 Tage" }).count())) fail("Transport vor Ort nicht übernommen");
  if (!(await p.locator("#attractions .card", { hasText: "Bootstour" }).count())) fail("Erlebnis nicht übernommen");
  const meta = await p.locator(".hero .meta").innerText();
  if (!meta.includes("Palma") || !meta.includes("3 Nächte")) fail("Kopf: " + meta);
  if (!(await p.locator("#flights .card", { hasText: "Sun Air" }).count())) fail("Flug nicht übernommen");
  if (!(await p.locator("#stay .card", { hasText: "Casa Palma" }).count())) fail("Unterkunft nicht übernommen");
  log("Vorschlag von der Startseite übernommen: neue Reise mit Flug und Unterkunft");

  // zurück zur Startseite: die Reise steht unter „Deine Reisen“
  await p.locator(".hero .hero-home").click();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).waitFor();
  await shot("home-trips");
  await shot("home-m", 390, 844);
  log("Übersicht zeigt die neue Reise");

  // Rückfrage: Strandurlaub mit Kindern ohne Abflugort und Alter → KI fragt nach, Antwort antippen, dann Vorschläge
  await p.locator(".ai-fab").click();
  const c2 = p.locator(".ai-chat");
  await c2.locator(".ai-bar textarea").fill("Eine Woche Strandurlaub mit Kindern in den Sommerferien");
  await c2.locator(".ai-bar textarea").press("Enter");
  await c2.locator(".ai-msg.ai-q", { hasText: "Von wo fliegt ihr los" }).waitFor();
  await shot("ai-q");
  const q1 = asked.at(-1).body;
  if (q1.asked || q1.travelersKnown !== false || q1.originsKnown !== false) fail("erste Anfrage: " + JSON.stringify(q1));
  const cardsBefore = await c2.locator(".ai-card").count();
  await c2.locator(".ai-opts .chip", { hasText: "Köln, Kinder 5 und 8" }).click();
  await until(() => c2.locator(".ai-card").count().then(n => n === cardsBefore + 2), "Vorschläge nach der Antwort");
  const q2 = asked.at(-1).body;
  if (!q2.asked || !q2.prompt.includes("Rückfrage: Von wo fliegt ihr los") || !q2.prompt.includes("Köln, Kinder 5 und 8")) fail("Antwort ohne Zusammenhang: " + JSON.stringify(q2));
  if (await c2.locator(".ai-opts").count()) fail("Antworten nach dem Antippen noch sichtbar");
  if (!(await c2.locator(".ai-card").last().innerText()).includes("pro Person")) fail("pro Person für die Familie fehlt");
  log("Rückfrage mit Antworten zum Antippen, Antwort mit Zusammenhang, danach keine zweite Rückfrage");
  await c2.locator(".ai-card", { hasText: "Sonne in Palma" }).last().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  const who = await p.locator(".hero .meta").innerText();
  if (!who.includes("4 Personen")) fail("Reisende aus der Antwort nicht angelegt: " + who);
  log("Übernommen: neue Reise mit 2 Erwachsenen und 2 Kindern aus der Antwort");

  // ganze Reise auf der Karte: Posten, Schätzungen mit ≈, Gesamtpreis; alle Vorschläge als Reisen anlegen
  await p.locator(".hero .hero-home").click();
  await p.locator(".ai-fab").click();
  const card = p.locator(".ai-card", { hasText: "Sonne in Palma" }).last();
  const ct = await card.innerText();
  for (const x of ["Halbpension", "Mietwagen 3 Tage", "Bootstour", "Verpflegung", "ca."]) if (!ct.includes(x)) fail(`Karte ohne „${x}“: ${ct}`);
  await card.scrollIntoViewIfNeeded(); await shot("ai-card");
  await p.locator(".ai-all").last().click();
  await p.locator(".start .home-title").waitFor();
  await until(() => p.locator(".start .home-trip", { hasText: "KI-Vorschlag" }).count().then(n => n >= 3), "KI-Reisen gekennzeichnet");
  if (!(await p.locator(".start .home-trip", { hasText: "Lissabon" }).count())) fail("Lissabon nicht angelegt");
  await p.locator(".start .home-h").first().scrollIntoViewIfNeeded(); await shot("ai-home");
  log("Karte als ganze Reise (Halbpension, Mietwagen, Bootstour, Verpflegung, Gesamtpreis); alle angelegt und mit ✨ KI-Vorschlag gekennzeichnet");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("KI-Planer ok");
} finally { await browser.close(); server.kill(); }
