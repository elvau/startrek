/*
 * Reise per KI importieren (#457): „Neue Reise → Importieren“ ohne Anmeldung nur der Hinweis; angemeldet ein Link, den
 * der Such-Dienst nicht lesen kann (Bitte um Screenshot), dann Screenshot und CSV-Liste auslesen (Such-Dienst
 * nachgestellt), Übersicht mit Sicherheit je Angabe und Rückfrage (#458), Reise mit Flug, Unterkunft und Transfer
 * angelegt, Unsicheres als „bitte prüfen“ markiert.
 * Start: npm run build:emu && npx firebase emulators:exec --only auth,firestore --project demo-reisekasse "node e2e/import.mjs"
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4186/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };
// 1×1-Pixel-PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const OFFER = {
  kind: "package", title: "Mallorca im Mai", provider: "Reiseanbieter", place: "Playa de Palma", country: "ES", from: "2027-05-10", to: "2027-05-17",
  price: { total: 796, currency: "EUR" },
  travelers: [{ name: "Anna", household: "Berg", age: 9 }, { name: "Ben", household: "Berg" }, { name: "Cem", household: "Yilmaz" }, { name: "Dana", household: "Yilmaz" }],
  flights: { legs: [{ dir: "out", from: "DUS", to: "PMI", dep: "2027-05-10T06:10", carrier: "Sun Air" }, { dir: "back", from: "PMI", to: "DUS", dep: "2027-05-17T21:40", carrier: "Sun Air" }] },
  stay: { name: "Hotel Sol", stars: 3, board: "breakfast" }, transfer: { included: true }
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4186", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  for (const f of ["world.json", "packs.json", "airports.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  const asked = [];
  await p.route("https://flights.test/import", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const body = JSON.parse(r.request().postData());
    asked.push({ auth: r.request().headers()["authorization"] || "", body });
    if (body.url && !body.files.length) return r.fulfill({ status: 422, contentType: "application/json", headers: cors, body: JSON.stringify({ error: "Seite lässt sich nicht lesen", needScreenshot: true, remaining: 10 }) });
    return r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offer: OFFER, remaining: 8 }) });
  });

  // 1. ohne Anmeldung: nur der Hinweis mit Anmelde-Knopf
  await p.goto(URL);
  await p.locator(".home-new").click();
  const dlg = p.locator(".modal", { hasText: "Neue Reise" });
  await dlg.locator(".nt-mode .chip", { hasText: "Importieren" }).click();
  await dlg.locator(".imp", { hasText: "Zum Importieren bitte anmelden" }).waitFor();
  if (await dlg.locator(".imp-go").count()) fail("Auslesen ohne Anmeldung angeboten");
  await dlg.locator(".imp .btn", { hasText: "Anmelden" }).click();
  await p.locator(".login .test input").fill("Ida");
  await p.locator(".login .test button").click();
  await p.locator(".top .acct-btn").waitFor({ timeout: 15000 });
  await dlg.locator(".imp-go").waitFor();
  log("ohne Anmeldung nur Hinweis, nach der Anmeldung Import im selben Fenster");

  // 2. Link, den der Such-Dienst nicht lesen kann: Bitte um Screenshot, Ansicht springt auf Datei
  await dlg.locator(".imp-src .chip", { hasText: "Link" }).click();
  await dlg.locator('input[type="url"]').fill("https://example.com/deal");
  await dlg.locator(".imp-go").click();
  await dlg.locator(".err", { hasText: "Screenshot" }).waitFor();
  await dlg.locator(".imp-drop").waitFor();
  if (!asked[0]?.auth.startsWith("Bearer ")) fail("kein Anmelde-Nachweis mitgeschickt");
  log("nicht lesbarer Link: Bitte um Screenshot, Dateiauswahl offen");

  // 3. Screenshot und CSV-Liste: Bild als Datei, CSV als Text; Reise angelegt
  await dlg.locator(".imp-drop input").setInputFiles([
    { name: "angebot.png", mimeType: "image/png", buffer: PNG },
    { name: "liste.csv", mimeType: "text/csv", buffer: Buffer.from("Name;Alter\nAnna;9\nBen;41") },
    { name: "archiv.zip", mimeType: "application/zip", buffer: Buffer.from("PK") }
  ]);
  await until(async () => (await dlg.locator(".imp-files li").count()) === 2, "zwei Dateien vorbereitet");
  await dlg.locator(".imp-note", { hasText: "archiv.zip" }).waitFor();
  if (!(await dlg.locator(".imp-priv", { hasText: "Ausweis" }).count())) fail("Datenschutz-Hinweis fehlt");
  await dlg.locator(".imp-go").click();
  await until(async () => asked.length === 2, "zweite Anfrage");
  const b = asked[1].body;
  if (b.files.length !== 1 || !b.files[0].mime.startsWith("image/")) fail("Bild nicht als Datei geschickt: " + JSON.stringify(b.files.map(f => f.mime)));
  if (!b.text?.includes("liste.csv:\nName;Alter")) fail("CSV nicht als Text geschickt: " + b.text);
  if (b.url !== "https://example.com/deal") fail("Link fehlt in der zweiten Anfrage");
  // 4. Übersicht (#458): Sicherheit je Angabe, Rückfrage zum Gepäck, Ziel korrigieren, erst nach der Antwort anlegen
  await dlg.locator(".rev").waitFor();
  if (await dlg.locator(".rev-lvl.mid").count() < 2) fail("abgeleitete Angaben nicht als mittel markiert");
  const qs = await dlg.locator(".rev-q b").allTextContents();
  if (qs.join() !== "Ist Aufgabegepäck im Preis?") fail("Rückfragen: " + qs);
  if (!(await dlg.locator(".imp-create").isDisabled())) fail("Anlegen trotz offener Rückfrage möglich");
  await dlg.locator(".rev-q .chip", { hasText: "Nein, nur Handgepäck" }).click();
  if (await dlg.locator(".rev-q").count()) fail("Rückfrage nach der Antwort noch da");
  await dlg.locator(".rev-list li", { hasText: "Ziel" }).locator(".linkbtn").click();
  await dlg.locator(".rev-edit input").fill("El Arenal");
  await dlg.locator(".rev-edit input").press("Tab");
  await dlg.locator(".rev-list li", { hasText: "El Arenal" }).locator(".rev-lvl.high").waitFor();
  await dlg.locator(".imp-create").click();
  log("Übersicht: Stufen je Angabe, Rückfrage zum Gepäck beantwortet, Ziel korrigiert (danach sicher)");
  await until(async () => !(await dlg.count()), "Fenster geschlossen");
  await p.locator("text=Mallorca im Mai").first().waitFor();
  await p.locator(".aif", { hasText: "Per KI aus einem Angebot importiert" }).first().waitFor();
  // gespeichert wird kurz verzögert: warten, bis die Posten auf dem Gerät stehen
  let trip = null;
  await until(async () => {
    trip = await p.evaluate(() => JSON.parse(localStorage.getItem(`rk2-t:${localStorage.getItem("rk2-current")}`) || "null"));
    return trip?.items?.length > 0;
  }, "Reise gespeichert");
  {
    if (trip.travelers.map(x => x.name).join() !== "Anna,Ben,Cem,Dana") fail("Reisende aus der Liste fehlen: " + trip.travelers.map(x => x.name));
    // ohne die automatischen Posten (Verpflegung, Souvenirs, unterwegs vor Ort)
    const own = trip.items.filter(i => !i.auto);
    if (own.map(i => i.cat).join() !== "flights,stay,transport") fail("Posten: " + own.map(i => i.cat));
    if (trip.items.some(i => i.auto === "local" && i.hh === "transfer")) fail("Transfer geschätzt, obwohl im Paket");
    if (trip.place !== "El Arenal") fail("korrigiertes Ziel fehlt: " + trip.place);
    const fl = trip.items.find(i => i.cat === "flights");
    if (fl.options[0].baggage?.checked !== 0 || fl.options[0].baggage?.cabin !== 4) fail("Antwort zum Gepäck nicht übernommen");
    const st = trip.items.find(i => i.cat === "stay");
    if (!st.check) fail("Unterkunft (abgeleitet) nicht als „bitte prüfen“ markiert");
    if (st.options[0].price.unit !== 796 || !st.options[0].source.imported) fail("Paketpreis an der Unterkunft fehlt");
  }
  // „bitte prüfen“ an der Unterkunft, mit „Geprüft“ weg
  const card = p.locator("article.card:has(.aif)", { hasText: "Hotel Sol" }).first();
  await card.locator(".aif-check", { hasText: "bitte prüfen" }).waitFor();
  await card.locator(".aif-ok").click();
  await until(async () => !(await card.locator(".aif-check").count()), "„bitte prüfen“ nach „Geprüft“ weg");
  log("Screenshot und CSV ausgelesen, Reise mit Reisenden aus der Liste, Flug, Unterkunft (Paketpreis) und Transfer");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Import ok");
} finally { await browser.close(); server.kill(); }
