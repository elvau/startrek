/*
 * Unterkunftssuche in der App: Such-Dienst nachgestellt (keine echten Anbieter), Ergebnis übernehmen.
 * Start: npm run test:cloud (nach flights.mjs)
 */
import { chromium } from "playwright";
import { reloadHome } from "./nav.mjs";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4176/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
/** „Weitere Optionen“ der Suche aufklappen (bleibt gemerkt) */
const more = async m => { if (!(await m.locator(".fs-more[open]").count())) await m.locator(".fs-more > summary").click(); };
async function until(fn, what, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  fail("Zeitüberschreitung: " + what);
}
const RESULT = {
  offers: [
    { id: "booking:496993", source: "booking", sourceName: "Booking.com", name: "Rooms Šećer", total: 720, currency: "EUR", url: "https://www.booking.com/hotel/hr/sobe-a-eaer.html", score: 9.4, reviews: 416, stars: 1, place: "Split Stadtzentrum, Split", facts: ["Parkplatz", "Familienzimmer"], lat: 43.515, lon: 16.47 },
    { id: "trivago:c89342aae3a0", source: "trivago", sourceName: "Trivago", via: "Airbnb", name: "Ferienwohnung Klara", total: 783, currency: "EUR", url: "https://www.trivago.de/de/lm/klara", score: 9.4, reviews: 194, place: "Split, 0.9 km bis Zentrum", facts: ["Küche", "Parkplatz"] },
    { id: "trivago:9c4d6ea1f5e0", source: "trivago", sourceName: "Trivago", via: "Trip.com", name: "Cornaro Hotel", total: 2364, currency: "EUR", url: "https://www.trivago.de/de/lm/cornaro", score: 9.6, reviews: 4022, stars: 5, place: "Split, 0.4 km bis Zentrum", lat: 43.5081, lon: 16.4402, test: true }
  ],
  sources: [
    { id: "booking", name: "Booking.com", configured: true, ok: true, count: 1, ms: 2100 },
    { id: "trivago", name: "Trivago", configured: true, ok: true, count: 2, ms: 1800 },
    { id: "liteapi", name: "liteAPI", configured: true, ok: true, count: 1, ms: 900, test: true }
  ]
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4176", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [];
  let emptyNext = false;
  let notWired = false;
  // Such-Dienst meldet: Partner-Links an
  await p.route("https://flights.test/health", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, partner: true, stays: ["booking", "trivago"] }) }));
  await p.route("https://flights.test/stays/search", async r => {
    asked.push(JSON.parse(r.request().postData()));
    await new Promise(res => setTimeout(res, 200));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(emptyNext ? { offers: [], sources: RESULT.sources.map(x => ({ ...x, count: 0, ...(x.id === "liteapi" && notWired ? { configured: false, ok: false } : {}) })) } : RESULT) });
  });
  // Orts- und Flughafendaten des Artefakts (liegen auf der Seite eine Ebene über der App)
  for (const f of ["airports.json", "world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  await p.route("**/coast/*.json", r => r.fulfill({ path: `../public/coast/${r.request().url().split("/").pop()}` }).catch(() => r.fulfill({ status: 404 })));
  // Tageskurse (EZB) für die Anzeige in anderer Währung
  await p.route("https://flights.test/rates", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ date: "2026-10-01", rates: { EUR: 1, USD: 1.1, PLN: 4.25, GBP: 0.8 } }) }));
  // Karte: leerer Kartenstil statt der echten Kacheln (OpenFreeMap)
  await p.route("https://tiles.openfreemap.org/**", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ version: 8, sources: {}, layers: [] }) }));
  await p.goto(URL);
  await p.locator(".start .home-new").click();
  await p.locator(".modal .newtrip .btn.primary").click();
  await p.locator("#stay .st-open").scrollIntoViewIfNeeded();
  await p.locator("#stay .st-open").click();
  const m = p.locator(".modal");

  // Ort und Daten eintragen, Art „Ganze Unterkunft“ ist Standard, beide Quellen an
  if (!(await m.locator(".chip.on", { hasText: "Ganze Unterkunft" }).count())) fail("Ganze Unterkunft nicht vorausgewählt");
  if ((await m.locator(".chip.on", { hasText: /Booking\.com|Trivago/ }).count()) !== 2) fail("nicht beide Quellen an");
  await m.locator("label.f", { hasText: "Ort" }).locator("input").fill("Split");
  // Zeitraum in einem Kalender: zwei Tipps (wie bei Airbnb), schließt von selbst
  await m.locator(".st-dates .dr-btn").click();
  const jul = p.locator(".dr-sheet [data-m='2027-07']");
  await jul.scrollIntoViewIfNeeded();
  await jul.locator(".dr-d", { hasText: /^18$/ }).click();
  if ((await p.locator(".dr-sheet .dr-d.on").count()) !== 1) fail("erster Tipp nicht markiert");
  await jul.locator(".dr-d", { hasText: /^25$/ }).click();
  await p.locator(".dr-sheet").waitFor({ state: "detached" });
  if (!(await m.locator(".st-dates .dr-btn").innerText()).includes("7 Nächte")) fail("Zeitraum im Feld: " + (await m.locator(".st-dates .dr-btn").innerText()));
  log("Zeitraum mit zwei Tipps im Kalender: 18.–25.07., 7 Nächte");
  if (!(await m.locator("p", { hasText: "7 Nächte" }).count())) fail("Nächte nicht angezeigt");
  const bk = await m.locator(".fs-direct a", { hasText: "Booking.com" }).getAttribute("href");
  if (!bk.includes("ss=Split") || !bk.includes("checkin=2027-07-18") || !bk.includes("checkout=2027-07-25")) fail("Booking-Link: " + bk);
  log("Direkt-Link zu Booking.com mit Ort und Daten");
  // Klick wird nebenher gezählt: nur Partner und Kategorie, der Link öffnet trotzdem
  const clicks = [];
  await p.route("https://flights.test/click", r => { clicks.push(r.request().postData()); return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }); });
  await p.context().route("https://www.booking.com/**", r => r.fulfill({ status: 200, contentType: "text/html", body: "<p>Booking</p>" }));
  // erst der Hinweis „kein Reiseveranstalter, Vertrag nur mit dem Anbieter“; gezählt wird erst beim Weitergehen
  await m.locator(".fs-direct a", { hasText: "Booking.com" }).click();
  const gate = p.locator(".broker-gate");
  await gate.waitFor();
  if (!(await gate.innerText()).includes("kein Reiseveranstalter") || !(await gate.innerText()).includes("nur mit Booking.com")) fail("Hinweis beim Wechsel: " + (await gate.innerText()));
  await p.waitForTimeout(300);
  if (clicks.length) fail("vor dem Weitergehen gezählt");
  await gate.locator("label.check input").check();
  const [tab] = await Promise.all([p.context().waitForEvent("page"), gate.locator(".broker-go").click()]);
  await tab.close();
  for (let i = 0; i < 20 && !clicks.length; i++) await p.waitForTimeout(100);
  if (clicks[0] !== JSON.stringify({ p: "booking", c: "stay" })) fail("Klickzählung: " + JSON.stringify(clicks));
  // „nicht mehr anzeigen“: der nächste Klick öffnet direkt
  const [tab2] = await Promise.all([p.context().waitForEvent("page"), m.locator(".fs-direct a", { hasText: "Booking.com" }).click()]);
  await tab2.close();
  if (!(await m.locator(".broker-note", { hasText: "kein Reiseveranstalter" }).count())) fail("Hinweis unter den Ergebnissen fehlt");
  log("Wechsel zu Booking.com: erst Hinweis (kein Reiseveranstalter, Vertrag nur mit Booking.com), dann gezählt; „nicht mehr anzeigen“ wirkt; Hinweis unter den Ergebnissen");
  const gyg = p.locator("#attractions .fs-direct a", { hasText: "GetYourGuide" });
  if (await gyg.count()) fail("Erlebnis-Links ohne Reiseziel");
  // Ausstattung und Bewertung gehen an den Such-Dienst
  await more(m);
  await m.locator(".st-filters .chip", { hasText: "Pool" }).click();
  await m.locator("label.f", { hasText: "Bewertung" }).locator("select").selectOption("7");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q = asked[0];
  if (q.must?.join() !== "pool" || q.minScore !== 7 || q.minStars) fail("Filter falsch: " + JSON.stringify(q));
  log("Filter (Pool, Bewertung ab 7) in der Anfrage");
  if (q.place !== "Split" || q.checkin !== "2027-07-18" || q.checkout !== "2027-07-25" || q.type !== "whole" || q.adults !== 1 || q.rooms !== 1) fail("Anfrage falsch: " + JSON.stringify(q));
  // alle Quellen an: keine Liste (ein älterer Such-Dienst kennt neue Quellen nicht); Land als Code für liteAPI
  // liteAPI ist nicht angebunden (/health): ausgegraut, nur die angebundenen Quellen gehen mit
  if (q.sources?.join() !== "booking,trivago" || q.cc !== "HR" || !(Math.abs(q.lat - 43.51) < 0.1 && Math.abs(q.lon - 16.44) < 0.1)) fail("Quellen/Land/Lage falsch: " + JSON.stringify(q));
  // Markt der Person (#464): ohne Wohnort aus der Browser-Region (de-DE), Sprache der App
  if (q.market !== "DE" || q.lang !== "de") fail("Markt/Sprache falsch: " + JSON.stringify(q));
  log("Anfrage an den Such-Dienst stimmt (Markt DE, Sprache de)");
  const bkChip = m.locator(".fs-more .chip", { hasText: "liteAPI" });
  if (!(await bkChip.isDisabled()) || !(await bkChip.textContent()).includes("noch nicht angebunden")) fail("liteAPI nicht ausgegraut");
  log("Nicht angebundene Quelle ausgegraut, nicht in der Anfrage");

  const src = await m.locator(".fs-src").textContent();
  if (!src.includes("Booking.com: 1 Treffer") || !src.includes("Trivago: 2 Treffer")) fail("Quellen-Zeile: " + src);
  const first = m.locator(".fs-res").first();
  const t = await first.textContent();
  if (!t.includes("Rooms Šećer") || !t.includes("720") || !t.includes("103 € pro Nacht") || !t.includes("9,4 (416 Bew.)")) fail("Treffer: " + t);
  if (!(await m.locator(".fs-res", { hasText: "Ferienwohnung Klara" }).locator(".fs-badge", { hasText: "Trivago · Airbnb" }).count())) fail("Portal fehlt");
  log("Treffer mit Preis pro Nacht, Bewertung und Quelle");
  // Treffer aus einem Testzugang (Sandbox): Hinweis über der Liste, Kennzeichen am Treffer, Quelle mit „(Test)“
  if (!(await m.locator(".test-banner").textContent()).includes("liteAPI")) fail("Hinweis Testangebote fehlt");
  if (!(await m.locator(".fs-res", { hasText: "Cornaro Hotel" }).locator(".pill-test").count())) fail("Kennzeichen Test fehlt");
  if (await m.locator(".fs-res", { hasText: "Rooms" }).locator(".pill-test").count()) fail("echter Treffer als Test markiert");
  if (!(await m.locator(".fs-src").textContent()).includes("liteAPI (Test)")) fail("Quelle ohne (Test)");
  log("Testangebote: Hinweis über der Liste, Kennzeichen „Test“ nur am Testtreffer");

  // nach Bewertung sortieren
  await m.locator(".chip", { hasText: "Beste Bewertung" }).click();
  // Testangebote stehen immer hinter den echten (Cornaro ist hier ein Testtreffer, obwohl am besten bewertet)
  if (!(await m.locator(".fs-res").first().textContent()).includes("Rooms")) fail("Sortierung nach Bewertung");
  if (!(await m.locator(".fs-res").last().textContent()).includes("Cornaro Hotel")) fail("Testangebot nicht hinten");
  // nach Nähe zum Zentrum (aus „x km bis Zentrum“)
  await m.locator(".chip", { hasText: "Nähe Zentrum" }).click();
  if (!(await m.locator(".fs-res").first().textContent()).includes("Cornaro Hotel")) fail("Sortierung nach Nähe Zentrum");
  if ((await m.locator(".fs-res").nth(1).textContent()).includes("Rooms")) fail("ohne Entfernung nicht ans Ende");
  // Entfernung zum Zentrum je Treffer (Angabe des Anbieters oder aus den Koordinaten)
  if (!(await m.locator(".fs-res", { hasText: "Cornaro Hotel" }).locator(".st-dist").textContent()).includes("400 m zum Zentrum")) fail("Entfernung Cornaro: " + await m.locator(".fs-res", { hasText: "Cornaro Hotel" }).locator(".st-dist").textContent());
  if (!/\d,\d km zum Zentrum/.test(await m.locator(".fs-res", { hasText: "Rooms" }).locator(".st-dist").textContent())) fail("Entfernung aus Koordinaten fehlt");
  // Google-Maps-Link je Treffer: Name und Ort, ohne Schlüssel
  const gm = await m.locator(".fs-res", { hasText: "Cornaro Hotel" }).locator(".st-gmap").getAttribute("href");
  if (gm !== "https://www.google.com/maps/search/?api=1&query=Cornaro%20Hotel%2C%20Split") fail("Google-Maps-Link: " + gm);

  // Karte: Preise als Schilder, Tipp zeigt die Unterkunft darunter; Treffer ohne Lage werden gezählt
  await m.locator(".st-view .chip", { hasText: "Karte" }).click();
  await until(async () => (await m.locator(".mapbox .map-stay").count()) === 2, "zwei Preisschilder auf der Karte");
  if (!(await m.locator(".st-maphint").textContent()).includes("1 ohne Lage")) fail("Hinweis ohne Lage: " + await m.locator(".st-maphint").textContent());
  // unter der Karte: alle im Ausschnitt; die angetippte zuerst und markiert
  await until(async () => (await m.locator(".fs-res").count()) === 2, "Unterkünfte im Kartenausschnitt");
  if (!(await m.locator(".st-maphint").textContent()).includes("2 Unterkünfte im Kartenausschnitt")) fail("Hinweis Ausschnitt: " + await m.locator(".st-maphint").textContent());
  await m.locator(".map-stay", { hasText: "2.364" }).click();
  await until(async () => (await m.locator(".fs-res").first().textContent()).includes("Cornaro Hotel"), "angetippte Unterkunft zuerst");
  if (!(await m.locator(".fs-res.st-pick").count())) fail("angetippte Unterkunft nicht markiert");
  if (!(await m.locator(".map-stay.on", { hasText: "2.364" }).count())) fail("Preisschild nicht markiert");
  await m.locator(".st-view .chip", { hasText: "Liste" }).click();
  if ((await m.locator(".fs-res").count()) !== 3) fail("zurück zur Liste");
  // „Auf der Karte“ am Treffer: Karte auf, Unterkunft markiert und zuerst
  await m.locator(".fs-res", { hasText: "Cornaro Hotel" }).locator(".st-onmap").click();
  await until(async () => (await m.locator(".map-stay.on", { hasText: "2.364" }).count()) === 1, "Cornaro auf der Karte markiert");
  if (!(await m.locator(".fs-res").first().textContent()).includes("Cornaro Hotel")) fail("markierte Unterkunft nicht zuerst");
  await m.locator(".st-view .chip", { hasText: "Liste" }).click();
  log("Karte mit Preisschildern, „Auf der Karte“ je Treffer, Google-Maps-Link je Treffer");
  // Filterleiste: Ausstattung „Küche“ mit Anzahl, filtert ohne neue Anfrage; zurücksetzen
  const nAsked = asked.length;
  await m.locator(".sf .ff-more > summary").click();
  const kitchen = m.locator(".sf .chip", { hasText: "Küche" });
  if (!/Küche\s*1 · ab 783/.test(await kitchen.textContent())) fail("Chip Küche: " + await kitchen.textContent());
  await kitchen.click();
  if ((await m.locator(".fs-res").count()) !== 1 || !(await m.locator(".fs-res").textContent()).includes("Klara")) fail("Filter Küche");
  if (!(await m.locator(".sf .pill-n").textContent()).includes("1 aktiv")) fail("Anzahl aktiver Filter");
  await m.locator(".sf .ff-reset").click();
  if ((await m.locator(".fs-res").count()) !== 3 || asked.length !== nAsked) fail("Filter zurücksetzen / keine neue Anfrage");
  log("Filterleiste: Küche → 1 von 3, ohne neue Anfrage, zurückgesetzt");

  // zwei übernehmen → ein Posten mit 2 Angeboten, Preis für den ganzen Aufenthalt
  await m.locator(".fs-res", { hasText: "Ferienwohnung Klara" }).locator(".btn", { hasText: "Übernehmen" }).click();
  // Übernehmen schließt die Suche; zweites Angebot über die Suche am Posten
  await m.waitFor({ state: "detached" });
  await p.locator("#stay .card", { hasText: "Unterkunft in Split" }).first().click();
  await p.locator("#stay .st-item").first().click();
  if (!(await m.locator(".st-filters .chip.on", { hasText: "Pool" }).count())) fail("Filter nicht gemerkt");
  await more(m);
  await m.locator(".st-filters .chip", { hasText: "Pool" }).click();
  log("Filter gemerkt");
  // leeres Ergebnis bei aktiven Mindestwerten: Hinweis mit den Werten, „Ohne Mindestwerte suchen“ wiederholt die Suche ohne sie
  emptyNext = true;
  await m.locator(".fs-form .btn.primary").click();
  const warn = m.locator(".warnline", { hasText: "Aktive Mindestwerte" });
  await warn.waitFor();
  if (!(await warn.textContent()).includes("ab 7,0")) fail("Hinweis Mindestwerte: " + await warn.textContent());
  // leere Antwort mit nicht angebundener Quelle: Hinweis, „Mit allen Quellen suchen“ wiederholt die Suche
  notWired = true;
  await m.locator(".fs-form .btn.primary").click();
  const nw = m.locator(".warnline", { hasText: "noch nicht angebunden" });
  await nw.waitFor();
  const askedBefore = asked.length;
  emptyNext = false; notWired = false;
  await nw.locator(".btn", { hasText: "Mit allen Quellen suchen" }).click();
  await m.locator(".fs-res").first().waitFor();
  if (asked.length !== askedBefore + 1) fail("„Mit allen Quellen suchen“ hat nicht erneut gesucht");
  log("Leeres Ergebnis mit nicht angebundener Quelle: Hinweis, „Mit allen Quellen suchen“ wiederholt die Suche");
  emptyNext = true;
  await m.locator(".fs-form .btn.primary").click();
  await warn.waitFor();
  emptyNext = false;
  await warn.locator(".btn", { hasText: "Ohne Mindestwerte suchen" }).click();
  await m.locator(".fs-res").first().waitFor();
  const relaxed = asked[asked.length - 1];
  if (relaxed.minScore || relaxed.minStars || relaxed.must) fail("Suche ohne Mindestwerte schickt sie doch: " + JSON.stringify(relaxed));
  log("Leeres Ergebnis mit Mindestwerten: Hinweis, „Ohne Mindestwerte suchen“ liefert Treffer");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res", { hasText: "Rooms Šećer" }).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.waitFor({ state: "detached" });
  const cards = p.locator("#stay .card", { hasText: "Unterkunft in Split" });
  if ((await cards.count()) !== 1) fail("Posten nicht angelegt");
  const c = await cards.textContent();
  if (!c.includes("2 Angebote") || !c.includes("7 Nächte")) fail("Posten: " + c);
  // Link zum Anbieter des gewählten Angebots bleibt auf der Karte
  const srcHref = await cards.locator(".src-link a:not(.gmap)").getAttribute("href").catch(() => null);
  if (!srcHref || !/booking\.com|trivago\.de/.test(srcHref)) fail("Link zum Anbieter fehlt auf der Karte: " + srcHref);
  if (!c.includes("720")) fail("günstigstes Angebot nicht gewählt: " + c);
  // Lage des gewählten Angebots in Google Maps
  const cardMap = await cards.locator(".src-link a.gmap").getAttribute("href").catch(() => null);
  if (!cardMap?.includes("query=Rooms%20%C5%A0e%C4%87er%2C%20Split")) fail("Google-Maps-Link am Posten: " + cardMap);
  log("Übernommen: ein Posten mit 2 Angeboten, günstigstes zählt");
  // Karte der Reise im Kapitel Unterkunft: gewählte Unterkunft mit Ort, Tipp springt zum Posten
  await p.locator("#stay .tm-open").click();
  const tmPin = p.locator("#stay .trip-map .map-stay");
  await tmPin.first().waitFor();
  if (!(await tmPin.first().textContent()).includes("Unterkunft in Split")) fail("Karte der Reise: " + await tmPin.first().textContent());
  await tmPin.first().click();
  await until(async () => (await cards.first().getAttribute("class")).includes("flash"), "Posten nach Tipp auf der Karte");
  await p.locator("#stay .trip-map .linkbtn", { hasText: "Karte schließen" }).click();
  if (await p.locator("#stay .trip-map").count()) fail("Karte der Reise nicht geschlossen");
  log("Karte der Reise: Unterkunft als Pin, Tipp springt zum Posten, wieder geschlossen");
  // Vergleich nebeneinander in der Karte: wählen, wieder zurück
  const tiles = cards.locator(".st-cmp .cmp-t");
  if ((await tiles.count()) !== 2) fail("Vergleich: " + await tiles.count() + " Kacheln");
  if (!(await cards.locator(".cmp-t.sel", { hasText: "Rooms Šećer" }).count())) fail("gewähltes Angebot nicht markiert");
  // #438: Buchstaben wie auf der Karte, Entfernung zum Zentrum (nur mit Lage), ganze Reise je Angebot
  const tRooms = cards.locator(".cmp-t", { hasText: "Rooms Šećer" }), tKlara = cards.locator(".cmp-t", { hasText: "Ferienwohnung Klara" });
  if (!(await tiles.nth(0).locator(".cmp-l").innerText()).includes("A") || !(await tiles.nth(1).locator(".cmp-l").innerText()).includes("B")) fail("Buchstaben fehlen");
  await until(async () => /Zentrum Split [\d,]+ k?m/.test(await tRooms.innerText()), "Entfernung zum Zentrum bei Rooms Šećer");
  const tR = await tRooms.innerText(), tK = await tKlara.innerText();
  if (!tK.includes("Lage unbekannt")) fail("Angebot ohne Lage: " + tK);
  if (!tR.includes("Ganze Reise damit") || !tR.includes("aktuell gewählt")) fail("ganze Reise beim gewählten Angebot: " + tR);
  if (!/\+[\d.]+ € gesamt/.test(tK)) fail("Abstand der ganzen Reise beim anderen Angebot: " + tK);
  // #441: Entfernung zum Meer (Split liegt an der Küste), eigener Bezugspunkt über Koordinaten
  await until(async () => /Meer (unter 1 km|[\d,]+ km)/.test(await tRooms.innerText()), "Entfernung zum Meer");
  await cards.locator(".cmp-add").click();
  await cards.locator(".cmp-form input").nth(0).fill("Partylocation");
  await cards.locator(".cmp-form input").nth(1).fill("nirgendwo");
  await cards.locator(".cmp-add-ok").click();
  await cards.locator(".cmp-form .err").waitFor();
  await cards.locator(".cmp-form input").nth(1).fill("https://www.google.com/maps/place/x/@43.5089,16.4392,17z");
  await cards.locator(".cmp-add-ok").click();
  await cards.locator(".cmp-own", { hasText: "Partylocation" }).waitFor();
  await until(async () => /Partylocation [\d,]+ k?m/.test(await tRooms.innerText()), "Entfernung zum eigenen Punkt");
  await until(() => p.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "{}").refs?.[0]?.name === "Partylocation"), "eigener Punkt in der Reise gespeichert");
  await cards.locator(".cmp-own-x").click();
  if (await cards.locator(".cmp-own").count()) fail("eigener Punkt nicht entfernt");
  await cards.locator(".cmp-t", { hasText: "Ferienwohnung Klara" }).locator(".cmp-pick").click();
  await cards.locator(".cmp-t.sel", { hasText: "Ferienwohnung Klara" }).waitFor();
  // 783 € + Kurtaxe Split automatisch geschätzt (2 € × 1 Person × 7 Nächte)
  if (!(await cards.locator(".stay .price b").textContent()).includes("797")) fail("Preis nach Wählen: " + await cards.locator(".stay .price b").textContent());
  await cards.locator(".cmp-t", { hasText: "Rooms Šećer" }).locator(".cmp-pick").click();
  await cards.locator(".cmp-t.sel", { hasText: "Rooms Šećer" }).waitFor();
  log("Vergleich nebeneinander: A/B, Entfernung zum Zentrum und zum Meer, eigener Punkt per Google-Maps-Link, ganze Reise je Angebot; Klara gewählt (783 € + ca. 14 € Kurtaxe), zurück zu Rooms Šećer");

  // wie im Artefakt: Anwesenheit aus dem Flug, Lücke im Plan → „Unterkunft suchen“ für genau diese Nächte und Personen
  const TRIP = {
    id: "k1", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-29",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }, { id: "c", name: "Cleo", household: "Hase", age: 35 }],
    households: { Hase: { arrive: "2027-07-20", depart: "2027-07-25" } },
    items: [
      { id: "f", cat: "flights", name: "Flug", status: "idea", participants: ["a", "b"], options: [{ id: "o", label: "EW", price: { mode: "unit", currency: "EUR", unit: 900 },
        legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05" }, { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-29T16:25", arr: "2027-07-29T18:25" }] }] },
      { id: "s", cat: "stay", name: "Villa", status: "idea", from: "2027-07-18", to: "2027-07-25", options: [{ id: "v", label: "Villa", price: { mode: "unit", currency: "EUR", unit: 1400, basis: "stay" } }] }
    ],
    tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
  };
  // Stand einspielen; ausstehende Speicherungen der App überschreiben ihn nicht mehr (reloadHome)
  await reloadHome(p, { set: { "rk2-t:k1": TRIP, "rk2-index": [{ id: "k1", name: TRIP.name, place: TRIP.place }], "rk2-current": "k1" } });
  await p.locator(".start .home-trip").first().click();
  const gl = await p.locator("#attractions .fs-direct a", { hasText: "GetYourGuide" }).getAttribute("href");
  if (!gl.includes("q=Split") || !gl.includes("date_from=2027-07-18")) fail("GetYourGuide-Link: " + gl);
  log("Erlebnisse: Links zu GetYourGuide (mit Reisezeitraum), Viator und Tiqets");
  const gap = p.locator("#stay .pl-notes li.crit", { hasText: "ohne Unterkunft" });
  await gap.first().waitFor();
  const gt = await gap.first().textContent();
  if (!gt.includes("Klein") || !gt.includes("So 25.07. bis Do 29.07.") || !gt.includes("4 Nächte")) fail("Lücke im Plan: " + gt);
  if (!(await p.locator("#stay .pl-notes li.info", { hasText: "Check-in meist erst ab 15 Uhr" }).count())) fail("Hinweis Check-in fehlt");
  log("Plan: Lücke 25.07. bis 29.07. für Klein, Hinweis zum Check-in");
  await gap.first().locator(".linkbtn", { hasText: "Unterkunft suchen" }).click();
  const pres = await m.locator(".st-pres").textContent();
  if (!pres.includes("🛬 So 18.07. 08:05") || !pres.includes("🛫 Do 29.07. 16:25") || !pres.includes("⏳ Check-in meist erst ab 15 Uhr") || pres.includes("Hase")) fail("Anwesenheit: " + pres);
  if ((await m.locator(".st-dates .dr-btn").getAttribute("data-from")) !== "2027-07-25") fail("Check-in nicht aus der Lücke");
  if ((await m.locator(".st-dates .dr-btn").getAttribute("data-to")) !== "2027-07-29") fail("Check-out nicht aus der Lücke");
  const gg = await m.locator(".st-guests").textContent();
  if (!gg.includes("2 Gäste") || !gg.includes("1 Erw., 1 Kind (9 J.)")) fail("Gäste: " + gg);
  log("Suche aus der Lücke: 25.07. bis 29.07., 2 Gäste (Anna, Ben 9 J.), Anwesenheit laut Flug");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q2 = asked.at(-1);
  if (q2.checkin !== "2027-07-25" || q2.checkout !== "2027-07-29" || q2.adults !== 1 || q2.childAges.join() !== "9") fail("Anfrage aus der Lücke: " + JSON.stringify(q2));
  await m.locator(".fs-res").first().locator(".btn", { hasText: "Übernehmen" }).click();
  await m.waitFor({ state: "detached" });
  await p.locator("#stay .pl-ok, #stay .pl-notes").first().waitFor();
  if ((await p.locator("#stay .pl-notes li.crit", { hasText: "Klein" }).count())) fail("Lücke für Klein noch da");
  log("Übernommen: Posten nur für Klein, 25.07. bis 29.07., Lücke weg");

  // Suche aus dem Posten heraus: Vergleich zum bisherigen Preis
  // auf den Titel tippen (die Verpflegung auf der Karte ist ein eigenes Auswahlfeld)
  await p.locator("#stay .card:not(.plan-card)", { hasText: "Villa" }).locator("h3").click();
  await p.locator(".st-item").click();
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  if (!(await m.locator(".fs-res", { hasText: "Rooms Šećer" }).locator(".st-diff.good", { hasText: "−680 €" }).count())) fail("Vergleich zum bisherigen Preis fehlt");
  log("Suche aus dem Posten: 720 € ist 680 € günstiger als die Villa");
  await m.locator(".x").click();
  // Suche als Fenster über dem Posten: danach ist man wieder am offenen Posten, „Fertig“ schließt ihn
  if (!(await p.evaluate(() => document.body.classList.contains("editing")))) fail("nach der Suche nicht mehr am Posten");
  await p.locator("#stay .card.edit .ed-foot .btn.primary").click();
  if (await p.evaluate(() => document.body.classList.contains("editing"))) fail("Posten nach „Fertig“ noch offen, Plan ausgegraut");
  // nach dem Ausblenden des Postens läuft das Wiedereinblenden kurz als Übergang: auf den Endwert warten
  let op = "";
  for (let i = 0; i < 20; i++) { op = await p.locator("#stay .plan-card").evaluate(el => getComputedStyle(el).opacity); if (op === "1") break; await p.waitForTimeout(100); }
  if (op !== "1") fail("Plan ausgegraut: opacity " + op);
  log("Suche aus dem Posten als Fenster, danach wieder am Posten; nach „Fertig“ ist der Plan nicht ausgegraut");

  // wie im Artefakt: sehr früher Rückflug weit weg vom Ziel → letzte Nacht am Flughafen, mit Orten in der Nähe
  const early = JSON.parse(JSON.stringify(TRIP));
  early.place = "Makarska";
  early.items[0].options[0].legs[1].dep = "2027-07-29T06:30";
  early.items.push({ id: "s2", cat: "stay", name: "Villa 2", status: "idea", from: "2027-07-25", to: "2027-07-29", participants: ["a", "b"], options: [{ id: "v2", label: "Villa 2", price: { mode: "unit", currency: "EUR", unit: 800, basis: "stay" } }] });
  await reloadHome(p, { set: { "rk2-t:k1": early } });
  await p.locator(".start .home-trip").first().click();
  const apn = p.locator("#stay .pl-notes li", { hasText: "Letzte Nacht näher am Flughafen?" });
  await apn.waitFor();
  const at = await apn.textContent();
  if (!at.includes("06:30 ab SPU") || !at.includes("von Makarska") || !at.includes("Trogir")) fail("Vorschlag am Flughafen: " + at);
  log("Plan: Rückflug 06:30 ab SPU, von Makarska ca. 1 h → letzte Nacht am Flughafen, z. B. Trogir");
  await apn.locator(".linkbtn", { hasText: "Unterkunft am Flughafen suchen" }).click();
  if ((await m.locator(".st-dates .dr-btn").getAttribute("data-from")) !== "2027-07-28") fail("Check-in nicht die letzte Nacht");
  const placeNow = await m.locator("label.f", { hasText: "Ort" }).locator("input").inputValue();
  if (!(await m.locator(".st-near .chip.on", { hasText: placeNow }).count())) fail("Ort am Flughafen nicht vorgewählt: " + placeNow);
  if (!(await m.locator(".st-near .st-ap", { hasText: "SPU" }).count())) fail("Orte am Flughafen fehlen");
  // Feld leeren: bleibt leer (früher sofort wieder mit dem Ort am Flughafen gefüllt)
  await m.locator("label.f", { hasText: "Ort" }).locator("input").fill("");
  await p.waitForTimeout(300);
  if ((await m.locator("label.f", { hasText: "Ort" }).locator("input").inputValue()) !== "") fail("Ort füllt sich nach dem Löschen wieder");
  log("Ort lässt sich leeren und neu eintippen");
  await m.locator(".st-near .chip", { hasText: "Trogir" }).click();
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q3 = asked.at(-1);
  if (q3.place !== "Trogir" || q3.country !== "Croatia" || q3.checkin !== "2027-07-28" || q3.checkout !== "2027-07-29") fail("Anfrage am Flughafen: " + JSON.stringify(q3));
  log("Suche am Flughafen: Trogir, Croatia, eine Nacht 28.07. bis 29.07.");
  await m.locator(".x").click();

  // Verpflegung wie im Artefakt: Essensstil, Tage je Familie, automatische Posten; Restaurants und Supermärkte als Links
  await p.locator("#misc .food .btn", { hasText: "Verpflegung einrechnen" }).scrollIntoViewIfNeeded();
  await p.locator("#misc .food .btn", { hasText: "Verpflegung einrechnen" }).click();
  const fr = p.locator("#misc .food-rows li", { hasText: "Klein" });
  await fr.waitFor();
  const ft = await fr.textContent();
  // 11 Nächte: An- und Abreisetag je halb, also 11 Tage
  if (!ft.includes("11 Tage")) fail("Verpflegung Klein: " + ft);
  await p.locator("#misc .card[data-item]", { hasText: "Verpflegung Klein" }).waitFor();
  const before = await fr.locator("b.num").textContent();
  await p.locator("#misc .food .chip", { hasText: "Genießer" }).first().click();
  await p.waitForTimeout(200);
  if ((await fr.locator("b.num").textContent()) === before) fail("Stil ändert den Betrag nicht");
  const rl = await p.locator("#misc .fs-direct a", { hasText: "Restaurants" }).getAttribute("href");
  if (!rl.includes("google.com/maps/search/Restaurants")) fail("Restaurant-Link: " + rl);
  log("Verpflegung: Klein 11 Tage (An- und Abreise je halb), Posten „Verpflegung Klein“, „Genießer“ ändert den Betrag; Links zu Restaurants und Supermärkten");

  // Souvenirs (#421): unter Sonstiges, Betrag pro Person für diese Reise änderbar
  const souv = p.locator("#misc .souv");
  await souv.scrollIntoViewIfNeeded();
  if (await souv.locator(".souv-on").count()) await souv.locator(".souv-on").click();
  await souv.locator(".souv-step b", { hasText: "30 € pro Person" }).waitFor();
  const s1 = await souv.locator(".plan-h .muted").textContent();
  await souv.locator(".souv-step button").last().click();
  await souv.locator(".souv-step b", { hasText: "40 € pro Person" }).waitFor();
  await until(async () => (await souv.locator(".plan-h .muted").textContent()) !== s1, "Souvenirs neu gerechnet");
  if (!(await souv.innerText()).includes("für diese Reise")) fail("Souvenirs: Herkunft fehlt");
  log(`Souvenirs: 30 € → 40 € pro Person für diese Reise, ${s1} → ${await souv.locator(".plan-h .muted").textContent()}`);

  // Transport vor Ort (#420): geschätzt, solange nichts Eigenes geplant ist
  const loc = p.locator("#transport .local");
  await loc.scrollIntoViewIfNeeded();
  if (await loc.locator(".local-on").count()) await loc.locator(".local-on").click();
  await until(async () => (await loc.locator(".local-rows li").count()) > 0, "Transport vor Ort geschätzt");
  const locRows = (await loc.locator(".local-rows li b:not(.num)").allTextContents()).join(", ");
  if (!/Nahverkehr|Sprit|Flughafentransfer/.test(locRows)) fail("Transport vor Ort: " + locRows);
  log("Transport vor Ort geschätzt: " + locRows);

  // Zusammensetzung am Gesamtbetrag (#418): Verpflegung unter „Versteckt“, Klick klappt auf, zweiter Klick zu; Summe stimmt
  const n = x => Number(x.replace(/\D/g, ""));
  await p.evaluate(() => scrollTo(0, 0));
  const tabs = await p.locator(".hero .cp-tab b").allTextContents();
  const total = n(await p.locator(".hero .total b.num").first().textContent());
  if (tabs.length !== 3 || Math.abs(tabs.reduce((a, x) => a + n(x), 0) - total) > 3) fail(`Zusammensetzung ${tabs} ≠ ${total}`);
  await p.locator(".hero .cp-t-hidden").click();
  const hidden = await p.locator(".hero .cp-list .cp-row").allInnerTexts();
  if (!hidden.some(r => r.includes("Verpflegung Klein"))) fail("Verpflegung nicht unter Versteckt: " + hidden);
  if (!hidden.some(r => r.includes("Souvenirs"))) fail("Souvenirs nicht unter Versteckt: " + hidden);
  if (!hidden.some(r => /Nahverkehr|Sprit|Flughafentransfer/.test(r))) fail("Transport vor Ort nicht unter Versteckt: " + hidden);
  await p.locator(".hero .cp-row", { hasText: "Verpflegung Klein" }).locator(".cp-name").click();
  if (!(await p.locator(".hero .cp-calc").textContent()).includes("Tage")) fail("Rechenweg Verpflegung fehlt");
  // Übersicht bleibt beim Scrollen durch die aufgeklappte Liste voll sichtbar, auch nach dem Hochscrollen (#442)
  const vs = p.viewportSize();
  await p.setViewportSize({ width: vs.width, height: 420 });
  const heroOp = () => p.locator(".hero .hero-in").evaluate(el => Number(getComputedStyle(el).opacity));
  const over = await p.evaluate(() => Math.max(0, document.getElementById("hero").offsetHeight - innerHeight));
  if (over < 50) fail("Übersicht nicht höher als der Bildschirm: " + over);
  await p.evaluate(y => scrollTo(0, y), over);
  await until(async () => (await heroOp()) > 0.99, "Übersicht beim Scrollen durch die Liste voll sichtbar: " + await heroOp());
  await p.evaluate(() => scrollTo(0, 0));
  await until(async () => (await heroOp()) > 0.99, "Übersicht nach dem Hochscrollen voll sichtbar: " + await heroOp());
  await p.setViewportSize(vs);
  await p.locator(".hero .cp-t-hidden").click();
  if (await p.locator(".hero .cp-list").count()) fail("Aufschlüsselung nicht zugeklappt");
  log(`Zusammensetzung: ${tabs.join(" + ")} = Gesamt, Verpflegung unter „Versteckt“ mit Rechenweg, zweiter Klick klappt zu`);

  // Währung umschalten: alle Beträge in Złoty (Tageskurs vom Such-Dienst), Eingabe ebenfalls; zurück auf Euro
  await p.locator(".top .cur-sel").selectOption("PLN");
  // auf Deutsch schreibt Intl „PLN“, in anderen Sprachen „zł“
  await until(async () => /PLN|zł/.test(await p.locator("#stay .card[data-item]").first().textContent()), "Beträge in Złoty");
  await p.locator(".top .cur-sel").selectOption("EUR");
  await until(async () => !/PLN|zł/.test(await p.locator("#stay .card[data-item]").first().textContent()), "zurück in Euro");
  log(`Währung: auf Złoty umgestellt (Kurs vom Such-Dienst), Beträge umgerechnet, zurück auf Euro`);

  // Sprache umschalten: Texte, Datums- und Betragsformat folgen, die Wahl bleibt nach dem Neuladen
  await p.locator(".top .lang-sel").selectOption("en");
  await p.locator("#stay .st-open", { hasText: "Search accommodation" }).waitFor();
  if ((await p.evaluate(() => document.documentElement.lang)) !== "en") fail("html lang nicht en");
  if (!(await p.locator(".top .nav").textContent()).includes("Flights")) fail("Kapitel nicht übersetzt");
  await reloadHome(p);
  await p.locator(".start .home-trip").first().click();
  await p.locator("#stay .st-open", { hasText: "Search accommodation" }).waitFor();
  // Polnisch wird erst bei Bedarf geladen, auch nach dem Neuladen gleich auf Polnisch (kein Englisch dazwischen)
  await p.locator(".top .lang-sel").selectOption("pl");
  await p.locator("#stay .st-open", { hasText: "Szukaj noclegu" }).waitFor();
  await reloadHome(p);
  await p.locator(".start .home-trip").first().waitFor();
  if (await p.locator("text=Search accommodation").count()) fail("nach dem Neuladen kurz Englisch");
  await p.locator(".start .home-trip").first().click();
  await p.locator("#stay .st-open", { hasText: "Szukaj noclegu" }).waitFor();
  await p.locator(".top .lang-sel").selectOption("de");
  await p.locator("#stay .st-open", { hasText: "Unterkunft suchen" }).waitFor();
  log("Sprache: Englisch gewählt, Oberfläche übersetzt, bleibt nach dem Neuladen; Polnisch nachgeladen; zurück auf Deutsch");

  // Leiste oben bleibt beim Scrollen, die Gesamtkosten rechts bleiben darunter im Blick
  await p.evaluate(() => scrollTo({ top: 2500, behavior: "instant" }));
  await p.waitForTimeout(500);
  const sticky = await p.evaluate(() => ({ bar: document.querySelector(".top-in").getBoundingClientRect().bottom, aside: document.querySelector(".aside").getBoundingClientRect().top }));
  if (sticky.bar <= 0 || sticky.bar > sticky.aside || sticky.aside > 120) fail("Leiste oder Gesamtkosten nicht im Blick: " + JSON.stringify(sticky));
  log("Scrollen: Leiste oben sichtbar, Gesamtkosten rechts bleiben darunter stehen");

  // Fokusmodus nur im eigenen Kapitel: Karte bei der Unterkunft offen, weiter zu „Alles andere“ gescrollt → dort alles klar
  await p.locator("#stay .card[data-item] h3").first().click();
  await p.locator("#stay .card.edit").waitFor();
  await p.locator("#misc .card[data-item]").first().evaluate(el => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await p.waitForTimeout(900);
  const misc = await p.locator("#misc .card[data-item]").first().evaluate(el => { const c = getComputedStyle(el); return { o: c.opacity, f: c.filter }; });
  if (misc.o !== "1" || misc.f !== "none") fail("Karte im nächsten Kapitel abgeblendet: " + JSON.stringify(misc));
  log("Fokus: offene Karte bei der Unterkunft blendet beim Weiterscrollen „Alles andere“ nicht ab");

  // Unterwegs: das Fahrzeug wechselt beim Scrollen durchs Kapitel von Taxi über Bus zur Bahn
  const rides = [];
  for (const q of [0.1, 0.5, 0.9]) {
    await p.locator("#transport").evaluate((el, q) => { const r = el.getBoundingClientRect(); scrollTo({ top: scrollY + r.top + r.height * q - innerHeight / 2, behavior: "instant" }); }, q);
    await p.waitForTimeout(400);
    rides.push(await p.locator(".veh .v.on").getAttribute("class"));
  }
  if (rides.map(c => c.match(/v-(\w+)/)[1]).join() !== "taxi,bus,train") fail("Unterwegs: " + rides.join(" | "));
  log("Unterwegs: Taxi → Bus → Bahn beim Scrollen");

  // Partner-Links an: Viator-Suche am Reiseort mit Partnerkennung, gekennzeichnet und mit Hinweis
  const vl = p.locator("#attractions a", { hasText: "Viator" });
  const href = await vl.getAttribute("href");
  if (!href.includes("pid=P00322974") || !href.includes("mcid=42383") || !(await vl.getAttribute("rel")).includes("sponsored")) fail("Viator-Link ohne Partnerkennung: " + href);
  if (!(await p.locator("#attractions", { hasText: "Partner-Link*" }).count())) fail("Viator-Partner-Link nicht gekennzeichnet");
  log("Viator: Partner-Links an → Link mit Kennung, als Partner-Link gekennzeichnet");

  // Rundreise wie bei Eduard: Quito → Lima → Rio, Nachtflug nach Rio; Lücken und Suche je Stadt statt „alles in Quito“
  const leg = (dir, from, to, dep, arr, toCity) => ({ dir, from, to, dep, arr, ...(toCity ? { toCity } : {}) });
  const RT = {
    id: "r1", name: "Südamerika", place: "", country: "", from: "2027-04-07", to: "2027-04-23", detail: { flights: true, stay: true },
    travelers: [{ id: "e", name: "Eduard", household: "Malenki", age: 40 }], households: {},
    items: [{ id: "rf", cat: "flights", name: "Rundreise", status: "idea", options: [{ id: "ro", label: "Rundreise", price: { mode: "unit", currency: "EUR", unit: 2175 }, legs: [
      leg("out", "DUS", "UIO", "2027-04-07T06:20", "2027-04-07T16:10", "Quito"), leg("via", "UIO", "LIM", "2027-04-14T16:49", "2027-04-14T19:05", "Lima"),
      leg("via", "LIM", "GIG", "2027-04-20T23:25", "2027-04-21T07:00"), leg("back", "GIG", "DUS", "2027-04-22T15:35", "2027-04-23T12:25")] }] }],
    tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }
  };
  await p.waitForTimeout(600);
  await p.evaluate(t => { localStorage.setItem("rk2-t:r1", JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: "r1", name: t.name, place: "" }])); localStorage.setItem("rk2-current", "r1"); }, RT);
  await reloadHome(p);
  await p.locator(".start .home-trip").first().click();
  const rgaps = p.locator("#stay .pl-notes li.crit", { hasText: "ohne Unterkunft" });
  await rgaps.first().waitFor();
  await until(async () => (await rgaps.nth(2).textContent().catch(() => "")).includes("Rio de Janeiro"), "Station Rio aus dem Flughafen GIG");
  const gtexts = await rgaps.allTextContents();
  if (gtexts.length !== 3 || !gtexts[0].includes("Quito") || !gtexts[0].includes("7 Nächte") || !gtexts[1].includes("Lima") || !gtexts[1].includes("6 Nächte") || !gtexts[2].includes("Mi 21.04.")) fail("Lücken je Station: " + gtexts.join(" | "));
  if (!(await p.locator("#stay .pl-seg.air").count())) fail("Nacht im Flugzeug nicht markiert");
  log("Rundreise: Lücken je Stadt (Quito 7, Lima 6, Rio 1 Nacht), Nachtflug nach Rio als ✈ statt Lücke");
  await rgaps.nth(1).locator(".linkbtn", { hasText: "Unterkunft suchen" }).click();
  if ((await m.locator("label.f", { hasText: "Ort" }).locator("input").inputValue()) !== "Lima") fail("Ort aus der Station");
  if ((await m.locator(".st-dates .dr-btn").getAttribute("data-from")) !== "2027-04-14" || (await m.locator(".st-dates .dr-btn").getAttribute("data-to")) !== "2027-04-20") fail("Daten aus der Station");
  if ((await m.locator(".st-stations .chip").count()) !== 3) fail("Stationen als Auswahl");
  await m.locator(".st-stations .chip", { hasText: "Rio de Janeiro" }).click();
  if ((await m.locator("label.f", { hasText: "Ort" }).locator("input").inputValue()) !== "Rio de Janeiro" || (await m.locator(".st-dates .dr-btn").getAttribute("data-from")) !== "2027-04-21") fail("Station Rio gewählt");
  await m.locator(".modal-h .x").click();
  // Kapitel-Knopf ohne Vorgabe: erste Station statt ganzer Reise
  await p.locator("#stay .st-open").click();
  if ((await m.locator("label.f", { hasText: "Ort" }).locator("input").inputValue()) !== "Quito" || (await m.locator(".st-dates .dr-btn").getAttribute("data-to")) !== "2027-04-14") fail("Suche ohne Vorgabe: nicht die erste Station");
  // echte Stadtsuche: Cusco (Land der Reise, ohne Land), Bogotá (anderes Land, mit Land; an die Anbieter englisch)
  const pf = m.locator("label.f", { hasText: "Ort" }).locator("input");
  await pf.fill("Cus");
  await m.locator(".st-placef .sugg button", { hasText: "Cusco" }).first().click();
  if ((await pf.inputValue()) !== "Cusco") fail("Stadtsuche Cusco: " + await pf.inputValue());
  await pf.fill("Bogo");
  await m.locator(".st-placef .sugg button", { hasText: "Bogotá" }).first().click();
  if ((await pf.inputValue()) !== "Bogotá, Kolumbien") fail("Stadtsuche Bogotá: " + await pf.inputValue());
  await m.locator(".fs-form .btn.primary").click();
  await until(async () => asked.at(-1)?.checkin === "2027-04-07", "Suche mit Bogotá");
  const qb = asked.at(-1);
  if (qb.country !== "Colombia" || !/^Bogot/.test(qb.place)) fail("Anfrage Bogotá: " + JSON.stringify(qb));
  log("Stadtsuche: „Cus“ → Cusco, „Bogo“ → Bogotá, Kolumbien; an die Anbieter " + qb.place + ", " + qb.country);
  // Testangebot übernommen: Hinweis bleibt am Posten, an der Summe und in der Abrechnung
  await m.locator(".fs-res", { hasText: "Cornaro Hotel" }).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.waitFor({ state: "detached" });
  await p.locator("#stay .card[data-item]", { hasText: "Cornaro" }).locator(".pill-test").waitFor();
  if (!(await p.locator(".aside .tk-test").first().textContent()).includes("Testpreis")) fail("Summe ohne Hinweis auf Testpreis");
  if (!(await p.locator("#split .test-banner").count())) fail("Abrechnung ohne Hinweis auf Testpreise");
  log("Testangebot übernommen: „Testpreis“ am Posten, Hinweis an der Summe und in der Abrechnung");
  log("Suche je Station: aus der Lücke Lima 14.–20.04., Auswahl der Stationen, ohne Vorgabe Quito 07.–14.04.");

  // privat bzw. schon vorhanden (#233): neue Reise ohne Ziel, Ort und Zeitraum über den Posten, Flug- und Event-Suche nutzen ihn
  await reloadHome(p);
  await p.locator(".start .home-new").click();
  await p.locator(".modal .newtrip .btn.primary").click();
  await p.locator("#stay .priv-open").scrollIntoViewIfNeeded();
  await p.locator("#stay .priv-open").click();
  const pm = p.locator(".modal", { has: p.locator("form.priv") });
  const pp = pm.locator("label.f", { hasText: "Ort" }).locator("input");
  await pp.fill("Lissa");
  await pm.locator(".priv-place .sugg button", { hasText: "Lissabon" }).first().click();
  if ((await pp.inputValue()) !== "Lissabon") fail("Ort privat: " + await pp.inputValue());
  await pm.locator("label.f", { hasText: "Anreise" }).locator("input").fill("2027-06-12");
  await pm.locator("label.f", { hasText: "Abreise" }).locator("input").fill("2027-06-19");
  if (!(await pm.locator(".priv-dest", { hasText: "Lissabon wird Reiseziel" }).count())) fail("Hinweis Reiseziel fehlt");
  if (await pm.locator(".priv-amount").inputValue()) fail("Kosten nicht leer");
  await pm.locator(".priv-save").click();
  await pm.waitFor({ state: "detached" });
  const pc = p.locator("#stay .card[data-item]", { hasText: "Privat in Lissabon" });
  await pc.waitFor();
  if (!(await pc.locator(".priv-free").count()) || !(await pc.locator(".status", { hasText: "Gewählt" }).count())) fail("Privat: nicht kostenlos oder nicht gewählt");
  if (!(await p.locator("#attractions").textContent()).includes("Erlebnisse in Lissabon finden")) fail("Events ohne Ort Lissabon");
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  const fm = p.locator(".modal", { has: p.locator(".fs-form") });
  const fto = await fm.locator("label.f", { hasText: "Nach" }).locator("input").inputValue();
  if (!fto.includes("Lissabon")) fail("Flugsuche ohne Ziel Lissabon: " + fto);
  await fm.locator(".modal-h .x").click();
  // Kosten nachtragen: 20 € pro Nacht → 140 €
  await pc.locator(".priv-edit").click();
  await pm.locator(".priv-amount").fill("20");
  await pm.locator(".chip", { hasText: "pro Nacht" }).click();
  await pm.locator(".priv-save").click();
  await pm.waitFor({ state: "detached" });
  if (!(await pc.locator(".price .num").textContent()).includes("140")) fail("Privat mit Kosten: " + await pc.locator(".price .num").textContent());
  log("Privat in Lissabon: kostenlos und gewählt, Reiseziel für Flug- und Event-Suche, Kosten 20 € pro Nacht = 140 €");

  // Kreuzfahrt (#516): im Kapitel Unterkunft anlegen, Kabinen nach Familien, Route mit Häfen, Preis je Kabine
  {
    const K = {
      id: "k516", name: "Mittelmeer", place: "Barcelona", country: "Spanien", from: "2027-06-05", to: "2027-06-12",
      travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 38 },
        { id: "c", name: "Carla", household: "Hase", age: 41 }, { id: "d", name: "Dirk", household: "Hase", age: 44 }, { id: "e", name: "Ella", household: "Hase", age: 8 }],
      items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { stay: true }
    };
    await reloadHome(p, { set: { "rk2-t:k516": K, "rk2-index": [{ id: "k516", name: K.name, place: K.place }], "rk2-current": "k516" } });
    await p.locator(".start .home-trip", { hasText: "Mittelmeer" }).first().click();
    await p.locator("#stay .cr-open").scrollIntoViewIfNeeded();
    await p.locator("#stay .cr-open").click();
    const kc = p.locator("#stay .card.edit");
    await kc.locator(".cr-cabed").first().waitFor();
    if ((await kc.locator(".cr-cabed").count()) !== 2) fail("Kabinen nach Familien: " + await kc.locator(".cr-cabed").count());
    await kc.locator(".cr-linein").fill("Reederei Test");
    await kc.locator(".cr-shipin").fill("MS Test");
    // erster Hafen ist offen: Einschiffung Barcelona ab 17 Uhr
    await kc.locator(".cr-port").fill("Barcelona");
    await kc.locator(".cr-dep").fill("17:00");
    await kc.locator(".cr-pl").last().click();
    await kc.locator(".cr-port").fill("Barcelona");
    await kc.locator(".cr-addsea").click();
    await kc.locator(".cr-addport").click();
    await kc.locator(".cr-port").fill("Palermo");
    await kc.locator(".cr-arr").fill("08:00");
    await kc.locator(".cr-dep").fill("17:00");
    if ((await kc.locator(".cr-pl").count()) !== 4) fail("Häfen: " + await kc.locator(".cr-pl").count());
    await kc.locator(".cr-price").nth(0).fill("2000");
    await kc.locator(".cr-price").nth(1).fill("2400");
    await kc.locator(".ed-foot .btn.primary").click();
    const kk = p.locator("#stay .card[data-item]", { has: p.locator(".cruise") });
    await until(async () => (await kk.locator(".price .num").textContent()).includes("4.400"), "Kreuzfahrt 4.400 €");
    const route = await kk.locator(".cr-route").innerText();
    if (!route.includes("Palermo") || !route.includes("Seetag") || !route.includes("8–17")) fail("Route: " + route);
    const kt = await kk.innerText();
    if (!kt.includes("MS Test") || !kt.includes("7 Nächte") || !kt.includes("2 Kabinen") || !kt.includes("Reederei Test")) fail("Kreuzfahrt-Karte: " + kt);
    if (kt.includes("Ohne Kabine")) fail("Warnung trotz Kabinen");
    if (!(await kk.locator(".cr-cab", { hasText: "Carla, Dirk, Ella" }).locator(".amt", { hasText: "Hase" }).count())) fail("Kabine Hase: " + kt);
    // Ella aus der Kabine nehmen: Warnung
    await kk.click();
    await kk.locator("[data-sec=cabins] > summary").click();
    await kk.locator(".cr-cabed").nth(1).locator(".chip", { hasText: "Ella" }).click();
    await kk.locator(".ed-foot .btn.primary").click();
    await kk.locator(".warnline", { hasText: "Ohne Kabine: Ella" }).waitFor();
    log("Kreuzfahrt: 2 Kabinen nach Familien, Route Barcelona – Seetag – Palermo (8–17) – Barcelona, 7 Nächte, 4.400 €, Warnung ohne Kabine");
  }

  // #441: Flüge und Erlebnisse vergleichen: Buchstaben, Hin- und Rückflug, Umstiege, Gepäck, ganze Reise p. P.; Erlebnisse mit Entfernung zum Hotel
  {
    const leg = (dir, dep, arr, stops = 0) => ({ dir, from: dir === "out" ? "DUS" : "SPU", to: dir === "out" ? "SPU" : "DUS", dep, arr, stops, minutes: 130 });
    const fopt = (id, label, unit, back, bag, stops = 0) => ({ id, label, price: { mode: "unit", currency: "EUR", unit }, legs: [leg("out", "2027-07-18T06:10", "2027-07-18T08:20", stops), leg("back", back, back.replace(/T(\d\d)/, (m, h) => "T" + String(+h + 2).padStart(2, "0")))], baggage: bag });
    const C = {
      id: "c441", name: "Split Vergleich", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-22",
      travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 38 }],
      tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, detail: { flights: true, stay: true, attractions: true },
      items: [
        { id: "f", cat: "flights", name: "Flug", status: "idea", chosen: "fa", options: [fopt("fa", "Eurowings", 400, "2027-07-22T20:00", { personal: 2, cabin: 2, checked: 0 }), fopt("fb", "Croatia Airlines", 520, "2027-07-22T18:00", { personal: 2, cabin: 2, checked: 2 }, 1)] },
        { id: "s", cat: "stay", name: "Unterkunft in Split", status: "chosen", from: "2027-07-18", to: "2027-07-22", options: [{ id: "so", label: "Hotel Mar", price: { mode: "unit", basis: "stay", currency: "EUR", unit: 600 }, loc: { lat: 43.508, lon: 16.44 } }] },
        { id: "e", cat: "attractions", name: "Bootstour", status: "idea", chosen: "ea", options: [
          { id: "ea", label: "Blaue Grotte", price: { mode: "person", currency: "EUR", adult: 90 }, loc: { lat: 43.06, lon: 16.18 } },
          { id: "eb", label: "Krka-Wasserfälle", price: { mode: "person", currency: "EUR", adult: 60 }, loc: { lat: 43.8, lon: 15.97 } }] }
      ]
    };
    await reloadHome(p, { set: { "rk2-t:c441": C, "rk2-index": [{ id: "c441", name: C.name, place: C.place }], "rk2-current": "c441" } });
    await p.locator(".start .home-trip", { hasText: "Split Vergleich" }).first().click();
    const fc = p.locator("#flights .card", { hasText: "Eurowings" }).locator(".fl-cmp");
    await fc.first().waitFor();
    const fa = await fc.nth(0).innerText(), fb = await fc.nth(1).innerText();
    if (!fa.includes("A") || !fa.includes("🛬") || !fa.includes("Direktflug") || !fa.includes("nur Handgepäck")) fail("Flug A: " + fa);
    if (!fb.includes("1 Umstieg") || !fb.includes("mit Koffer") || !/Reise \+[\d.]+ € p\. P\./.test(fb)) fail("Flug B: " + fb);
    const ec = p.locator("#attractions .card", { hasText: "Bootstour" }).locator(".oc-row");
    await ec.first().waitFor();
    await until(async () => /🛏 Hotel Mar [\d,]+ km/.test(await ec.nth(1).innerText()), "Erlebnis: Entfernung zum Hotel");
    if (!/Reise −[\d.]+ € p\. P\./.test(await ec.nth(1).innerText())) fail("Erlebnis B ganze Reise: " + await ec.nth(1).innerText());
    await ec.nth(1).click();
    await p.locator("#attractions .oc-row.sel", { hasText: "Krka" }).waitFor();
    log("Flüge und Erlebnisse vergleichen: A/B, Hin und Rück, Umstiege, Gepäck, ganze Reise p. P.; Erlebnis mit Entfernung zum Hotel, wählbar");
  }

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  console.log("\nUnterkunftssuche: alles in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
