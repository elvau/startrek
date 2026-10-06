/*
 * Einfacher Modus mit einzelnen Einträgen (Text, Betrag, wer dabei ist) und Cent bei Anteilen pro Person.
 * Beispiel aus der Beta: zu viert, Stadionführung nur Daniel und Henning, Abendessen alle.
 * Dazu Posten auf dem Handy: eingeklappt, Suche als Fenster.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const URL = "http://127.0.0.1:4180/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };

const TRIP = {
  id: "vier", name: "Zu viert", place: "London", country: "Vereinigtes Königreich", from: "2027-05-14", to: "2027-05-16",
  travelers: [
    { id: "d", name: "Daniel", household: "Klein" }, { id: "h", name: "Henning", household: "Klein" },
    { id: "m", name: "Monika", household: "Hase" }, { id: "s", name: "Sarah", household: "Hase" }
  ],
  items: [], tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, households: {},
  detail: { flights: false, stay: false, transport: false, attractions: false, misc: false }
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4180", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await ctx.addInitScript(t => {
    if (localStorage.getItem("rk2-index")) return;
    localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 4 }]));
    localStorage.setItem("rk2-current", t.id);
  }, TRIP);
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(URL);
  await p.locator(".start .home-trip", { hasText: "Zu viert" }).click();

  const card = p.locator("#attractions .simple-card");
  await card.scrollIntoViewIfNeeded();

  // Stadionführung 50 € nur Daniel und Henning
  await card.locator(".sl-add").click();
  let row = card.locator(".sl").nth(0);
  await row.locator(".sl-t").fill("Stadionführung");
  await row.locator(".sl-v input").fill("50");
  if ((await row.locator(".sl-who .chip.on").count()) !== 4) fail("neuer Eintrag nicht für alle");
  await row.locator(".sl-who .chip", { hasText: "Monika" }).click();
  await row.locator(".sl-who .chip", { hasText: "Sarah" }).click();
  await until(async () => (await row.locator(".sl-pp").innerText()).includes("25 €"), "Stadionführung 25 € pro Person");

  // Abendessen 200 € alle, Technikmuseum 40 € Sarah und Daniel
  await card.locator(".sl-add").click();
  row = card.locator(".sl").nth(1);
  await row.locator(".sl-t").fill("Abendessen");
  await row.locator(".sl-v input").fill("200");
  await card.locator(".sl-add").click();
  row = card.locator(".sl").nth(2);
  await row.locator(".sl-t").fill("Technikmuseum");
  await row.locator(".sl-v input").fill("40");
  for (const n of ["Henning", "Monika"]) await row.locator(".sl-who .chip", { hasText: n }).click();
  await until(async () => (await card.locator(".simple-out").innerText()).includes("290 €"), "zusammen 290 €");
  if (!(await p.locator("#attractions .ch-sum b").innerText()).includes("290")) fail("Kapitelsumme nicht 290 €");
  if (process.env.SHOTS) {
    await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await card.screenshot({ path: `${process.env.SHOTS}/sl-d.png` });
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(600);
    await card.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await card.screenshot({ path: `${process.env.SHOTS}/sl-m.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
  }
  log("Einträge: Stadionführung 50 € (Daniel, Henning), Abendessen 200 € (alle), Technikmuseum 40 € (Sarah, Daniel), zusammen 290 €");

  // Abrechnung: Klein trägt 25+25 + 50+50 + 20 = 170, Hase 50+50 + 20 = 120
  const hh = async () => [await p.locator('[id="hh-Klein"] .sh-tot b').innerText(), await p.locator('[id="hh-Hase"] .sh-tot b').innerText()];
  let [k, h] = await hh();
  if (!k.includes("170") || !h.includes("120")) fail(`Abrechnung pro Familie: Klein ${k}, Hase ${h}`);
  log("Abrechnung: Familie Klein 170 €, Familie Hase 120 €");

  // Anteil pro Person mit Cent: 10 € für alle 4 → 2,50 €
  const misc = p.locator("#misc .simple-card");
  await misc.scrollIntoViewIfNeeded();
  await misc.locator(".simple-in input").fill("10");
  await until(async () => (await misc.locator(".simple-out").innerText()).includes("2,50 €"), "10 € auf 4 = 2,50 €");
  log("Anteil pro Person mit Cent: 10 € auf 4 → 2,50 €");

  // Neu laden: alles gespeichert
  await p.reload();
  await p.locator(".start .home-trip", { hasText: "Zu viert" }).click();
  await p.locator("#attractions .sl").nth(2).waitFor();
  if ((await p.locator("#attractions .sl").nth(0).locator(".sl-who .chip.on").count()) !== 2) fail("Auswahl nicht gespeichert");
  log("Nach dem Neuladen alles da");

  // Auf detailliert: Einträge werden Posten mit denselben Beteiligten, Summe bleibt
  await p.locator("#attractions .mode button", { hasText: "Detailliert" }).click();
  await p.locator("#attractions .card[data-item]").nth(2).waitFor();
  const names = await p.locator("#attractions .card[data-item]").allInnerTexts();
  for (const n of ["Stadionführung", "Abendessen", "Technikmuseum"]) if (!names.some(x => x.includes(n))) fail("Posten fehlt: " + n);
  [k, h] = await hh();
  // Sonstiges (10 € auf 4) ist noch einfach und zählt weiter mit: + 5 € je Familie
  if (!k.includes("175") || !h.includes("125")) fail(`Summe nach Umschalten: Klein ${k}, Hase ${h}`);
  log("Detailliert: drei Posten mit denselben Beteiligten, Abrechnung unverändert");

  // Zuschuss: Kasse gibt 100 € für alle, gleich je Person (25 €) → Klein 125, Hase 75
  const fc = p.locator(".funds");
  await fc.scrollIntoViewIfNeeded();
  await fc.locator(".fu-add").click();
  await fc.locator(".fu-edit input").first().fill("Kegelkasse");
  await fc.locator(".fu-amt input").fill("100");
  await fc.locator(".fu-edit .in-row input").check();
  await fc.locator(".fu-acts .btn", { hasText: "Fertig" }).click();
  await until(async () => (await fc.locator(".fu-calc").innerText()).includes("200"), "Eigenanteil 200 €");
  [k, h] = await hh();
  if (!k.includes("125") || !h.includes("75")) fail(`Abrechnung mit Zuschuss: Klein ${k}, Hase ${h}`);
  if (!(await p.locator('[id="hh-Klein"] .sh-funds').innerText()).includes("Kegelkasse")) fail("Zuschuss fehlt in der Abrechnung der Familie");
  if (!(await fc.locator(".fu-row").innerText()).includes("eingegangen")) fail("Status eingegangen fehlt");
  if (!(await p.locator(".aside .tk-fund").innerText()).includes("100")) fail("Summe ohne Zuschuss-Hinweis");
  log("Zuschuss: Kegelkasse 100 € für alle (eingegangen) → Eigenanteil 200 €, Klein 125 €, Hase 75 €");

  // Handy: Posten zeigen oben Name, Status und Suche, der Rest eingeklappt mit Zusammenfassung;
  // die Suche öffnet als Fenster und danach ist man wieder am Posten (Flüge und Unterkünfte gleich)
  const PH = { id: "handy", name: "Split mobil", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }],
    detail: { flights: true, stay: true },
    items: [
      { id: "f", cat: "flights", name: "Flug Klein", status: "chosen", chosen: "o", options: [{ id: "o", label: "Eurowings", price: { mode: "person", currency: "EUR", adult: 189, child: 149 },
        legs: [{ dir: "out", from: "DUS", to: "SPU", dep: "2027-07-18T06:10", arr: "2027-07-18T08:05", stops: 0 }, { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-25T18:40", arr: "2027-07-25T20:50", stops: 0 }] }] },
      { id: "s", cat: "stay", name: "Villa am Meer", status: "idea", from: "2027-07-18", to: "2027-07-25", options: [{ id: "v", label: "Villa Ana", price: { mode: "unit", currency: "EUR", unit: 210, basis: "night" } }] }
    ], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {} };
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE" });
  await mctx.addInitScript(t => {
    if (localStorage.getItem("rk2-index")) return;
    localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 2 }]));
    localStorage.setItem("rk2-current", t.id);
  }, PH);
  const m = await mctx.newPage();
  m.on("pageerror", e => errors.push(e.message));
  await m.goto(URL);
  await m.locator(".start .home-trip", { hasText: "Split mobil" }).click();
  for (const [ch, id, btn, sum] of [["flights", "f", ".fs-item", "DUS→SPU"], ["stay", "s", ".st-item", "18.07. – 25.07."]]) {
    const c = m.locator(`#${ch} .card[data-item='${id}']`);
    await c.scrollIntoViewIfNeeded();
    await c.locator("h3, .fc-route, .st-name").first().click().catch(() => c.click({ position: { x: 20, y: 12 } }));
    await c.locator(".editor").waitFor();
    if (!(await c.locator(`.editor ${btn}.ed-search`).isVisible())) fail(`${ch}: Suche oben im Posten fehlt`);
    if (await c.locator(".editor details[open]").count()) fail(`${ch}: Abschnitte nicht eingeklappt`);
    const sums = (await c.locator(".editor details summary").allTextContents()).join(" | ");
    if (!sums.includes(sum) || !sums.includes("Wer ist dabei")) fail(`${ch}: Zusammenfassung „${sum}“ fehlt: ${sums}`);
    await c.locator(`.editor ${btn}.ed-search`).click();
    const dlg = m.locator(".modal-bg .modal");
    await dlg.waitFor();
    if (!(await dlg.locator(".modal-h h3").innerText()).includes(ch === "flights" ? "Flug Klein" : "Villa am Meer")) fail(`${ch}: Suche nicht für den Posten`);
    await dlg.locator(".modal-h .x").click();
    await dlg.waitFor({ state: "detached" });
    if (!(await c.locator(".editor").isVisible())) fail(`${ch}: nach der Suche nicht mehr am Posten`);
    await c.locator(".ed-foot .btn.primary").click();
    await c.locator(".editor").waitFor({ state: "detached" });
  }
  // Knopf oben im Kapitel öffnet dasselbe Fenster
  await m.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await m.locator("#flights .fs-open").click();
  await m.locator(".modal-bg .modal .fs-aps").waitFor();
  await m.locator(".modal-bg .modal .modal-h .x").click();
  log("Handy: Flug- und Unterkunftsposten eingeklappt mit Zusammenfassung, Suche oben als Fenster, danach wieder am Posten; Kapitelknopf ebenso");
  await mctx.close();

  // Nebenkosten (#169): Kurtaxe vor Ort (geschätzt) an der Unterkunft, Kaution nur Kreditkarte am Mietwagen
  const XC = { id: "xc", name: "Split Nebenkosten", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }, { id: "c", name: "Tom", household: "Smith", age: 38 }, { id: "d", name: "Mia", household: "Smith", age: 36 }],
    detail: { flights: true, stay: true, transport: true },
    items: [
      { id: "s", cat: "stay", name: "Villa am Meer", status: "chosen", from: "2027-07-18", to: "2027-07-25", options: [{ id: "v", label: "Villa Ana", price: { mode: "unit", currency: "EUR", unit: 980, basis: "stay" },
        extras: [{ id: "x1", kind: "citytax", amount: 2.8, basis: "personNight", pay: "onsite", est: true, freeUpTo: 12, source: "Stadt Split" }] }] },
      { id: "car", cat: "transport", icon: "car", name: "Mietwagen", status: "idea", options: [{ id: "c", label: "Kompakt", price: { mode: "unit", currency: "EUR", unit: 245 }, deposit: { amount: 1200, how: "credit" } }] }
    ], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {} };
  const xctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await xctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, XC);
  const xp = await xctx.newPage();
  xp.on("pageerror", e => errors.push(e.message));
  await xp.goto(URL);
  await xp.locator(".start .home-trip", { hasText: "Split Nebenkosten" }).click();
  const tot = async () => (await xp.locator(".aside .tk-top b").innerText()).trim();
  const xs = xp.locator("[data-xc='s']");
  await xs.waitFor();
  const sumTxt = await xs.locator("summary").innerText();
  if (!sumTxt.includes("Angebot 980 €") || !sumTxt.includes("+ ca. 59 € vor Ort") || !sumTxt.includes("Kurtaxe")) fail("Unterkunft ohne Nebenkosten-Zeile: " + sumTxt);
  if (await tot() !== "1.284 €") fail("Gesamt mit Kurtaxe: " + await tot());
  const top = await xp.locator(".aside .tk-xc").innerText();
  if (!top.includes("inkl. ca. 59 € Nebenkosten")) fail("Gesamtkalkulation ohne Nebenkosten: " + top);
  const sum = await xp.locator(".aside .xc-sum").innerText();
  if (!sum.includes("Kautionen, nur geblockt") || !sum.includes("1.200 €") || !sum.includes("nur Kreditkarte")) fail("Kaution nicht im Überblick: " + sum);
  // Kurtaxe aufgeklappt: 3 Erwachsene zahlen (Ben 9 frei), wegklicken senkt die Summe
  await xs.locator("summary").click();
  if (!(await xs.innerText()).includes("3 Pers.") || !(await xs.innerText()).includes("2,80")) fail("Kurtaxe ohne Zahl der Zahlenden: " + await xs.innerText());
  await xs.locator(".xc-tg").first().click();
  await until(async () => (await tot()) === "1.225 €", "Summe ohne Kurtaxe");
  await xs.locator(".xc-tg").first().click();
  await until(async () => (await tot()) === "1.284 €", "Kurtaxe wieder eingerechnet");
  // von Hand: Endreinigung 80 € pro Buchung über „Nebenkosten & Kaution“
  await xs.locator(".xc-edit").click();
  const ed = xp.locator("article.card[data-item='s'] .editor");
  await ed.locator("[data-sec=extras] summary").click();
  await ed.locator(".ie-xadd").click();
  const xrow = ed.locator(".ie-x").nth(1);
  await xrow.locator("label", { hasText: "Art" }).locator("select").selectOption("cleaning");
  await xrow.locator("label", { hasText: "Abrechnung" }).locator("select").selectOption("booking");
  await xrow.locator(".ie-xamt").fill("80");
  await until(async () => (await tot()) === "1.364 €", "Endreinigung eingerechnet");
  await ed.locator(".ed-foot .btn.primary").click();
  // Kaution nur Kreditkarte steht in Wichtiges (Bubble oben)
  await xp.locator(".top .imp-btn").click();
  const dep = xp.locator(".modal .imp-card[data-key='deposit:car']");
  await dep.waitFor();
  if (!(await dep.innerText()).includes("Nur Kreditkarte")) fail("Kaution in Wichtiges ohne Kreditkarten-Hinweis: " + await dep.innerText());
  await xp.keyboard.press("Escape");
  log("Nebenkosten: Kurtaxe 3 × 2,80 € × 7 Nächte (Kind frei) als „+ ca. 59 € vor Ort“, Gesamt inkl. Nebenkosten, wegklicken und wieder einrechnen, Endreinigung von Hand; Kaution 1.200 € nur Kreditkarte im Überblick und in Wichtiges");
  await xctx.close();

  // gepflegte Nebenkosten (#170): Kurtaxe in Rom automatisch (4 Sterne), wegklicken bleibt; Auto nach Kroatien: Vignetten, Maut, Trinkgeld
  const data = async pg => pg.route(/127\.0\.0\.1:4180\/(airports\.json|world\.json|visa\.json|packs\.json|places\/.*)$/, r => {
    const f = "../public/" + new globalThis.URL(r.request().url()).pathname.slice(1);
    return existsSync(f) ? r.fulfill({ status: 200, contentType: "application/json", body: readFileSync(f) }) : r.fulfill({ status: 404, body: "" });
  });
  const ROM = { id: "rom", name: "Rom", place: "Rom", country: "Italien", from: "2027-07-18", to: "2027-07-25",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 9 }],
    detail: { stay: true, flights: true }, households: {},
    items: [{ id: "h", cat: "stay", name: "Hotel", status: "chosen", from: "2027-07-18", to: "2027-07-25", options: [{ id: "o", label: "Hotel Roma", price: { mode: "unit", currency: "EUR", unit: 700, basis: "stay" }, stay: { stars: 4 },
      query: { place: "Rom", checkin: "2027-07-18", checkout: "2027-07-25", adults: 1, childAges: [9], rooms: 1 } }] }],
    tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } } };
  const HR = { id: "hr", name: "Kroatien mit dem Auto", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "c", name: "Tom", household: "Klein", age: 42 }],
    detail: { transport: true, misc: true }, households: { Klein: { plz: "40210", geo: { lat: 51.223, lon: 6.779, ort: "Düsseldorf" } } },
    items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } } };
  const fctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await fctx.addInitScript(([a, b]) => { if (localStorage.getItem("rk2-index")) return;
    for (const t of [a, b]) localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([a, b].map(t => ({ id: t.id, name: t.name, place: t.place })))); localStorage.setItem("rk2-current", a.id); }, [ROM, HR]);
  const fp = await fctx.newPage();
  fp.on("pageerror", e => errors.push(e.message));
  await data(fp);
  await fp.goto(URL);
  await fp.locator(".start .home-trip", { hasText: "Rom" }).first().click();
  const rx = fp.locator("[data-xc='h']");
  await rx.waitFor();
  // 7,50 € × 1 Erwachsene × 7 Nächte (Kind 9 frei) = 52,50 €
  if (!(await rx.locator("summary").innerText()).includes("+ ca. 53 € vor Ort")) fail("Rom ohne automatische Kurtaxe: " + await rx.locator("summary").innerText());
  await rx.locator("summary").click();
  if (!(await rx.innerText()).includes("Roma Capitale")) fail("Kurtaxe ohne Quelle: " + await rx.innerText());
  await rx.locator(".xc-tg").first().click();
  await until(async () => (await fp.locator(".aside .tk-top b").innerText()).trim() === "700 €", "Kurtaxe weggeklickt");
  await fp.waitForTimeout(800);
  await fp.reload();
  await fp.locator(".start .home-trip", { hasText: "Rom" }).first().click();
  await fp.locator(".aside .tk-top b").waitFor();
  await until(async () => (await fp.locator(".aside .tk-top b").innerText()).trim() === "700 €", "weggeklickt bleibt nach dem Neuladen");
  // Kroatien ohne Flug, Wohnort Düsseldorf: Österreich und Slowenien (Vignetten), Kroatien (Maut)
  await fp.locator(".top .brand-btn").click();
  await fp.locator(".start .home-trip", { hasText: "Kroatien mit dem Auto" }).click();
  const road = fp.locator("#transport .road");
  await road.waitFor({ timeout: 15000 });
  const rt = await road.innerText();
  if (!rt.includes("eigenen Auto") || !rt.includes("Österreich") || !rt.includes("Slowenien") || !rt.includes("Maut in Kroatien")) fail("Auto-Anreise: " + rt);
  // als Posten: Sprit je Auto, Vignetten und Maut als Nebenkosten; „Wer ist dabei“ entscheidet, wer zahlt
  await road.locator(".road-add").click();
  const car = fp.locator("#transport .card[data-item]", { hasText: "Anreise mit dem Auto" });
  await car.waitFor();
  await car.locator(".xc summary").click();
  await until(async () => (await car.innerText()).includes("Maut 🇭🇷 Kroatien"), "Nebenkosten am Auto-Posten");
  const ct = await car.innerText();
  if (!ct.includes("Vignette 🇦🇹 Österreich") || !ct.includes("Vignette 🇸🇮 Slowenien") || !ct.includes("Düsseldorf → Split")) fail("Auto-Posten: " + ct);
  if (!(await road.locator(".road-add").innerText()).includes("weiteres Auto")) fail("zweites Auto nicht anlegbar");
  const tip = await fp.locator("#misc .food-tip").innerText();
  if (!tip.includes("10 %") || !tip.includes("Strand")) fail("Trinkgeld-Hinweis Kroatien: " + tip);
  log("Gepflegte Nebenkosten: Kurtaxe Rom 4 Sterne automatisch (Kind frei, Quelle), wegklicken bleibt nach Neuladen; Auto nach Kroatien als Posten mit Sprit, Vignetten AT/SI und Maut HR als Nebenkosten, weiteres Auto möglich; Trinkgeld-Hinweis");
  await fctx.close();

  // Roadtrip (#201): Düsseldorf → Verona → Venedig → Ljubljana → zurück, Strecken vom Routen-Dienst (gemockt)
  const stay = (id, place, from, to) => ({ id, cat: "stay", name: "Unterkunft " + place, status: "chosen", from, to,
    options: [{ id: "o" + id, label: place, price: { mode: "unit", currency: "EUR", unit: 300, basis: "stay" }, query: { place, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 } }] });
  const RT = { id: "rt", name: "Roadtrip Italien", place: "Verona", country: "Italien", from: "2027-07-12", to: "2027-07-20",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "c", name: "Tom", household: "Klein", age: 42 }],
    detail: { transport: true, stay: true, misc: true }, households: { Klein: { plz: "40210", geo: { lat: 51.223, lon: 6.779, ort: "Düsseldorf" } } },
    items: [stay("s1", "Verona", "2027-07-12", "2027-07-15"), stay("s2", "Venedig", "2027-07-15", "2027-07-18"), stay("s3", "Ljubljana", "2027-07-18", "2027-07-20")],
    tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } } };
  const rctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await rctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, RT);
  const rp = await rctx.newPage();
  rp.on("pageerror", e => errors.push(e.message));
  await data(rp);
  const roadAsked = [];
  const hav = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  await rp.route("https://flights.test/road/route", async r => {
    const { points } = JSON.parse(r.request().postData());
    roadAsked.push(points.length);
    const legs = points.slice(1).map((b, i) => { const a = points[i], km = Math.round(hav(a, b) * 1.25), n = Math.max(1, Math.ceil(km / 20));
      return { km, min: Math.round(km / 80 * 60), path: Array.from({ length: n + 1 }, (_, k) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]) }; });
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ legs, configured: true, source: "ors" }) });
  });
  await rp.goto(URL);
  await rp.locator(".start .home-trip", { hasText: "Roadtrip Italien" }).click();
  const trip = rp.locator("#transport .road-trip");
  await trip.waitFor({ timeout: 15000 });
  await until(async () => (await trip.innerText()).includes("openrouteservice"), "Strecken vom Routen-Dienst");
  const legs = trip.locator(".rt-legs li");
  if ((await legs.count()) !== 4) fail("Etappen: " + (await legs.allInnerTexts()).join(" | "));
  const l0 = await legs.first().innerText();
  if (!l0.includes("Düsseldorf → Verona") || !l0.includes("lange Etappe")) fail("erste Etappe: " + l0);
  const tt = await trip.innerText();
  if (!tt.includes("🇦🇹 Vignette Österreich") || !tt.includes("🇸🇮 Vignette Slowenien") || !tt.includes("Maut in Italien") || !tt.includes("Di 20.07.")) fail("Kosten der Runde: " + tt.replace(/\n/g, " | "));
  // Auto als Posten für die ganze Runde
  await trip.locator(".road-add").click();
  const rcar = rp.locator("#transport .card[data-item]", { hasText: "Roadtrip mit dem Auto" });
  await rcar.waitFor();
  if (!(await rcar.innerText()).includes("Düsseldorf → Verona → Venedig → Ljubljana → Düsseldorf")) fail("Auto-Posten der Runde: " + await rcar.innerText());
  // Tagesplan: Fahrtag mit Strecke und Fahrzeit
  const drive = rp.locator(".dp-drive", { hasText: "Düsseldorf → Verona" });
  await drive.first().waitFor();
  if (!(await drive.first().innerText()).includes("mit Pausen")) fail("Fahrtag im Tagesplan: " + await drive.first().innerText());
  // lange Etappe teilen: Zwischenstopp als Unterkunft, Ankunft in Verona einen Tag später, Auto-Posten neu rechnen
  await legs.first().locator(".rt-split").click();
  await until(async () => (await legs.count()) === 5, "Etappe geteilt");
  if (!(await rp.locator("#stay .card[data-item]", { hasText: "Zwischenstopp" }).count())) fail("Zwischenstopp nicht angelegt");
  await until(async () => roadAsked.at(-1) === 6, "neue Strecke mit Zwischenstopp gefragt");
  await trip.locator(".rt-refresh").click();
  await until(async () => !(await trip.locator(".rt-refresh").count()), "Auto-Posten neu gerechnet");
  // Zwischenstopp suchen auf der Rückfahrt: Stopp angelegt, Unterkunftssuche öffnet sich dafür; Rückkehr einen Tag später
  await legs.last().locator(".rt-search").click();
  await rp.locator(".modal-bg .modal").waitFor();
  await rp.keyboard.press("Escape");
  await until(async () => (await legs.count()) === 6, "Rückfahrt geteilt");
  if (!(await rp.locator(".hero").innerText()).includes("21.")) fail("Rückkehr nicht verschoben: " + (await rp.locator(".hero").innerText()).slice(0, 120));
  log("Roadtrip: 4 Etappen vom Routen-Dienst, lange Etappe markiert, Vignetten AT/SI und Maut IT für die Runde, Auto-Posten der Runde, Fahrtag im Tagesplan; geteilt mit Zwischenstopp, Posten neu gerechnet; Zwischenstopp auf der Rückfahrt gesucht, Rückkehr einen Tag später");
  await rctx.close();

  // Fähren (#202): Rundreise nach Sardinien, Fähre automatisch dazwischen, Verbindung wählbar, Kosten am Auto-Posten
  const SA = { ...RT, id: "sa", name: "Sardinien mit dem Auto", place: "Olbia", from: "2027-07-12", to: "2027-07-22",
    items: [stay("v1", "Verona", "2027-07-12", "2027-07-15"), stay("o1", "Olbia", "2027-07-15", "2027-07-22")] };
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await sctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, SA);
  const sp = await sctx.newPage();
  sp.on("pageerror", e => errors.push(e.message));
  await data(sp);
  await sp.goto(URL);
  await sp.locator(".start .home-trip", { hasText: "Sardinien mit dem Auto" }).click();
  const st = sp.locator("#transport .road-trip");
  await st.waitFor({ timeout: 15000 });
  const fr = st.locator(".rt-ferry");
  await until(async () => (await fr.count()) === 2, "zwei Überfahrten");
  const f0 = await fr.first().innerText();
  if (!f0.includes("Livorno → Olbia") || !f0.includes("Nachtfähre") || !f0.includes("Auto 219 €") || !f0.includes("Direct Ferries")) fail("Fähre hin: " + f0.replace(/\n/g, " | "));
  if (!(await fr.last().innerText()).includes("Olbia → Genua")) fail("Fähre zurück: " + await fr.last().innerText());
  // andere Verbindung wählen
  await fr.first().locator(".rt-pick").selectOption("genova-olbia");
  await until(async () => (await fr.first().innerText()).includes("Genua → Olbia"), "Verbindung gewählt");
  // Auto-Posten: Fähre als Nebenkosten (Fahrzeug, Personen), Kabine nur auf Wunsch
  await st.locator(".road-add").click();
  const scar = sp.locator("#transport .card[data-item]", { hasText: "Roadtrip mit dem Auto" });
  await scar.waitFor();
  await scar.locator(".xc summary").click();
  const sx = await scar.locator(".xc").innerText();
  if (!sx.includes("Fähre (Fahrzeug)") || !sx.includes("Genua → Olbia") || !sx.includes("Kabine (Nachtfähre)")) fail("Fähre am Auto-Posten: " + sx.replace(/\n/g, " | "));
  if (!(await scar.locator(".xc li", { hasText: "Kabine" }).first().innerText()).includes("einrechnen")) fail("Kabine nicht nur auf Wunsch");
  const ferryDay = sp.locator(".dp-ferry", { hasText: "Genua → Olbia" });
  await ferryDay.first().waitFor();
  log("Fähren: Sardinien mit Fähre hin (Livorno → Olbia, Nachtfähre, Auto 219 €) und zurück (Olbia → Genua), Verbindung gewählt, als Nebenkosten am Auto-Posten (Fahrzeug je Überfahrt, Kabine nur auf Wunsch), Überfahrt im Tagesplan");
  await sctx.close();

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Einfacher Modus ok");
} finally { await browser.close(); server.kill(); }
