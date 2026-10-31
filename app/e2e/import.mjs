/*
 * Reise per KI importieren (#457): „Neue Reise → Importieren“ ohne Anmeldung nur der Hinweis; angemeldet ein Link, den
 * der Such-Dienst nicht lesen kann (Bitte um Screenshot), dann Screenshot und CSV-Liste auslesen (Such-Dienst
 * nachgestellt), Übersicht mit Sicherheit je Angabe und Rückfrage (#458), Reise mit Flug, Unterkunft und Transfer
 * angelegt, Unsicheres als „bitte prüfen“ markiert. Nur Unterkunft, Flug „Brauchen wir nicht“: Anreise mit der Bahn
 * aus dem Wohnort geschätzt (#475). Unterkunft importieren in die offene Reise, weiterer Fund als Rückfrage (#615).
 * Reise um Import erweitern mit Abweichungen, „Ja, hier übernehmen“ und „Andere Reise wählen“ (#616).
 * Start: npm run build:emu && npx firebase emulators:exec --only auth,firestore --project demo-reisekasse "node e2e/import.mjs"
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { reloadHome } from "./nav.mjs";

const URL = "http://127.0.0.1:4186/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
// SHOTS=<Ordner>: Bildschirmfotos der Schritte zum Durchsehen
const shot = async (loc, name) => { if (process.env.SHOTS) await loc.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
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

// Realitätscheck (#461): Flugdeal, sicher erkannt bis aufs Gepäck (nicht genannt)
const DEAL = {
  kind: "flight", title: "Barcelona im März", provider: "Dealseite", url: "https://example.com/deal-bcn", place: "Barcelona", country: "ES", from: "2027-03-01", to: "2027-03-05",
  adults: 2, price: { perPerson: 99, currency: "EUR" },
  flights: { legs: [{ dir: "out", from: "DUS", to: "BCN", dep: "2027-03-01T07:00", carrier: "Ryanair" }, { dir: "back", from: "BCN", to: "DUS", dep: "2027-03-05T20:00", carrier: "Ryanair" }] },
  confidence: { place: 1, dates: 1, people: 1, price: 1, flights: 1 }
};

// nur Unterkunft, kein Flug (#475)
const PARK = {
  kind: "stay", title: "Ferienpark an der Elbe", provider: "Ferienparks", place: "Hamburg", country: "DE", from: "2027-05-05", to: "2027-05-10",
  adults: 2, price: { total: 500, currency: "EUR" }, stay: { name: "Ferienpark Elbe", price: 500 },
  // Personen nur aus „Doppelzimmer“ abgeleitet: Rückfrage mit Zählern, vorbelegt mit 2
  confidence: { place: 1, dates: 1, people: 0.5, price: 1, stay: 1 }
};

// Unterkunft importieren in die offene Reise (#615): Hotel mit eigenem Preis, im selben Screenshot ein Flug
const HOTEL = {
  kind: "stay", title: "Elbblick-Deal", provider: "Hotelseite", place: "Hamburg", country: "DE", from: "2027-05-05", to: "2027-05-10",
  adults: 2, childAges: [6, 1], price: { total: 300, currency: "EUR" }, stay: { name: "Hotel Elbblick", price: 300 },
  flights: { legs: [{ dir: "out", from: "MUC", to: "HAM", dep: "2027-05-05T08:00" }], price: 120 },
  confidence: { place: 1, dates: 1, people: 1, price: 1, stay: 1, flights: 1 }
};

// Abgleich mit der Reise (#616): Mietwagen in Portugal, anderer Zeitraum, zwei Personen
const RENT = {
  kind: "rental", title: "Mietwagen Lissabon", provider: "Autovermieter", place: "Lissabon", country: "PT", from: "2027-08-01", to: "2027-08-08",
  adults: 2, price: { total: 250, currency: "EUR" }, rental: { company: "Sixt", car: "Kombi", price: 250 },
  confidence: { place: 1, dates: 1, people: 1, price: 1 }
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
    // aus dem Angebotsspeicher (#462): schon geprüft, gültig bis
    if (body.text?.includes("Ferienpark")) return r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offer: PARK, remaining: 6 }) });
    if (body.text?.includes("Lissabon")) return r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offer: RENT, remaining: 4 }) });
    if (body.text?.includes("Elbblick")) return r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offer: HOTEL, remaining: 5 }) });
    if (body.text?.includes("Flugdeal")) return r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ offer: DEAL, cached: true, until: "2026-11-03", remaining: 7 }) });
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
  await shot(dlg, "0-eingabe");
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
  await dlg.locator(".rev-q .chip", { hasText: "Nur Handgepäck" }).click();
  if (await dlg.locator(".rev-q").count()) fail("Rückfrage nach der Antwort noch da");
  await dlg.locator('.rev-list li[data-k="place"]').locator(".linkbtn").click();
  await dlg.locator(".rev-edit input").fill("El Arenal");
  await dlg.locator(".rev-edit input").press("Tab");
  await dlg.locator(".rev-list li", { hasText: "El Arenal" }).locator(".rev-lvl.high").waitFor();
  await shot(dlg, "1-uebersicht");
  await dlg.locator(".imp-create").click();
  log("Übersicht: Stufen je Angabe, Rückfrage zum Gepäck beantwortet, Ziel korrigiert (danach sicher)");

  // 5. Was fehlt noch? (#459): Flug, Unterkunft, Transfer im Paket, Anreise rechnet die App; Mietwagen schätzen, Ausflüge suchen
  await dlg.locator(".parts").waitFor();
  const marks = await dlg.locator(".parts-list li").evaluateAll(ls => ls.map(l => (l.classList.contains("missing") ? "?" : "✓") + l.querySelector("b").textContent));
  if (marks.join("|") !== "✓Flug|✓Unterkunft|✓Anreise zum Flughafen|✓Transfer Flughafen – Unterkunft|?Mietwagen|?Ausflüge und Events") fail("Bausteine: " + marks.join("|"));
  await dlg.locator(".parts-list li", { hasText: "Mietwagen" }).locator(".chip", { hasText: "Schätzen" }).click();
  await dlg.locator(".parts-list li", { hasText: "Ausflüge" }).locator(".chip", { hasText: "Suchen" }).click();
  await dlg.locator(".parts", { hasText: "Danach öffnet sich die Suche: Ausflüge und Events." }).waitFor();
  await shot(dlg, "2-was-fehlt");
  await dlg.locator(".imp-parts-go").click();
  await p.locator(".modal", { hasText: "Erlebnisse finden" }).waitFor();
  await p.locator(".modal", { hasText: "Erlebnisse finden" }).locator(".x").first().click();
  log("Was fehlt noch: Paket und App-Teile abgehakt, Mietwagen geschätzt, Suche nach Erlebnissen geöffnet");
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
    // ohne die automatischen Posten (Verpflegung, Souvenirs, unterwegs vor Ort); Mietwagen ergänzt, nicht Teil des Angebots
    const own = trip.items.filter(i => !i.auto);
    if (own.map(i => i.cat).join() !== "flights,stay,transport,transport") fail("Posten: " + own.map(i => i.cat));
    const car = own.find(i => i.hint === "rental");
    if (!car || trip.offer?.items.includes(car.id) || trip.offer?.items.length !== 3) fail("Mietwagen fehlt oder zählt zum Angebot");
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

  // 6. Realitätscheck aus dem Reise-Menü: Bericht der importierten Reise (Paketpreis 199 € pro Kopf)
  await p.locator(".tm-btn").first().click();
  await p.locator(".tm-reality").click();
  const rd = p.locator(".modal", { hasText: "Angebot realistisch pro Kopf" });
  await rd.waitFor();
  if (!(await rd.locator(".real-adv").textContent()).includes("199")) fail("beworbener Preis fehlt im Bericht");
  if (await rd.locator(".real-prev").count()) fail("Bericht einer gespeicherten Reise als Vorschau markiert");
  await rd.locator(".x").first().click();
  log("Realitätscheck der Reise aus dem Reise-Menü");

  // 7. Realitätscheck von der Startseite: Flugdeal, direkt zum Bericht, keine Reise angelegt; Koffer-Annahme festlegen; übernehmen
  await reloadHome(p);
  await p.locator(".home-check").click();
  const cd = p.locator(".modal", { hasText: "Realitätscheck" });
  await cd.locator(".imp-src .chip", { hasText: "Text" }).click();
  await cd.locator("textarea").fill("Flugdeal Barcelona 99 € hin und zurück");
  await cd.locator(".imp-go", { hasText: "Auslesen und prüfen" }).click();
  await cd.locator(".rev-cached", { hasText: "Schon geprüft" }).waitFor();
  // Gepäck nennt das Angebot nicht: Rückfrage, „Weiß nicht“ lässt die Spanne offen
  await cd.locator(".rev-q .chip", { hasText: "Weiß nicht" }).click();
  await cd.locator(".imp-create").click();
  await cd.locator(".real-prev", { hasText: "Es wurde keine Reise angelegt" }).waitFor();
  if (!(await cd.locator(".real-adv").textContent()).includes("99")) fail("beworbener Preis 99 € fehlt");
  const bagRow = cd.locator(".real-rows li", { hasText: "Koffer dazu" });
  await bagRow.waitFor();
  if (!(await bagRow.textContent()).includes("80")) fail("Koffer-Spanne (2 × 40 €) fehlt: " + await bagRow.textContent());
  const wide = await cd.locator(".real-main b").textContent();
  await bagRow.locator(".real-pin").click();
  await until(async () => (await bagRow.locator(".real-pin").getAttribute("aria-label")).includes("günstig"), "Annahme auf günstig");
  if ((await cd.locator(".real-main b").textContent()) === wide) fail("Spanne nach dem Festlegen unverändert");
  if (await cd.locator(".real-board").count()) fail("Verpflegung bei reinem Flug angezeigt");
  await cd.locator(".real-hint").waitFor();
  await shot(cd, "3-realitaetscheck");
  if (await p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("rk2-t:") && (localStorage.getItem(k) || "").includes("Barcelona im März")))) fail("Realitätscheck hat eine Reise angelegt");
  await cd.locator(".real-take").click();
  await until(async () => !(await cd.count()), "Fenster nach dem Übernehmen zu");
  await p.locator("text=Barcelona im März").first().waitFor();
  log("Realitätscheck ohne Reise: Bericht mit Spanne, Koffer-Annahme festgelegt, erst „Als Reise übernehmen“ legt an");

  // 8. Pauschalreise von Hand (#188): im Kapitel Unterkunft „📦 Paket“, Preis an der Unterkunft, Flug „im Paket“, Status gemeinsam
  await p.locator("#stay .pkg-open").click();
  const pd = p.locator(".modal", { hasText: "Pauschalreise" });
  await pd.locator(".pkg-mode .chip", { hasText: "Von Hand" }).click();
  await pd.locator(".pkg-hand input").first().fill("Reisebüro Sonne");
  await pd.locator('.pkg-hand input[type="number"]').fill("1200");
  await pd.locator(".pkg-part", { hasText: "Transfer" }).click();
  await pd.locator(".pkg-create").click();
  await until(async () => !(await pd.count()), "Paket-Dialog zu");
  const mainCard = p.locator("article.card:has(.pkgb)", { hasText: "Unterkunft (Pauschalreise)" }).first();
  await mainCard.locator(".pkgb-incl", { hasText: "✈ Flug" }).waitFor();
  const partCard = p.locator("article.card:has(.pkgb)", { hasText: "Flug (Pauschalreise)" }).first();
  // Gesamtpaket (#618): ein Kapitel statt Abheben und Unterkunft, Paketkarte mit Gesamtpreis, Teile darin
  const pkgc = p.locator("#pkg .pkgc");
  // Gesamtpreis mit Nebenkosten (Anreise zum Flughafen), pro Person, Paketpreis 1.200 € am Teil
  await pkgc.locator(".pkgc-total").waitFor();
  await pkgc.locator(".pkgc-pp").waitFor();
  if (!(await pkgc.textContent()).includes("1.200")) fail("Paketpreis 1.200 € fehlt im Gesamtpaket");
  if (await p.locator("#flights").count() || await p.locator("#stay").count()) fail("Abheben bzw. Unterkunft neben dem Gesamtpaket");
  if (!(await pkgc.locator("article.card", { hasText: "Flug (Pauschalreise)" }).count())) fail("Flug nicht im Gesamtpaket");
  await shot(p.locator("#pkg"), "8-gesamtpaket");
  await mainCard.click();
  await mainCard.locator('[data-s="booked"]').click();
  await until(async () => {
    const tr = await p.evaluate(() => JSON.parse(localStorage.getItem(`rk2-t:${localStorage.getItem("rk2-current")}`) || "null"));
    const pk = tr?.items.filter(i => i.options.some(o => o.pkg));
    return pk?.length === 2 && pk.every(i => i.status === "booked");
  }, "Status gilt für Flug und Unterkunft des Pakets");
  log("Pauschalreise von Hand: Paketpreis an der Unterkunft, Flug „im Paket“, Status gemeinsam");

  // 9. Paket teilweise ersetzt, aufbrechen, wiederherstellen (#460): am Flug ein eigenes Angebot eintragen
  await p.keyboard.press("Escape");
  await partCard.click();
  // Karte klappt auf und scrollt: kurz warten, bis sie ruhig steht
  await p.waitForTimeout(1000);
  const ed = partCard.locator('details[data-sec="price"]');
  if ((await ed.getAttribute("open")) === null) { await ed.locator("summary").click(); await p.waitForTimeout(500); }
  await ed.locator(".linkbtn", { hasText: "Angebot zum Vergleichen" }).click();
  await ed.locator("label", { hasText: "Preis" }).locator("input").first().fill("640");
  await partCard.locator(".pkgb.warn .pkgb-break").waitFor();
  await partCard.locator(".pkgb-break").click();
  await mainCard.locator(".pkgb-pill", { hasText: "Paket aufgelöst" }).waitFor();
  // aufgebrochen: wieder einzeln in Abheben und Unterkunft
  await p.locator("#stay article.card", { hasText: "Unterkunft (Pauschalreise)" }).first().waitFor();
  if (await p.locator("#pkg").count()) fail("Gesamtpaket nach dem Aufbrechen");
  await mainCard.locator(".pkgb-restore").click();
  await mainCard.locator(".pkgb-pill", { hasText: "Pauschalreise" }).waitFor();
  await partCard.locator(".pkgb-pill", { hasText: "im Paket" }).waitFor();
  await p.locator("#pkg .pkgc").waitFor();
  // Nachzügler (#618): „Flug hinzufügen“ im Gesamtpaket öffnet die Flugsuche
  await p.locator("#pkg .pkg-add-flight").click();
  await p.locator(".modal", { hasText: "Flüge suchen" }).first().waitFor();
  await p.keyboard.press("Escape");
  log("Paket: eigenes Angebot am Flug → teilweise ersetzt, aufgebrochen (wieder Abheben und Unterkunft), wiederhergestellt (Gesamtpaket)");

  // 10. nur Unterkunft (#475): Flug „Brauchen wir nicht“ fragt nach der Anreise (Auto vorgewählt), Wohnort, Bahn → Posten
  await reloadHome(p);
  await p.locator(".home-new").click();
  const nd = p.locator(".modal", { hasText: "Neue Reise" });
  await nd.locator(".nt-mode .chip", { hasText: "Importieren" }).click();
  await nd.locator(".imp-src .chip", { hasText: "Text" }).click();
  await nd.locator("textarea").fill("Ferienpark Hamburg, 5 Nächte");
  await nd.locator(".imp-go").click();
  await until(async () => (await nd.locator(".parts").count()) || (await nd.locator(".imp-create").count()), "Übersicht oder Was fehlt noch");
  // Personen: ein Kind und ein Kleinkind dazu (#474); dafür von „Was fehlt noch?“ zurück zur Übersicht, falls übersprungen
  if (await nd.locator(".parts").count()) await nd.locator(".parts .btn", { hasText: "Zurück" }).click();
  // Personen geraten: Zähler mit dem Vorschlag der KI (2 Erwachsene), „Passt“ übernimmt
  const pq = nd.locator(".rev-q", { hasText: "Wie viele Personen" });
  if (await pq.locator(".rev-cnt", { hasText: "Erwachsene" }).locator("input").inputValue() !== "2") fail("Personen-Rückfrage nicht mit 2 vorbelegt");
  if (await pq.locator(".chip").count()) fail("Personen-Rückfrage noch mit festen Antworten");
  await pq.locator(".rev-ok", { hasText: "Passt" }).click();
  // weitere Rückfragen (z. B. Verpflegung) mit der ersten Antwort beantworten
  while (await nd.locator(".rev-q").count()) await nd.locator(".rev-q").first().locator(".chip").first().click();
  await nd.locator('.rev-list li[data-k="people"] .linkbtn').click();
  await nd.locator(".rev-cnt", { hasText: "Kinder (2–11)" }).locator("button", { hasText: "+" }).click();
  await nd.locator(".rev-cnt", { hasText: "Kleinkinder (unter 2)" }).locator("button", { hasText: "+" }).click();
  await nd.locator('.rev-list li[data-k="people"]', { hasText: "4 Personen" }).waitFor();
  await shot(nd, "5-personen");
  await nd.locator(".imp-create").click();
  const flightRow = nd.locator(".parts-list li", { hasText: "Flug" }).first();
  await flightRow.locator(".chip", { hasText: "Brauchen wir nicht" }).click();
  const arr = nd.locator(".parts-list li", { hasText: "Anreise ohne Flug" });
  await arr.locator(".chip.on", { hasText: "Auto" }).waitFor();
  await arr.locator(".imp-home .home-plz").fill("50667");
  await until(async () => (await arr.locator(".imp-home .home-plz").inputValue()).includes("Köln"), "Wohnort Köln");
  await arr.locator(".chip", { hasText: "Bahn" }).click();
  await shot(nd, "4-anreise");
  await nd.locator(".imp-parts-go").click();
  await until(async () => !(await nd.count()), "Fenster geschlossen");
  let park = null;
  await until(async () => {
    park = await p.evaluate(() => JSON.parse(localStorage.getItem(`rk2-t:${localStorage.getItem("rk2-current")}`) || "null"));
    return park?.items?.some(i => i.arrival);
  }, "Anreise-Posten gespeichert");
  {
    const a = park.items.find(i => i.arrival);
    if (a.name !== "Anreise mit der Bahn" || !a.options[0].estimate || !(a.options[0].price.adult > 0)) fail("Anreise-Posten: " + JSON.stringify(a));
    if (park.items.some(i => i.cat === "flights")) fail("Flug angelegt, obwohl nicht gebraucht");
    if (park.travelers.map(x => x.kind).join() !== "adult,adult,child,infant") fail("Personen: " + park.travelers.map(x => x.kind));
  }
  log("Nur Unterkunft: Personen-Rückfrage mit 2 vorbelegt, Kind und Kleinkind ergänzt, Flug nicht nötig, Anreise mit der Bahn aus dem Wohnort geschätzt");

  // 11. Unterkunft importieren (#615): im Kapitel Unterkunft, nur die Unterkunft; der Flug im Screenshot ist eine Rückfrage
  const before = park;
  await p.locator("#stay .imp-open").click();
  const id = p.locator(".modal", { hasText: "Unterkunft importieren" });
  await id.locator(".imp-lead", { hasText: "Unterkunft" }).waitFor();
  await id.locator(".imp-src .chip", { hasText: "Text" }).click();
  await id.locator("textarea").fill("Hotel Elbblick, 5 Nächte");
  await id.locator(".imp-go", { hasText: "Auslesen und übernehmen" }).click();
  const more = id.locator('.imp-more-list li[data-part="flights"]');
  await more.waitFor();
  if (await more.locator("input").isChecked()) fail("weiterer Fund (Flug) vorab angehakt");
  await shot(id, "6-auch-gefunden");
  await id.locator(".imp-more-go").click();
  await until(async () => !(await id.count()) || (await id.locator(".imp-create").count()), "übernommen oder Übersicht");
  if (await id.count()) {
    // Rückfragen (z. B. Verpflegung) mit der ersten Antwort beantworten; Personen fragt der Import in eine Reise nicht
    if (await id.locator(".rev-q", { hasText: "Wie viele Personen" }).count()) fail("Personen-Rückfrage beim Import in die Reise");
    while (await id.locator(".rev-q").count()) await id.locator(".rev-q").first().locator(".chip").first().click();
    await id.locator(".imp-create", { hasText: "Übernehmen" }).click();
  }
  await until(async () => !(await id.count()), "Import-Fenster zu");
  let after = null;
  await until(async () => {
    after = await p.evaluate(() => JSON.parse(localStorage.getItem(`rk2-t:${localStorage.getItem("rk2-current")}`) || "null"));
    return after?.items?.some(i => i.name === "Hotel Elbblick");
  }, "Hotel Elbblick in der Reise");
  if (after.id !== before.id) fail("neue Reise angelegt statt in die offene");
  if (after.name !== before.name || after.place !== before.place || after.from !== before.from) fail("Reise verändert: " + JSON.stringify([after.name, after.place, after.from]));
  if (after.travelers.length !== before.travelers.length) fail("Reisende verändert");
  if (after.items.some(i => i.cat === "flights")) fail("Flug übernommen, obwohl nicht angehakt");
  await p.locator("article.card", { hasText: "Hotel Elbblick" }).first().locator("text=nicht live geprüft").waitFor();
  log("Unterkunft importieren: in die offene Reise, nur die Unterkunft, Flug als Rückfrage nicht angehakt, Reise unverändert");

  // 11b. Anreise mit der Bahn, kein Flug (#618): kein Kapitel Abheben; „Doch fliegen? Flug hinzufügen“ bringt es zurück
  if (await p.locator("#flights").count()) fail("Abheben bei Reise ohne Flug");
  if (await p.locator('.nav a[data-ch="flights"]').count()) fail("Abheben in der Navigation");
  await p.locator("#transport .fl-add-back").click();
  const fsd = p.locator(".modal", { hasText: "Flüge suchen" }).first();
  await fsd.waitFor();
  await p.keyboard.press("Escape");
  await p.locator("#flights").waitFor();
  await p.locator("#flights .fl-none").click();
  await until(async () => !(await p.locator("#flights").count()), "Abheben wieder ausgeblendet");
  log("Ohne Flug: Abheben ausgeblendet, „Flug hinzufügen“ bringt es zurück, „Kein Flug nötig“ blendet es aus");

  // 12. Reise um Import erweitern (#616): passt nicht (Zeitraum, Land, Personen) → Hinweise, „Ja, hier übernehmen“, Hinweis am Posten
  const readCur = () => p.evaluate(() => JSON.parse(localStorage.getItem(`rk2-t:${localStorage.getItem("rk2-current")}`) || "null"));
  const runRent = async () => {
    await p.locator(".tm-btn").first().click();
    await p.locator(".tm-import").click();
    const d = p.locator(".modal", { hasText: "Reise um Import erweitern" });
    await d.locator(".imp-src .chip", { hasText: "Text" }).click();
    await d.locator("textarea").fill("Mietwagen Lissabon");
    await d.locator(".imp-go").click();
    await d.locator(".imp-fit").waitFor();
    return d;
  };
  let rentDlg = await runRent();
  for (const k of ["dates", "country", "people"]) await rentDlg.locator(`.imp-fit-list li[data-k="${k}"]`).waitFor();
  if (!(await rentDlg.locator('.imp-fit-list li[data-k="people"]').textContent()).includes("Angebot 2, Reise 4")) fail("Personen-Hinweis: " + await rentDlg.locator('.imp-fit-list li[data-k="people"]').textContent());
  await shot(rentDlg, "7-passt-nicht");
  await rentDlg.locator(".imp-fit-yes").click();
  const finish = async d => {
    await until(async () => !(await d.count()) || (await d.locator(".imp-create").count()), "übernommen oder Übersicht");
    if (await d.count()) {
      while (await d.locator(".rev-q").count()) await d.locator(".rev-q").first().locator(".chip").first().click();
      await d.locator(".imp-create").click();
    }
    await until(async () => !(await d.count()), "Import-Fenster zu");
  };
  await finish(rentDlg);
  let tr = null;
  await until(async () => { tr = await readCur(); return tr?.items?.some(i => i.name === "Mietwagen"); }, "Mietwagen in der Reise");
  const rent = tr.items.find(i => i.name === "Mietwagen");
  if (tr.id !== before.id || !rent.check || rent.checkWhy?.length !== 3) fail("Mietwagen ohne Hinweise bzw. in anderer Reise: " + JSON.stringify(rent));
  await p.locator("article.card .aif-check", { hasText: "Personen: Angebot 2, Reise 4" }).first().waitFor();
  log("Reise um Import erweitern: Zeitraum, Land, Personen passen nicht, trotzdem übernommen, Hinweis am Posten");

  // 13. dasselbe Angebot, „Andere Reise wählen“: Reise wechselt, Abgleich dort, Mietwagen landet in der gewählten Reise
  rentDlg = await runRent();
  await rentDlg.locator(".imp-fit-other").click();
  await rentDlg.locator(".imp-fit-trip", { hasText: "Barcelona im März" }).click();
  await until(async () => (await readCur())?.name === "Barcelona im März", "Reise gewechselt");
  await rentDlg.locator(".imp-fit-yes").waitFor();
  if (!(await rentDlg.locator(".imp-lead").first().textContent()).includes("Barcelona im März")) fail("Abgleich nicht für die gewählte Reise");
  await rentDlg.locator(".imp-fit-yes").click();
  await finish(rentDlg);
  await until(async () => (await readCur())?.items?.some(i => i.name === "Mietwagen"), "Mietwagen in Barcelona");
  log("Andere Reise gewählt: Wechsel, neuer Abgleich, Mietwagen in der gewählten Reise");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Import ok");
} finally { await browser.close(); server.kill(); }
