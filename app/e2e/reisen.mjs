/*
 * Gruppenreisen-Szenarien (aus Live-Tests gegen die echten Anbieter, hier mit nachgestelltem Such-Dienst):
 * Japan-Großfamilie mit Leuten, die später dazustoßen (eigene Daten, Zeitabschnitte, „alle zusammen“, Ausweichen bei
 * keiner Ferienwohnung für 9, Touren in Hakone), Ozeanien-Rundreise (Strecke nur mit 2 Umstiegen, Reisezeitraum folgt
 * den Flügen), Kalifornien mit Mietwagen (Einwegmiete, 2 Autos) und unplausible Flugpreise.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4179/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };

const settings = { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 };
const base = { tiers: {}, settings, households: {} };
const geo = { Köln: { plz: "50667", geo: { ort: "Köln", lat: 50.94, lon: 6.96 } }, München: { plz: "80331", geo: { ort: "München", lat: 48.14, lon: 11.58 } }, Hamburg: { plz: "20095", geo: { ort: "Hamburg", lat: 53.55, lon: 10.0 } } };
const L = (dir, from, to, dep, arr, toCity) => ({ dir, from, to, dep, arr, carrier: "Sun Air", stops: 1, ...(toCity ? { toCity } : {}) });
const flight = (id, who, legs) => ({ id, cat: "flights", name: "Flug " + id, status: "chosen", participants: who, options: [{ id: id + "o", label: "Sun Air", price: { mode: "unit", currency: "EUR", unit: 1000 }, legs }] });
const fam = (h, ages) => ages.map((a, i) => ({ id: h + i, name: `${h} ${i + 1}`, household: h, age: a }));

const TRIPS = [
  // Klein vier Wochen, Oma & Opa ab der zweiten Woche, Onkel Jens die letzten zwei Wochen (noch ohne Flug, eigene Daten)
  { id: "jp", name: "Japan Großfamilie", place: "Tokio", country: "Japan", from: "2027-04-01", to: "2027-04-29", ...base,
    travelers: [...fam("Klein", [41, 39, 10, 7, 3]), { id: "o1", name: "Gerda", household: "Oma & Opa", age: 68 }, { id: "o2", name: "Heinz", household: "Oma & Opa", age: 71 }, { id: "j", name: "Jens", household: "Onkel Jens", age: 45 }],
    households: { Klein: geo.Köln, "Oma & Opa": geo.München, "Onkel Jens": { ...geo.Hamburg, arrive: "2027-04-15", depart: "2027-04-28" } },
    items: [
      flight("k", ["Klein0", "Klein1", "Klein2", "Klein3", "Klein4"], [L("out", "FRA", "HND", "2027-04-01T13:00", "2027-04-02T09:00", "Tokio"), L("back", "HND", "FRA", "2027-04-28T11:00", "2027-04-28T18:00")]),
      flight("o", ["o1", "o2"], [L("out", "MUC", "HND", "2027-04-07T13:00", "2027-04-08T09:00", "Tokio"), L("back", "HND", "MUC", "2027-04-28T11:00", "2027-04-28T18:00")])
    ] },
  // Mannschaftsfahrt: 4 Spieler als eine Gruppe „Biber“, dazu Trainer-Familie mit Kind
  { id: "team", name: "Mannschaftsfahrt", place: "Palma", country: "Spanien", from: "2027-05-27", to: "2027-05-30", ...base,
    travelers: [...["Ali", "Ben", "Cem", "Dan"].map(n => ({ id: n, name: n, household: "Biber" })), { id: "tm", name: "Tina", household: "Trainer", age: 40 }, { id: "tp", name: "Tom", household: "Trainer", age: 42 }, { id: "tk", name: "Kim", household: "Trainer", age: 9 }],
    items: [] },
  { id: "oz", name: "Ozeanien", place: "Sydney", country: "Australien", from: "2027-02-01", to: "2027-03-07", ...base, travelers: fam("Paar", [34, 33]), households: { Paar: geo.München }, items: [] },
  { id: "ca", name: "Kalifornien", place: "San Francisco", country: "USA", from: "2027-08-01", to: "2027-08-22", ...base,
    travelers: [...fam("Klein", [42, 40, 12, 9]), ...fam("Hase", [38, 37, 5])], households: { Klein: geo.Köln, Hase: geo.Hamburg },
    items: [{ id: "r", cat: "flights", name: "Rundreise", status: "chosen", options: [{ id: "ro", label: "", price: { mode: "unit", currency: "EUR", unit: 9000 },
      legs: [L("out", "DUS", "SFO", "2027-08-20T10:25", "2027-08-20T15:50", "San Francisco"), L("via", "SFO", "LAX", "2027-08-25T06:00", "2027-08-25T07:32", "Los Angeles"), L("via", "LAX", "SAN", "2027-08-30T06:00", "2027-08-30T07:00", "San Diego"), L("back", "SAN", "DUS", "2027-09-02T17:15", "2027-09-03T12:40")] }] }] }
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
    localStorage.setItem("rk2-index", JSON.stringify(trips.map(t => ({ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: t.travelers.length }))));
  }, TRIPS);
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  for (const f of ["airports.json", "world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  const json = (r, body) => r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  const asked = { flights: [], stays: [], tours: [] };

  // Flüge: je Tag im Fenster ein Flug; Fidschi → München nur mit 2 Umstiegen; Los Angeles → San Diego zum Fehlerpreis
  const leg = (from, to, dep, minutes) => ({ from, to, dep: `${dep}T10:00:00`, arr: `${dep}T${String(10 + Math.min(13, Math.round(minutes / 60))).padStart(2, "0")}:00:00`, minutes, stops: 1, route: [from, "XXX", to], carriers: ["Sun Air"], flights: ["SA1"] });
  await p.route("https://flights.test/flights/search", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const q = JSON.parse(r.request().postData());
    asked.flights.push(q);
    const from = q.fromAirports?.[0] || q.from, to = q.toAirports?.[0] || q.to;
    if (from === "NAN" && (q.maxStops ?? 2) < 2) return json(r, { offers: [], sources: [{ id: "kiwi", name: "Kiwi.com", configured: true, ok: true, count: 0 }] });
    const days = []; for (let d = q.depart; d <= (q.departTo || q.depart); d = new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10)) days.push(d);
    const pax = (q.adults || 0) + (q.children || 0);
    const offers = days.map((d, i) => ({ id: `${from}${to}${d}`, source: "kiwi", sourceName: "Kiwi.com", price: (from === "LAX" ? 8117 : 300 + 10 * i) * pax, currency: "EUR", url: "https://kiwi.test", out: leg(from, to, d, from === "LAX" ? 60 : 600) }));
    if (from === "LAX") offers.push({ ...offers[0], id: "ok", price: 90 * pax });
    return json(r, { offers, sources: [{ id: "kiwi", name: "Kiwi.com", configured: true, ok: true, count: offers.length }] });
  });
  // Unterkünfte: keine Ferienwohnung für mehr als 6 Gäste (wie Tokio live)
  await p.route("https://flights.test/stays/search", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const q = JSON.parse(r.request().postData());
    asked.stays.push(q);
    const n = q.adults + q.childAges.length;
    const offers = q.type === "whole" && n > 6 ? [] : [{ id: "h" + n, source: "trivago", sourceName: "Trivago", name: `Haus für ${n}`, total: 200 * n, currency: "EUR", score: 9, capacity: n }];
    return json(r, { offers, sources: [] });
  });
  await p.route("https://flights.test/activities/search", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    const q = JSON.parse(r.request().postData());
    asked.tours.push(q);
    return json(r, { activities: [{ id: "t-" + q.place, source: "viator", sourceName: "Viator", title: `${q.place}: ${q.place === "Hakone" ? "Hakone Freepass mit Ropeway" : "Stadtführung"}`, price: 50, currency: "EUR", rating: 4.8, reviews: 100, minutes: 240, url: "https://viator.test" }], sources: [{ id: "viator", name: "Viator", configured: true, ok: true, count: 1 }] });
  });
  await p.route("https://flights.test/events/search", r => r.request().method() === "OPTIONS" ? r.fulfill({ status: 204, headers: cors }) : json(r, { events: [], sources: [] }));

  const open = async name => { await p.goto(URL); await p.locator(".start .home-trip", { hasText: name }).first().click(); await p.locator(".hero h1").waitFor(); };

  // ---- Japan: Onkel Jens kommt später – Flugsuche mit seinen Daten
  await open("Japan Großfamilie");
  await p.locator("#flights .fs-open").click();
  const fm = p.locator("#flights .modal.inline");
  await fm.waitFor();
  if (!(await fm.locator(".fs-who > .chips > .chip[aria-pressed=true]", { hasText: "Onkel Jens" }).count())) fail("Vorschlag: Onkel Jens (noch ohne Flug)");
  const dates = await fm.locator(".fs-form input[type=date]").evaluateAll(els => els.map(e => e.value));
  if (dates[0] !== "2027-04-15") fail("Flugsuche nicht ab Jens' erster Nacht: " + dates.join(","));
  await fm.locator(".fs-who > .chips > .chip", { hasText: "Klein (5)" }).click();
  await fm.locator(".fs-who > .chips > .chip", { hasText: "Onkel Jens" }).click();
  await until(async () => (await fm.locator(".fs-form input[type=date]").first().inputValue()) === "2027-04-01", "Daten folgen der Auswahl (Klein: Reisezeitraum)");
  await p.keyboard.press("Escape");
  log("Japan: Flugsuche für den Onkel ab seiner ersten Nacht (15.04.), bei Familie Klein wieder der Reisezeitraum");

  // Unterkunft: eine Station Tokio, Zeitabschnitte, erst Familie Klein allein; „alle zusammen“ ohne Ferienwohnung für 9 → 2 Häuser
  await p.locator("#stay .st-open").click();
  const sm = p.locator("#stay .modal.inline");
  await sm.waitFor();
  const st = await sm.locator(".st-stations:not(.st-segs)").innerText().catch(() => "");
  if ((st.match(/Tokio/g) || []).length > 1) fail("Tokio mehrfach als Station: " + st);
  const segs = await sm.locator(".st-segs").innerText();
  for (const s of ["Klein (5)", "alle 8 zusammen"]) if (!segs.includes(s)) fail(`Abschnitt „${s}“ fehlt: ${segs}`);
  const ci = await sm.locator("label.f", { hasText: "Check-in" }).locator("input").inputValue(), co = await sm.locator("label.f", { hasText: "Check-out" }).locator("input").inputValue();
  if (ci !== "2027-04-02" || co !== "2027-04-08") fail(`Start nicht mit dem ersten Abschnitt: ${ci}–${co}`);
  await sm.locator(".st-segs .chip", { hasText: "zusammen" }).click();
  await sm.locator(".chip", { hasText: "Ganze Unterkunft" }).first().click();
  await sm.locator("form.fs-form > button.btn.primary").click();
  await sm.locator(".st-fallback").waitFor();
  const q2 = asked.stays.at(-1);
  if (asked.stays.length !== 2 || q2.adults + q2.childAges.length !== 5 || q2.checkin !== "2027-04-15") fail("Ausweichen auf 2 Unterkünfte: " + JSON.stringify(asked.stays.map(q => [q.type, q.adults, q.childAges.length, q.checkin])));
  if (!(await sm.locator(".fs-res").count())) fail("nach dem Ausweichen keine Treffer");
  await p.keyboard.press("Escape");
  log("Japan: eine Station Tokio, Abschnitte (Klein allein … alle 8 zusammen), Start mit Familie Klein; keine Ferienwohnung für 8 → 2 Häuser mit Hinweis");

  // Touren: eigener Ort Hakone
  await p.locator("#attractions").scrollIntoViewIfNeeded();
  await p.locator("#attractions .xp-open-tours").click();
  const xm = p.locator("#attractions .modal.inline");
  await xm.locator(".xp-other input").fill("Hakone");
  await xm.locator(".xp-other button").click();
  await until(async () => (await xm.innerText()).includes("Hakone Freepass"), "Touren in Hakone");
  if (asked.tours.at(-1).place !== "Hakone") fail("Touren-Anfrage nicht für Hakone");
  await p.keyboard.press("Escape");
  log("Japan: Touren für Hakone gesucht (Hakone Freepass gefunden)");

  // ---- Mannschaft: jeder Spieler eine Kasse; Trainer-Familie gemeinsam, dann getrennt mit Kind bei Tina
  await open("Mannschaftsfahrt");
  const ks = p.locator("#split .kasse");
  await ks.scrollIntoViewIfNeeded();
  await ks.locator(".ks-add").click();
  const byOpts = await ks.locator(".ks-by option").allInnerTexts();
  if (byOpts.join("|") !== "Ali (Biber)|Ben (Biber)|Cem (Biber)|Dan (Biber)|Trainer") fail("Kassen bei „Bezahlt von“: " + byOpts.join("|"));
  await ks.locator(".ks-text").fill("Mannschaftsessen");
  await ks.locator(".ks-amount").fill("140");
  await ks.locator(".ks-amt select").selectOption("EUR");
  await ks.locator(".ks-by").selectOption("p:Ali");
  await ks.locator(".ks-form .btn.primary").click();
  // 140 € für 7 Personen: je 20 €; Trainer (3 Personen) 60 €
  await until(async () => (await ks.locator(".ks-moves").innerText()).includes("→ Ali"), "Ausgleich an Ali");
  const mv = await ks.locator(".ks-moves").innerText();
  if (!/Trainer → Ali\s*60/.test(mv.replace(/\s+/g, " ")) || !mv.includes("+1")) fail("Ausgleich Mannschaft: " + mv);
  await ks.locator(".ks-modes summary").click();
  await ks.locator(".ks-mode", { hasText: "Trainer" }).locator(".chip", { hasText: "jeder Erwachsene" }).click();
  await ks.locator(".ks-mode", { hasText: "Trainer" }).locator("select").selectOption("tm");
  // Kim zahlt Tina: Tina 40 €, Tom 20 €
  await until(async () => { const t = (await ks.locator(".ks-moves").innerText()).replace(/\s+/g, " "); return /Tina → Ali 40/.test(t) && /\+2 → Ali · jeweils 20/.test(t); }, "getrennte Kassen mit Kind bei Tina")
    .catch(async e => { console.log("MOVES:", (await ks.innerText()).replace(/\s+/g, " ").slice(0, 900), "ERR:", errors.join(" / ")); throw e; });
  log("Mannschaft: jeder Spieler eine Kasse, Trainer-Familie gemeinsam (60 €), getrennt mit Kind bei Tina (Tina 40 €, Tom wie die Spieler 20 €)");

  // ---- Ozeanien: Fidschi → München nur mit 2 Umstiegen; danach Reisezeitraum = Flüge
  await open("Ozeanien");
  await p.locator("#flights .fs-open").click();
  const om = p.locator("#flights .modal.inline");
  await om.locator(".fs-kind .chip", { hasText: "Rundreise" }).click();
  await om.locator(".fs-flexbox label", { hasText: "frühestens" }).locator("input").fill("2027-02-01");
  await om.locator(".fs-flexbox label", { hasText: "spätestens" }).locator("input").fill("2027-02-02");
  for (const [i, [code, lo, hi]] of [["SYD", 8, 9], ["AKL", 9, 10], ["NAN", 5, 6]].entries()) {
    if (i) await om.locator(".fs-addst").click();
    const s = om.locator(".fs-station").nth(i);
    await s.locator("input").first().fill(code);
    await om.locator(".lp-list li", { hasText: code }).first().click();
    await s.locator("label", { hasText: "Nächte von" }).locator("input").fill(String(lo));
    await s.locator("label", { hasText: "bis" }).last().locator("input").fill(String(hi));
  }
  await om.locator(".fs-form .btn.primary", { hasText: "Rundreise suchen" }).click();
  await om.locator(".fs-round").first().waitFor({ timeout: 20000 });
  if (!(await om.locator(".fs-morestops").innerText()).includes("NAN")) fail("Hinweis 2 Umstiege fehlt");
  if (!asked.flights.some(q => q.from === "NAN" && q.maxStops === 2)) fail("NAN nicht mit 2 Umstiegen nachgesucht");
  await om.locator(".fs-round").first().locator("button.primary").first().click();
  await until(async () => { const h = await p.locator(".hero").innerText(); return /Februar/.test(h) && !/7\. März/.test(h); }, "Reisezeitraum an die Flüge angepasst")
    .catch(async e => { console.log("HERO:", (await p.locator(".hero").innerText()).slice(0, 200)); throw e; });
  log("Ozeanien: Rückflug ab Fidschi erst mit 2 Umstiegen gefunden (Hinweis), Reisezeitraum folgt den Flügen");

  // ---- Kalifornien: Mietwagen SFO → SAN, 7 Personen = 2 Autos; unplausibler Preis LAX → SAN fällt raus
  await open("Kalifornien");
  await p.locator("#transport").scrollIntoViewIfNeeded();
  await p.locator("#transport .car-add").click();
  const car = await p.locator("#transport .card[data-item]", { hasText: "Mietwagen" }).first().innerText();
  for (const s of ["SFO", "SAN", "Einwegmiete", "2 Autos"]) if (!car.includes(s)) fail(`Mietwagen ohne „${s}“: ${car}`);
  await p.locator("#flights .fs-open").click();
  const cm = p.locator("#flights .modal.inline");
  await cm.locator(".fs-kind .chip", { hasText: "Nur Hinflug" }).click();
  await cm.locator(".fs-mode .chip", { hasText: "Feste Daten" }).click();
  await cm.locator(".fs-aps .chip.on").evaluateAll(els => els.forEach(e => e.click()));
  await cm.locator(".fs-add input").fill("LAX"); await cm.locator(".lp-list li", { hasText: "LAX" }).first().click();
  const to = cm.locator("label.f", { hasText: /^Nach/ }).locator("input");
  await to.fill("SAN"); await cm.locator(".lp-list li", { hasText: "SAN" }).first().click();
  await cm.locator(".fs-form input[type=date]").first().fill("2027-08-30");
  await cm.locator("form.fs-form > button.btn.primary").click();
  await cm.locator(".fs-res").first().waitFor();
  if ((await cm.locator(".fs-res").count()) !== 1 || /56\.8|8\.117/.test(await cm.locator(".fs-res").first().innerText())) fail("unplausibler Preis nicht aussortiert: " + (await cm.locator(".fs-res").allInnerTexts()).join(" | ").slice(0, 300));
  await p.keyboard.press("Escape");
  log("Kalifornien: Mietwagen SFO → SAN als Einwegmiete, 7 Personen = 2 Autos; Fehlerpreis LAX → SAN (8.117 € p. P.) aussortiert");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  console.log("\nGruppenreisen: alles in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
