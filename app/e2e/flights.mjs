/*
 * Flugsuche in der App: Such-Dienst nachgestellt (keine echten Anbieter), Ergebnis übernehmen.
 * Start: npm run test:cloud (nach cloud.mjs und groups.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4175/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
async function until(fn, what, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  fail("Zeitüberschreitung: " + what);
}
const leg = (from, to, dep, arr, min, flights, carriers, route) => ({ from, to, fromCity: from === "DUS" ? "Düsseldorf" : "Split", toCity: to === "SPU" ? "Split" : "Düsseldorf", dep, arr, minutes: min, stops: route.length - 2, route, carriers, flights });
const RESULT = {
  offers: [
    { id: "kiwi:a1", source: "kiwi", sourceName: "Kiwi.com", price: 989, currency: "EUR", url: "https://kiwi.com/u/uqukjx",
      out: leg("DUS", "SPU", "2027-07-18T06:10:00", "2027-07-18T08:05:00", 115, ["EW9958"], ["Eurowings"], ["DUS", "SPU"]),
      back: leg("SPU", "DUS", "2027-07-29T14:25:00", "2027-07-29T16:25:00", 120, ["EW9959"], ["Eurowings"], ["SPU", "DUS"]),
      baggage: { personal: 1, cabin: 0, checked: 0 } },
    { id: "kiwi:a2", source: "kiwi", sourceName: "Kiwi.com", price: 993, currency: "EUR", url: "https://kiwi.com/u/wj8c3z",
      out: leg("DUS", "SPU", "2027-07-18T18:45:00", "2027-07-18T22:50:00", 245, ["OS166", "OS615"], ["Austrian Airlines"], ["DUS", "VIE", "SPU"]),
      back: leg("SPU", "DUS", "2027-07-29T14:25:00", "2027-07-29T16:25:00", 120, ["EW9959"], ["Eurowings"], ["SPU", "DUS"]) }
  ],
  sources: [
    { id: "kiwi", name: "Kiwi.com", configured: true, ok: true, count: 2, ms: 2900 },
    { id: "duffel", name: "Duffel", configured: false, ok: false, count: 0 },
    { id: "travelpayouts", name: "Travelpayouts", configured: false, ok: false, count: 0 }
  ]
};

/** Gepäck (#171): Billigflieger ohne Angabe (wie Travelpayouts) gegen Linie mit 4 Koffern im Preis */
const pmi = (c, f, from = "DUS", to = "PMI", d = "2027-08-12") => ({ ...leg(from, to, `${d}T07:00:00`, `${d}T09:20:00`, 140, [f], [c], [from, to]), fromCity: from, toCity: to });
const BAGS = {
  offers: [
    { id: "tp:fr", source: "travelpayouts", sourceName: "Travelpayouts", price: 400, currency: "EUR", out: pmi("FR", "FR123"), back: pmi("FR", "FR124", "PMI", "DUS", "2027-08-22") },
    { id: "duffel:lh", source: "duffel", sourceName: "Duffel · Lufthansa", price: 560, currency: "EUR", out: pmi("Lufthansa", "LH2"), back: pmi("Lufthansa", "LH3", "PMI", "DUS", "2027-08-22"),
      baggage: { personal: 4, cabin: 4, checked: 4 } }
  ],
  sources: RESULT.sources
};

/** nur Hinflug im Zeitfenster: jeden Tag ein Direktflug, jeder Tag 10 € teurer */
function oneWay(q) {
  const from = q.fromAirports?.[0] || q.from, to = q.toAirports?.[0] || q.to, offers = [];
  for (let d = q.depart, i = 0; d <= q.departTo; d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10), i++)
    offers.push({ id: `kiwi:${from}${to}${d}`, source: "kiwi", sourceName: "Kiwi.com", price: 300 + 10 * i, currency: "EUR", url: `https://kiwi.com/u/${from}${to}`,
      out: { ...leg(from, to, `${d}T10:00:00`, `${d}T20:00:00`, 600, [`XX${i}${from}`], ["Test Air"], q.via ? [from, q.via[0], to] : [from, to]), fromCity: from, toCity: to,
        ...(q.via ? { stops: 1, layovers: [{ at: q.via[0], hours: 20 }] } : {}) } });
  return { offers, sources: RESULT.sources.map(s => (s.id === "kiwi" ? { ...s, count: offers.length } : s)) };
}

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4175", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [];
  await p.route("https://flights.test/flights/search", async r => {
    const body = JSON.parse(r.request().postData());
    asked.push(body);
    await new Promise(res => setTimeout(res, 200));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body.departTo ? oneWay(body) : body.to === "PMI" ? BAGS : RESULT) });
  });
  // Preiskalender (Richtpreise pro Person): drei Tage im März
  const calAsked = [];
  await p.route("https://flights.test/flights/calendar", async r => {
    const q = JSON.parse(r.request().postData());
    calAsked.push(q);
    const days = q.month === "2027-03" ? [{ out: "2027-03-02", price: 210, stops: 1 }, { out: "2027-03-04", price: 180, stops: 0 }, { out: "2027-03-09", price: 260, stops: 0 }] : [];
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ days, configured: true }) });
  });
  for (const f of ["airports.json", "world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  await p.goto(URL);
  await p.locator(".start .home-new").click();
  await p.locator(".modal .newtrip .btn.primary").click();
  // Kopf der neuen Reise: vier Kacheln als Einstieg; „Zu den Flügen“ öffnet die Suche im Kapitel
  const tiles = (await p.locator(".hero .ht-tile b").allInnerTexts()).join("|");
  if (tiles !== "Zu den Flügen|Zu den Hotels|Events & Aktivitäten|Sonstige Kosten") fail("Kacheln im Kopf: " + tiles);
  await p.locator(".hero .ht-fl").click();
  await p.locator(".modal-bg .modal").waitFor();
  await p.locator(".modal-bg .modal .x").click();
  await p.locator(".modal-bg .modal").waitFor({ state: "detached" });
  log("Kopf: Zu den Flügen, Zu den Hotels, Events & Aktivitäten, Sonstige Kosten; Flüge öffnet die Suche");
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  const m = p.locator(".modal");

  // Abflughäfen: Standard 4, zwei abwählen → DUS und NRN
  // Suche im eigenen Fenster (nicht mehr im Kapitel aufgeklappt); Wer, Abflughäfen, Umstiege und Koffer immer sichtbar
  if (await p.locator(".modal.inline").count() || !(await p.locator(".modal-bg .modal").count())) fail("Flugsuche nicht als Fenster");
  if (!(await m.locator(".fs-aps").isVisible()) || !(await m.locator(".fs-who").isVisible()) || !(await m.locator("label", { hasText: "Koffer gesamt" }).isVisible())) fail("Optionen der Flugsuche nicht sichtbar");
  log("Flugsuche als Fenster, Wer, Abflughäfen, Umstiege und Koffer sichtbar");
  const on = await m.locator(".fs-aps .chip.on").allTextContents();
  if (on.length !== 4) fail("Standard-Flughäfen: " + on);
  for (const c of on.slice(2)) await m.locator(".fs-aps .chip", { hasText: c }).click();
  if (!(await m.locator(".fs-form .btn.primary").textContent()).includes("2 Flughäfen vergleichen")) fail("Knopf zählt Flughäfen nicht");

  // flexibler Zeitraum ist Standard: früheste Hinreise, spätestens zuhause am … um …, Nächte per Schieberegler
  if (!(await m.locator(".fs-mode .chip.on").textContent()).includes("Flexibler Zeitraum")) fail("flexibel nicht vorausgewählt");
  await m.locator("label.f", { hasText: "Nach" }).locator("input").fill("SPU");
  await m.locator("label", { hasText: "Früheste Hinreise" }).locator("input").fill("2027-07-15");
  await m.locator("label", { hasText: "Spätestens zuhause am" }).locator("input").fill("2027-07-29");
  await m.locator("label.fs-time input").fill("20:00");
  const setRange = (label, v) => m.locator(`input[type=range][aria-label="${label}"]`).evaluate((el, v) => { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
  await setRange("Reisedauer (Nächte vor Ort): bis", 12);
  await setRange("Reisedauer (Nächte vor Ort): von", 7);
  const dlabel = await m.locator(".dual-head b").textContent();
  if (dlabel !== "7 bis 12 Nächte") fail("Schieberegler: " + dlabel);
  if (!(await m.locator(".dual-axis").textContent()).includes("max. 14 (ganzer Zeitraum)")) fail("Achse: " + await m.locator(".dual-axis").textContent());
  // Koffer insgesamt statt „je Person einer“
  await m.locator("label", { hasText: "Koffer gesamt" }).locator("select").selectOption("1");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  if (asked[0]?.bagCount !== 1) fail("Kofferzahl nicht in der Anfrage: " + JSON.stringify(asked[0]));
  if (asked.length !== 2 || asked.map(a => a.from).join() !== on.slice(0, 2).join()) fail("Anfragen je Flughafen: " + JSON.stringify(asked.map(a => a.from)));
  const a0 = asked[0];
  if (a0.depart !== "2027-07-15" || a0.latest !== "2027-07-29" || a0.nightsMin !== 7 || a0.nightsMax !== 12 || a0.maxStops !== 1 || a0.bags !== true || a0.selfTransfer !== false || a0.ret)
    fail("Anfrage: " + JSON.stringify(a0));
  if (a0.to !== "SPU" || a0.toAirports?.join() !== "SPU" || a0.toCity) fail("Ziel: " + JSON.stringify(a0));
  log(`Flexibel: ${on.slice(0, 2).join(" + ")}, 15.07. bis zuhause 29.07. 20:00, Schieberegler 7–12 Nächte, max. 1 Umstieg, Koffer, ohne Self-Transfer`);

  // Vergleich je Flughafen, Treffer mit Anfahrt, Nächten und „zuhause ca.“
  if ((await m.locator(".fs-cmp tbody tr").count()) !== 2) fail("Vergleichstabelle");
  const res0 = await m.locator(".fs-res").first().textContent();
  if (!res0.includes("11 Nächte vor Ort") || !res0.includes("zuhause ca. Do 29.07.") || !res0.includes("+ Anfahrt")) fail("Treffer: " + res0.slice(0, 300));
  if (!(await m.locator(".fs-res").first().locator(".btn", { hasText: "Hier buchen" }).isDisabled())) fail("Hier buchen sollte ausgegraut sein");
  const src = await m.locator(".fs-src").textContent();
  if (!src.includes("Kiwi.com: 4 Treffer") || !src.includes("Duffel: noch nicht eingerichtet")) fail("Quellen: " + src);
  log("Vergleichstabelle mit 2 Flughäfen, Treffer mit Anfahrt, 11 Nächten und „zuhause ca.“; „Hier buchen“ ausgegraut");

  // zu spät zuhause: um 17:00 fällt alles raus (Landung 16:25 + Heimfahrt + Gepäck)
  await m.locator("label.fs-time input").fill("17:00");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator("p", { hasText: "aussortiert, weil ihr zu spät zuhause wärt" }).waitFor();
  log("Spätestens 17:00 zuhause: Verbindungen mit Landung 16:25 aussortiert");

  // Stadt mit mehreren Flughäfen: Ziel Tokio (alle), dazu Abflug London (alle Londoner Flughäfen)
  const dest = m.locator("label.f", { hasText: "Nach" }).locator("input");
  await dest.fill("Tokio");
  await m.locator(".lp-list li").first().waitFor();
  const first = await m.locator(".lp-list li").first().textContent();
  if (!first.includes("TYO") || !first.includes("HND")) fail("Vorschlag Tokio: " + first);
  await dest.press("Enter");
  if (!(await dest.inputValue()).startsWith("Tokio (alle")) fail("Auswahl Tokio: " + await dest.inputValue());
  if (!(await m.locator(".fs-note").textContent()).includes("HND")) fail("Hinweis alle Flughäfen fehlt");
  const add = m.locator(".fs-add input");
  await add.fill("London");
  await m.locator(".lp-list li", { hasText: "LON" }).first().click();
  const lonChip = m.locator(".fs-aps .chip", { hasText: "LON" });
  if (!(await lonChip.textContent()).includes("London, alle")) fail("Chip London: " + await lonChip.textContent());
  await m.locator("label.fs-time input").fill("20:00");
  const before = asked.length;
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const tq = asked.slice(before);
  const lon = tq.find(x => x.from === "LON"), dus = tq.find(x => x.from !== "LON");
  if (tq.length !== 3 || tq.some(x => x.to !== "TYO" || x.toCityCode !== "TYO" || x.toAirports?.join() !== "HND,NRT")) fail("Anfragen Tokio: " + JSON.stringify(tq));
  if (!lon || lon.fromCityCode !== "LON" || !lon.fromAirports?.includes("LHR") || !lon.fromAirports?.includes("STN")) fail("Abflug London: " + JSON.stringify(lon));
  if (dus.fromAirports?.join() !== dus.from || dus.fromCityCode) fail("Abflug einzelner Flughafen: " + JSON.stringify(dus));
  log("Tokio (alle: HND, NRT) als Ziel und London (alle) als Abflug: Stadt-Code und Flughafenliste gehen an den Such-Dienst");

  // zurück: London abwählen, Ziel wieder Split per Kürzel
  await lonChip.click();
  if (await m.locator(".fs-aps .chip", { hasText: "LON" }).count()) fail("London nicht entfernt");
  await dest.fill("SPU");
  await m.locator(".lp-list li", { hasText: "SPU" }).first().click();
  if (!(await dest.inputValue()).startsWith("SPU · Split")) fail("Auswahl Split: " + await dest.inputValue());

  // wieder 20:00, feste Daten mit ± Tagen prüfen, dann übernehmen
  await m.locator(".fs-mode .chip", { hasText: "Feste Daten" }).click();
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-07-29");
  await m.locator("label", { hasText: "± Tage" }).locator("select").selectOption("2");
  const sky = await m.locator(".fs-direct a", { hasText: "Skyscanner" }).getAttribute("href");
  if (!/\/flights\/[a-z]{3}\/spu\/270718\/270729\//.test(sky)) fail("Skyscanner-Link: " + sky);
  if (!(await m.locator(".fs-direct a", { hasText: "Google Flüge" }).count())) fail("Google-Flüge-Link fehlt");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const f = asked.at(-1);
  if (f.ret !== "2027-07-29" || f.flexDays !== 2 || f.latest) fail("feste Anfrage: " + JSON.stringify(f));
  // Filterleiste: „Direkt“ mit Anzahl und Preis ab, ein zweiter Tipp hebt den Filter auf
  const direct = m.locator(".ff-stops .chip", { hasText: "Direkt" });
  if (!/Direkt\s*2 · ab/.test(await direct.textContent())) fail("Chip Direkt: " + await direct.textContent());
  await direct.click();
  if ((await m.locator(".fs-res").count()) !== 2) fail("Filter direkt (je Flughafen einer)");
  if (!(await m.locator(".fs-res").first().textContent()).includes("Eurowings")) fail("Direktflug fehlt");
  await direct.click();
  if ((await m.locator(".fs-res").count()) !== 4) fail("Filter direkt nicht aufgehoben");
  await m.locator(".chip", { hasText: "Günstigste" }).click();
  await m.locator(".fs-res").nth(0).locator(".btn", { hasText: "Übernehmen" }).click();
  // Übernehmen schließt die Suche und zeigt den Posten
  await m.waitFor({ state: "detached" });
  const card = p.locator("#flights .card[data-item]");
  await card.first().waitFor();
  await until(async () => (await card.first().getAttribute("class")).includes("flash"), "Posten hervorgehoben");
  // zweites Angebot: Suche am Posten erneut öffnen
  await card.first().click();
  await p.locator("#flights .fs-item").first().click();
  if ((await m.locator("label", { hasText: "Hin am" }).locator("input").inputValue()) !== "2027-07-18") fail("Datum beim erneuten Öffnen nicht aus dem Flug");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-cmp .btn", { hasText: "Wählen" }).nth(1).click();
  await m.waitFor({ state: "detached" });
  if ((await card.count()) !== 1) fail("ein Posten erwartet");
  const txt = await card.textContent();
  if (!txt.includes("Eurowings") || !txt.includes("2 Angebote")) fail("Posten: " + txt.slice(0, 200));
  log("Feste Daten ± 2 Tage; zwei Treffer übernommen (Liste und „Wählen“ in der Tabelle): ein Flug-Posten mit 2 Angeboten");
  // Kopf: Flug-Kachel mit Kurzfassung des Postens, Klick scrollt zum Posten
  await p.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  const flLine = await p.locator(".hero .ht-fl .ht-line").first().innerText();
  if (!/→/.test(flLine) || !/€/.test(flLine)) fail("Flug-Kachel ohne Strecke und Preis: " + flLine);
  await p.locator(".hero .ht-fl").click();
  await until(() => p.locator("#flights [data-item]").first().evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }), "zum Flug-Posten gescrollt");
  log("Kopf: Flug-Kachel zeigt " + flLine.replace(/\s+/g, " ") + ", Klick scrollt zum Posten");

  // wie im Artefakt: je Familie suchen und buchen (eigene Flughäfen, eigene Anfahrt, eigener Flug-Posten)
  const TWO = {
    id: "k2", name: "Split", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-29",
    travelers: [{ id: "a", name: "Anna", age: 41, household: "Klein" }, { id: "c", name: "Mia", age: 8, household: "Klein" },
      { id: "h", name: "Hanna", age: 38, household: "Hase" }, { id: "i", name: "Ida", age: 5, household: "Hase" }, { id: "j", name: "Jan", age: 40, household: "Hase" }],
    households: { Klein: { plz: "40210", geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" }, mode: "car" }, Hase: { plz: "80331", geo: { lat: 48.14, lon: 11.58, ort: "München" }, mode: "car" } },
    items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 }, kmCost: 0.3 }
  };
  await p.waitForTimeout(600); // App hat fertig gespeichert (sonst überschreibt sie beim Neuladen den eingespielten Stand)
  await p.evaluate(t => { localStorage.removeItem("rk-flight-search"); localStorage.setItem("rk2-t:k2", JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: "k2", name: t.name, place: t.place }])); localStorage.setItem("rk2-current", "k2"); }, TWO);
  await p.reload();
  await p.locator(".start .home-trip").first().click();
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  if (!(await m.locator(".fs-who .chip.on", { hasText: "Klein (2)" }).count())) fail("Vorschlag erste Familie ohne Flug fehlt");
  const kAps = await m.locator(".fs-aps .chip.on").allTextContents();
  if (!kAps.includes("DUS") || kAps.includes("MUC")) fail("Flughäfen nicht zum Wohnort von Klein: " + kAps);
  if (!(await m.locator("p", { hasText: "1 Erw. · 1 Kind (Klein)" }).count())) fail("Personen für Klein: " + await m.locator(".fs-form p.muted").last().textContent());
  // Ziel aus der Reise: Split → Flughafen SPU; Auswahlliste bietet alle Flughäfen im Umkreis und jeden einzeln mit Entfernung
  const kDest = m.locator("label.f", { hasText: "Nach" }).locator("input");
  for (let i = 0; i < 50 && !(await kDest.inputValue()).startsWith("SPU"); i++) await p.waitForTimeout(100);
  if (!(await kDest.inputValue()).startsWith("SPU · Split")) fail("Ziel aus der Reise: " + await kDest.inputValue());
  await m.locator(".lp:not(.fs-add) .lp-btn").click();
  await m.locator(".lp-list li").first().waitFor();
  const opts = await m.locator(".lp-list li").allTextContents();
  if (!opts[0]?.includes("Alle Flughäfen im Umkreis von Split") || !opts[0].includes("BWK") || !opts.some(o => /SPU.*km/.test(o))) fail("Vorschläge Umkreis: " + JSON.stringify(opts.slice(0, 4)));
  await m.locator(".lp-list li").first().click();
  if (!(await kDest.inputValue()).startsWith("Umkreis Split: SPU")) fail("Auswahl Umkreis: " + await kDest.inputValue());
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const k = asked.at(-1);
  if (!k.toAirports?.includes("SPU") || !k.toAirports.includes("BWK") || k.toCityCode) fail("Anfrage Umkreis: " + JSON.stringify(k));
  log(`Auswahlliste „Nach“: Umkreis Split gewählt, ${k.toAirports.join(", ")} gehen als Liste an den Such-Dienst`);
  if (k.adults !== 1 || k.children !== 1 || k.infants !== 0) fail("Anfrage nur für Klein: " + JSON.stringify(k));
  await m.locator(".fs-res").first().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  const kc = p.locator("#flights .card[data-item]", { hasText: "Klein · 2 Pers." });
  await kc.waitFor();
  log("Je Familie: Vorschlag Klein (1 Erw., 1 Kind, ab DUS), gesucht nur für Klein, Posten „Flug Klein“");

  // nochmal: jetzt ist Hase dran, mit Flughäfen bei München
  await p.locator("#flights .fs-open").click();
  if (!(await m.locator(".fs-who .chip.on", { hasText: "Hase (3)" }).count())) fail("Vorschlag Hase fehlt");
  if (!(await m.locator(".fs-who .chip", { hasText: "Klein (2)" }).locator("small", { hasText: "hat Flug" }).count())) fail("Klein nicht als versorgt markiert");
  const hAps = await m.locator(".fs-aps .chip.on").allTextContents();
  if (!hAps.includes("MUC") || hAps.includes("DUS")) fail("Flughäfen nicht zum Wohnort von Hase: " + hAps);
  // eine Person herausnehmen: Jan fliegt separat
  await m.locator(".fs-who summary").click();
  await m.locator(".fs-who .chip", { hasText: "Jan" }).click();
  // (die nachgestellten Treffer starten alle in DUS: von München aus wären sie „zu spät zuhause“, darum feste Daten)
  await m.locator(".fs-mode .chip", { hasText: "Feste Daten" }).click();
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-07-29");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const h = asked.at(-1);
  if (h.adults !== 1 || h.children !== 1) fail("Anfrage Hase ohne Jan: " + JSON.stringify(h));
  // zusammen ankommen: Abstand zur Landung von Klein an jedem Treffer, Filter ± Stunden
  const sync = await m.locator(".fs-res .fs-sync").allTextContents();
  if (!sync.length || !sync.every(x => x.includes("Klein"))) fail("Landung im Vergleich zu Klein fehlt: " + sync);
  const tg = m.locator(".ff-together .chip").first();
  if (!(await m.locator(".ff-together").textContent()).includes("Zusammen ankommen mit Klein")) fail("Filter zusammen ankommen fehlt");
  const nAll = await m.locator(".fs-res").count();
  await tg.click();
  const nTg = await m.locator(".fs-res").count();
  if (!(nTg > 0 && nTg < nAll) || (await m.locator(".fs-res .fs-sync:not(.near)").count())) fail(`zusammen ankommen filtert nicht: ${nAll} → ${nTg}`);
  log(`Zusammen ankommen: Treffer zeigen „${sync[0]}“, ${(await tg.textContent()).trim()} lässt ${nTg} von ${nAll}`);
  await m.locator(".fs-res").first().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  await p.locator("#flights .card[data-item]", { hasText: "Hase · 2 Pers." }).waitFor();
  log("Hase als Nächstes vorgeschlagen (ab MUC), Jan einzeln abgewählt: Posten „Flug Hase“ für Hanna und Ida");

  // Hinweis im Flug-Kapitel: Jan hat noch keinen Flug; „Flug für sie suchen“ öffnet die Suche nur für ihn
  const miss = p.locator("#flights .miss-travel");
  await miss.waitFor();
  const mt = await miss.innerText();
  if (!mt.includes("Jan") || mt.includes("Hanna")) fail("Hinweis ohne Flug: " + mt);
  await miss.locator(".miss-search").click();
  await m.locator(".fs-who summary").click();
  const onNames = await m.locator(".fs-who .chip.sm.on").allTextContents();
  if (onNames.length !== 1 || !onNames[0].includes("Jan")) fail("Suche nicht nur für Jan: " + onNames);
  if (!(await m.locator(".fs-who .chip.sm", { hasText: "Hanna" }).locator(".fs-has").count())) fail("Hanna nicht als „hat Flug“ markiert");
  await p.keyboard.press("Escape");
  log("Hinweis „Noch ohne Flug oder Anreise: Jan“, Suche daraus nur für Jan, Personen mit Flug markiert");

  // Suche aus dem Posten: gilt für dessen Personen, Treffer kommen dazu
  await kc.click();
  await p.locator(".fs-item").click();
  if (!(await m.locator(".modal-h h3", { hasText: "Flüge suchen: Flug Klein" }).count())) fail("Suche aus dem Posten");
  if (!(await m.locator(".fs-who .chip.on", { hasText: "Klein (2)" }).count())) fail("Posten-Personen nicht übernommen");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").nth(1).locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  if (!(await kc.textContent()).includes("2 Angebote")) fail("Treffer nicht im Posten Klein");
  log("Suche aus „Flug Klein“: gleiche Personen, Treffer als zweites Angebot im Posten");

  // wie im Artefakt: Hase fliegt mit Klein mit („Wie Flug Klein“), danach Vergleich mit einem eigenen Flug
  await p.waitForTimeout(600); // App hat fertig gespeichert (sonst überschreibt sie beim Neuladen den eingespielten Stand)
  await p.evaluate(t => { localStorage.setItem("rk-flight-search", JSON.stringify({ mode: "fixed" })); localStorage.setItem("rk2-t:k2", JSON.stringify(t)); }, TWO);
  await p.reload();
  await p.locator(".start .home-trip").first().click();
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-07-29");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  await p.locator("#flights .fs-open").click();
  if (!(await m.locator(".fs-who .chip.on", { hasText: "Hase (3)" }).count())) fail("Vorschlag Hase fehlt (Mitfliegen)");
  await m.locator(".fs-along .chip", { hasText: "Wie Flug Klein" }).click();
  const along = p.locator("#flights .card[data-item]", { hasText: "Hase · 3 Pers. · wie Flug Klein" });
  await along.waitFor();
  const at = await along.textContent();
  if (!at.includes("DUS") || !at.includes("Hase:")) fail("Mitflug-Karte: " + at.slice(0, 300));
  // Anwesenheit von Hase folgt dem Flug von Klein
  if (await p.locator("#stay .pl-notes li", { hasText: "Hase: Anwesenheit offen" }).count()) fail("Anwesenheit Hase folgt dem Flug nicht");
  log("Mitfliegen: „Flug Hase“ wie Flug Klein (ab DUS, eigene Anfahrt), Anwesenheit folgt");

  await along.click();
  if (!(await p.locator(".editor .chip.on", { hasText: "Wie Flug Klein" }).count())) fail("Editor zeigt Mitfliegen nicht");
  await p.locator(".editor .fs-item", { hasText: "Eigenen Flug suchen" }).click();
  if (!(await m.locator("p", { hasText: "Bisher: mitfliegen wie „Flug Klein“" }).count())) fail("Vergleich zum Mitfliegen fehlt");
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-07-29");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  if (!(await m.locator(".fs-res .st-diff", { hasText: "als mitfliegen" }).count())) fail("Treffer ohne Vergleich zum Mitfliegen");
  await m.locator(".fs-res").first().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  await p.locator("#flights .card[data-item]", { hasText: "Hase · 3 Pers." }).waitFor();
  if (await p.locator("#flights .card[data-item]", { hasText: "wie Flug Klein" }).count()) fail("fliegt nach Übernehmen noch mit");
  log("Eigenen Flug gesucht: Treffer mit „günstiger/teurer als mitfliegen“, übernommen → Hase fliegt selbst");

  // nur Hinflug mit Zeitfenster (z. B. erst mal nach Rio)
  await p.locator("#flights .fs-open").click();
  await m.locator(".fs-kind .chip", { hasText: "Nur Hinflug" }).click();
  await m.locator(".fs-mode .chip", { hasText: "Flexibler Zeitraum" }).click();
  const nach = m.locator("label.f", { hasText: "Nach" }).locator("input");
  await nach.fill("GIG");
  await m.locator(".lp-list li", { hasText: "GIG" }).first().click();
  await m.locator("label", { hasText: "Früheste Abreise" }).locator("input").fill("2027-03-01");
  await m.locator("label", { hasText: "Späteste Abreise" }).locator("input").fill("2027-03-05");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const ow = asked.at(-1);
  if (ow.departTo !== "2027-03-05" || ow.depart !== "2027-03-01" || ow.ret || ow.latest || ow.to !== "GIG") fail("Anfrage nur Hinflug: " + JSON.stringify(ow));
  if (await m.locator(".fs-res .fs-leg", { hasText: "Rück" }).count()) fail("nur Hinflug zeigt Rückflug");
  log("Nur Hinflug: nach GIG, Abflug irgendwann 01.03. bis 05.03., ohne Rückflug");
  // Preiskalender: je Tag der günstigste Preis und die Umstiege, günstig grün, teuer rot; Tipp zeigt nur diesen Tag
  const days = m.locator(".pcal .pcal-d:not(.off)");
  if ((await days.count()) !== 5) fail("Kalender: " + await days.count() + " Tage");
  if (!(await days.first().getAttribute("class")).includes("t0") || !(await days.last().getAttribute("class")).includes("t2")) fail("Kalender-Farben");
  if (!(await days.first().textContent()).includes("(0)")) fail("Kalender ohne Umstiege: " + await days.first().textContent());
  const all = await m.locator(".fs-res").count();
  await days.nth(2).click();
  await until(async () => (await m.locator(".fs-res").count()) === all / 5, "nur Flüge am 03.03.");
  if (!(await m.locator(".fs-res").first().textContent()).includes("03.03")) fail("Flug nicht am 03.03.: " + await m.locator(".fs-res").first().textContent());
  await days.nth(2).click();
  await until(async () => (await m.locator(".fs-res").count()) === all, "Kalender aufgehoben");
  log(`Preiskalender: 5 Tage von grün bis rot mit Umstiegen, Tipp auf den 03.03. zeigt ${all / 5} Flüge, zweiter Tipp alle`);
  // Preiskalender vor der Suche: Richtpreise für den Monat, Tipp auf einen Tag sucht genau diesen Tag
  await m.locator(".rc > summary").click();
  const rcDays = m.locator(".rc .pcal-d:not(.off)");
  await until(async () => (await rcDays.count()) === 3, "Richtpreise im Kalender");
  const cq = calAsked.at(-1);
  if (cq.month !== "2027-03" || !cq.oneWay || cq.to.join() !== "GIG" || !cq.from.length) fail("Kalender-Anfrage: " + JSON.stringify(cq));
  if (!(await rcDays.nth(1).getAttribute("class")).includes("t0")) fail("günstigster Richtpreis nicht grün");
  await m.locator(".rc .rc-nav .btn", { hasText: "›" }).click();
  await until(async () => calAsked.at(-1).month === "2027-04", "nächster Monat");
  await m.locator(".rc").locator("text=noch keine Richtpreise").waitFor();
  await m.locator(".rc .rc-nav .btn", { hasText: "‹" }).click();
  await until(async () => (await rcDays.count()) === 3, "zurück im März");
  const nAsk = asked.length;
  await rcDays.nth(1).click();
  await until(async () => asked.length > nAsk, "Suche nach Tipp im Kalender");
  const calQ = asked.at(-1);
  if (calQ.depart !== "2027-03-04" || calQ.departTo || calQ.ret || calQ.flexDays) fail("Suche aus dem Kalender: " + JSON.stringify(calQ));
  if (!(await m.locator(".fs-mode .chip.on").textContent()).includes("Feste Daten")) fail("Kalender stellt nicht auf feste Daten");
  await m.locator(".fs-res").first().waitFor();
  log("Preiskalender vor der Suche: Richtpreise März (180 € grün), Monat vor und zurück, Tipp auf den 04.03. sucht genau diesen Tag");

  // Rundreise: DUS → Rio (5–7 Nächte) → Buenos Aires (3–4 Nächte) → zurück
  await m.locator(".fs-kind .chip", { hasText: "Rundreise" }).click();
  await m.locator("label", { hasText: "Abflug frühestens" }).locator("input").fill("2027-03-01");
  await m.locator("label", { hasText: "spätestens" }).locator("input").first().fill("2027-03-03");
  const st1 = m.locator(".fs-station").nth(0);
  if (!(await st1.locator("input").first().inputValue()).startsWith("GIG")) fail("erste Station übernimmt das Ziel nicht: " + await st1.locator("input").first().inputValue());
  await st1.locator("label", { hasText: "Nächte von" }).locator("input").fill("5");
  await st1.locator("label", { hasText: "bis" }).last().locator("input").fill("7");
  await m.locator(".fs-addst").click();
  const st2 = m.locator(".fs-station").nth(1);
  await st2.locator("input").first().fill("EZE");
  await m.locator(".lp-list li", { hasText: "EZE" }).first().click();
  await st2.locator("label", { hasText: "Nächte von" }).locator("input").fill("3");
  await st2.locator("label", { hasText: "bis" }).last().locator("input").fill("4");
  const before2 = asked.length;
  await m.locator(".fs-form .btn.primary", { hasText: "Rundreise suchen" }).click();
  await m.locator(".fs-round").first().waitFor();
  const rq = asked.slice(before2);
  if (rq[0].to !== "GIG" || rq[0].departTo !== "2027-03-03" || rq[0].fromAirports?.length < 1) fail("1. Strecke: " + JSON.stringify(rq[0]));
  if (!rq.some(x => x.from === "GIG" && x.to === "EZE" && x.depart === "2027-03-06" && x.departTo === "2027-03-08")) fail("2. Strecke: " + JSON.stringify(rq.map(x => [x.from, x.to, x.depart, x.departTo])));
  if (!rq.some(x => x.from === "EZE" && x.toAirports?.includes("DUS"))) fail("Rückflug nach Hause fehlt");
  const r0 = await m.locator(".fs-round").first().textContent();
  if (!r0.includes("3 Tickets") || !r0.includes("GIG: 5 Nächte") || !r0.includes("EZE: 3 Nächte")) fail("Rundreise-Treffer: " + r0.slice(0, 300));
  if ((await m.locator(".fs-round").first().locator(".fs-leg").count()) !== 3) fail("drei Flüge erwartet");
  // Andere Flüge für die letzte Strecke: 3–4 Nächte in EZE, günstigste zuerst; Tausch rechnet den Preis neu
  const rcard = m.locator(".fs-round").first();
  const flightsOf = async c => Number((await c.locator(".fs-sub").textContent()).match(/Flüge ([\d.]+) €/)[1].replace(/\./g, ""));
  const price0 = await flightsOf(rcard);
  await rcard.locator(".fs-altbtn").last().click();
  const alts = rcard.locator(".fs-alt");
  if ((await alts.count()) < 1) fail("keine anderen Flüge für die letzte Strecke");
  const delta = await alts.first().locator(".fs-alt-r b").textContent();
  await alts.first().locator(".btn", { hasText: "Diesen nehmen" }).click();
  const card2 = m.locator(".fs-round", { hasText: "Strecke 3 getauscht" });
  await card2.waitFor();
  const price1 = await flightsOf(card2);
  if (price1 - price0 !== Number(delta.replace("−", "-").replace(/[^\d-]/g, ""))) fail(`Flugpreis nach Tausch: ${price0} ${delta} → ${price1}`);
  if (!(await card2.textContent()).includes("EZE: 4 Nächte")) fail("Nächte nach Tausch: " + (await card2.textContent()).slice(0, 200));
  log(`Andere Flüge: letzte Strecke getauscht (${delta}), Flüge ${price0} € → ${price1} €, EZE jetzt 4 Nächte`);
  await card2.locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  const rc = p.locator("#flights .card[data-item]", { hasText: "GIG → EZE" });
  await rc.waitFor();
  log("Rundreise: DUS → GIG (5 Nächte) → EZE → zurück, Strecke für Strecke gesucht, als ein Posten mit 3 Flügen übernommen");

  // kurzer Aufenthalt (0–1 Nacht in Rio): zusätzlich als Gabelflug, ein Ticket DUS → EZE mit langem Umstieg in GIG
  await p.locator("#flights .fs-open").click();
  await m.locator(".fs-kind .chip", { hasText: "Rundreise" }).click();
  await m.locator("label", { hasText: "Abflug frühestens" }).locator("input").fill("2027-03-01");
  await m.locator("label", { hasText: "spätestens" }).locator("input").first().fill("2027-03-03");
  const s1 = m.locator(".fs-station").nth(0);
  await s1.locator("input").first().fill("GIG");
  await m.locator(".lp-list li", { hasText: "GIG" }).first().click();
  await s1.locator("label", { hasText: "Nächte von" }).locator("input").fill("0");
  await s1.locator("label", { hasText: "bis" }).last().locator("input").fill("1");
  if (!(await m.locator(".fs-short").count())) fail("Hinweis Gabelflug fehlt");
  await m.locator(".fs-addst").click();
  const s2 = m.locator(".fs-station").nth(1);
  await s2.locator("input").first().fill("EZE");
  await m.locator(".lp-list li", { hasText: "EZE" }).first().click();
  await s2.locator("label", { hasText: "Nächte von" }).locator("input").fill("3");
  await s2.locator("label", { hasText: "bis" }).last().locator("input").fill("4");
  const before3 = asked.length;
  await m.locator(".fs-form .btn.primary", { hasText: "Rundreise suchen" }).click();
  await m.locator(".fs-round").first().waitFor();
  await m.locator(".fs-form .btn.primary", { hasText: "Rundreise suchen" }).waitFor();
  const vq = asked.slice(before3).find(x => x.via);
  if (!vq || vq.to !== "EZE" || vq.via.join() !== "GIG" || vq.viaHours.join() !== "4,48") fail("Anfrage Gabelflug: " + JSON.stringify(asked.slice(before3).map(x => [x.from, x.to, x.via])));
  const g0 = await m.locator(".fs-round").first().textContent();
  if (!g0.includes("2 Tickets") || !g0.includes("GIG: 20 h Umstieg") || !g0.includes("EZE: 3 Nächte")) fail("Gabelflug-Treffer: " + g0.slice(0, 300));
  if (!(await m.locator(".fs-round", { hasText: "3 Tickets" }).count())) fail("getrennte Flüge fehlen neben dem Gabelflug");
  await p.keyboard.press("Escape");
  log("Kurzer Aufenthalt in GIG (0–1 Nacht): auch als Gabelflug DUS → EZE mit 20 h Umstieg gesucht, günstigster Treffer mit 2 statt 3 Tickets");

  // Vorlieben: 0 Umstiege vorbelegt, Kroatien gesperrt → an den Such-Dienst und Treffer dorthin ausgeblendet
  await p.waitForTimeout(600);
  await p.evaluate(t => {
    localStorage.setItem("rk-flight-search", JSON.stringify({ mode: "fixed" }));
    localStorage.setItem("rk2-t:k2", JSON.stringify(t));
    localStorage.setItem("rk2-dir", JSON.stringify({ people: [], groups: [], prefs: { maxStops: 0, avoid: ["HR"] } }));
  }, TWO);
  await p.reload();
  await p.locator(".start .home-trip").first().click();
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  if ((await m.locator("label", { hasText: "Umstiege max." }).locator("select").inputValue()) !== "0") fail("Umstiege nicht aus den Vorlieben");
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-07-29");
  const beforeP = asked.length;
  await m.locator(".fs-form .btn.primary").click();
  await m.locator("p", { hasText: "über gesperrte Länder ausgeblendet" }).waitFor();
  const qp = asked.slice(beforeP)[0];
  if (qp.maxStops !== 0 || qp.avoidCountries?.join() !== "HR") fail("Vorlieben nicht an den Such-Dienst: " + JSON.stringify(qp));
  if (await m.locator(".fs-res").count()) fail("Flüge nach Kroatien nicht ausgeblendet");
  await p.keyboard.press("Escape");
  log("Vorlieben: 0 Umstiege vorbelegt, Kroatien gesperrt → an den Such-Dienst, Treffer nach Split ausgeblendet mit Hinweis");

  // Gepäck (#171): ohne Vorliebe ab 5 Reisetagen mit Koffern; Billigflieger ohne Koffer rutscht mit Gepäck hinter die Linie
  const FAM = { id: "kb", name: "Mallorca", place: "Mallorca", country: "Spanien", from: "2027-08-12", to: "2027-08-22",
    travelers: [{ id: "a", name: "Anna", age: 41, household: "Klein" }, { id: "b", name: "Ben", age: 43, household: "Klein" }, { id: "c", name: "Mia", age: 8, household: "Klein" }, { id: "d", name: "Tom", age: 5, household: "Klein" }],
    households: { Klein: { plz: "40210", geo: { lat: 51.23, lon: 6.78, ort: "Düsseldorf" }, mode: "car" } },
    items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 }, kmCost: 0.3 } };
  await p.waitForTimeout(600);
  await p.evaluate(t => {
    localStorage.setItem("rk-flight-search", JSON.stringify({ mode: "fixed" }));
    localStorage.setItem("rk2-dir", JSON.stringify({ people: [], groups: [], prefs: {} }));
    localStorage.setItem("rk2-t:kb", JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: "kb", name: t.name, place: t.place }])); localStorage.setItem("rk2-current", "kb");
  }, FAM);
  await p.reload();
  await p.locator(".start .home-trip").first().click();
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  const bagSel = m.locator("label", { hasText: "Koffer gesamt" }).locator("select");
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-08-12");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-08-14");
  if ((await bagSel.inputValue()) !== "0") fail("3 Reisetage ohne Vorliebe: Koffer " + await bagSel.inputValue());
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-08-22");
  if ((await bagSel.inputValue()) !== "4") fail("11 Reisetage ohne Vorliebe: Koffer " + await bagSel.inputValue());
  const pmiIn = m.locator("label.f", { hasText: "Nach" }).locator("input");
  await pmiIn.fill("PMI");
  await m.locator(".lp-list li", { hasText: "PMI" }).first().click();
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const firstRes = await m.locator(".fs-res").first().textContent();
  if (!firstRes.includes("Lufthansa") || !firstRes.includes("4 Koffer inklusive")) fail("Linie mit Koffern nicht vorn: " + firstRes.slice(0, 300));
  const fr = m.locator(".fs-res", { hasText: "Travelpayouts" }).first();
  const frText = await fr.textContent();
  if (!frText.includes("+ ca. 320 € Koffer") || frText.includes("Sitzplätze")) fail("Billigflieger ohne Koffer (Kinder sitzen bei Ryanair gratis bei den Eltern): " + frText.slice(0, 300));
  if (!/früh einchecken/i.test(await m.locator(".fs-tip").textContent())) fail("Tipp Sitzplätze fehlt");
  if (!(await m.locator("p", { hasText: "inkl. 4 Koffer" }).count())) fail("Sortierhinweis mit Koffern fehlt");
  await fr.locator(".btn", { hasText: "Übernehmen" }).click();
  const xc = p.locator("#flights .xc").first();
  await until(async () => (await xc.count()) > 0, "Nebenkosten am Flug");
  await xc.locator("summary").click();
  const xt = await xc.textContent();
  if (!xt.includes("4 Koffer dazubuchen") || !xt.includes("bei der Buchung") || !xt.includes("Ryanair") || !xt.includes("Gepäck nicht angegeben") || !xt.includes("Früh einchecken"))
    fail("Flug-Posten Nebenkosten: " + xt.slice(0, 400));
  log("Gepäck: ohne Vorliebe 3 Tage ohne, 11 Tage mit 4 Koffern; Ryanair 400 € + ca. 320 € Koffer (Kinder gratis bei den Eltern) hinter Lufthansa 560 € mit Koffern; übernommen mit Nebenkosten, „nicht angegeben“ und Check-in-Tipp");

  // ohne Wohnort: Abflughäfen aus dem ungefähren Ort der Verbindung (/where), sonst große Flughäfen des Landes
  const TRIP0 = { id: "wo", name: "Lissabon", place: "Lissabon", country: "Portugal", from: "2027-05-14", to: "2027-05-18",
    travelers: [{ id: "a", name: "Anna", household: "Klein" }], items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {} };
  for (const [where, expect, text, plz] of [
    [{ cc: "DE", lat: 53.6, lon: 10, city: "Hamburg" }, "HAM", "in der Nähe von Hamburg", true],
    [{ cc: "AT" }, "VIE", "Große Flughäfen in Österreich", false]
  ]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
    await ctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, TRIP0);
    const q = await ctx.newPage();
    q.on("pageerror", e => errors.push(e.message));
    for (const f of ["airports.json", "world.json", "packs.json"]) await q.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
    await q.route("https://flights.test/where", r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(where) }));
    await q.goto(URL);
    await q.locator(".start .home-trip", { hasText: "Lissabon" }).click();
    await q.locator("#flights .fs-open").click();
    const qm = q.locator(".modal-bg .modal");
    await until(async () => (await qm.locator(".fs-aps .chip.on").allInnerTexts())[0] === expect, `Abflughafen ${expect} zuerst`);
    const hint = await qm.locator(".fs-nohome").innerText();
    if (!hint.includes(text) || (await qm.locator(".fs-nohome .fs-plz").count() > 0) !== plz) fail("Hinweis ohne Wohnort: " + hint);
    await ctx.close();
  }
  log("Ohne Wohnort: Hamburg aus der Verbindung → HAM zuerst mit Hinweis und PLZ-Feld; nur Österreich bekannt → VIE, Hinweis auf große Flughäfen, ohne PLZ");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
