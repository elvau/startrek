/*
 * Einfacher Modus mit einzelnen Einträgen (Text, Betrag, wer dabei ist) und Cent bei Anteilen pro Person.
 * Beispiel aus der Beta: zu viert, Stadionführung nur Daniel und Henning, Abendessen alle.
 * Dazu Posten auf dem Handy: eingeklappt, Suche als Fenster.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { reloadHome } from "./nav.mjs";
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
  // Kopfleiste am Handy (#473): bei schmalen Breiten liegen alle Symbole in der Leiste, die Reise-Auswahl gibt Platz ab
  for (const w of [320, 406]) {
    await p.setViewportSize({ width: w, height: 800 }); await p.waitForTimeout(400);
    const out = await p.evaluate(() => { const r = document.querySelector(".top-in").getBoundingClientRect(); return [...document.querySelectorAll(".top-in *")].filter(e => { const b = e.getBoundingClientRect(); return b.width && getComputedStyle(e).display !== "contents" && (b.right > r.right || b.left < r.left); }).map(e => e.className); });
    if (out.length) fail(`Kopfleiste läuft bei ${w} px über: ${out.join(", ")}`);
  }
  await p.setViewportSize({ width: 1280, height: 900 });
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
  await reloadHome(p);
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
  // kompakte Karten (#242): Bild, Merkmale und Hin/Zurück erst beim Antippen, Hinweis „Details ›“
  const sCard = m.locator("#stay .card[data-item='s']"), fCard = m.locator("#flights .card[data-item='f']");
  await sCard.scrollIntoViewIfNeeded();
  if (await sCard.locator(".stay-img").isVisible() || await fCard.locator(".bp-legs").isVisible()) fail("Handy: Karten nicht kompakt");
  if (!(await sCard.evaluate(e => getComputedStyle(e, "::after").content)).includes("Details")) fail("Handy: Hinweis „Details“ fehlt");
  if (!(await sCard.locator("h3").isVisible()) || !/€/.test(await sCard.innerText())) fail("Handy: Name oder Preis fehlt auf der kompakten Karte");
  // „?“-Hinweise (#198): Antippen zeigt die Erklärung, Escape schließt; im Posten klappt der Abschnitt dabei nicht auf
  await m.locator("#stay .ch-t .help-q").click();
  const pop = m.locator(".help-pop");
  if (!(await pop.innerText()).includes("Detailliert:")) fail("Hinweis Einfach/Detailliert: " + await pop.innerText());
  await m.keyboard.press("Escape");
  await pop.waitFor({ state: "detached" });
  for (const [ch, id, btn, sum] of [["flights", "f", ".fs-item", "DUS→SPU"], ["stay", "s", ".st-item", "18.07. – 25.07."]]) {
    const c = m.locator(`#${ch} .card[data-item='${id}']`);
    await c.scrollIntoViewIfNeeded();
    await c.locator("h3, .fc-route, .st-name").first().click().catch(() => c.click({ position: { x: 20, y: 12 } }));
    await c.locator(".editor").waitFor();
    if (!(await c.locator(`.editor ${btn}.ed-search`).isVisible())) fail(`${ch}: Suche oben im Posten fehlt`);
    if (await c.locator(".editor details[open]").count()) fail(`${ch}: Abschnitte nicht eingeklappt`);
    if (!(await c.locator(ch === "flights" ? ".bp-legs" : ".stay-img").isVisible())) fail(`${ch}: Einzelheiten beim Antippen nicht sichtbar`);
    const sums = (await c.locator(".editor details summary").allTextContents()).join(" | ");
    if (!sums.includes(sum) || !sums.includes("Wer ist dabei")) fail(`${ch}: Zusammenfassung „${sum}“ fehlt: ${sums}`);
    if (ch === "flights") {
      await c.locator(".editor details:has(.help-q) .help-q").first().click();
      if (!(await m.locator(".help-pop").innerText()).includes("teilt sich die Kosten")) fail("Hinweis „Wer ist dabei“");
      if (await c.locator(".editor details[open]").count()) fail("Hinweis klappt den Abschnitt auf");
      await c.locator(".editor details:has(.help-q) .help-q").first().click(); // noch einmal antippen schließt
      await m.locator(".help-pop").waitFor({ state: "detached" });
    }
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
  log("Handy: „?“-Hinweise öffnen und schließen; Karten kompakt (Einzelheiten beim Antippen); Flug- und Unterkunftsposten eingeklappt mit Zusammenfassung, Suche oben als Fenster, danach wieder am Posten; Kapitelknopf ebenso");
  // Neuladen im selben Tab bleibt in der Reise (Issue #255); über die Marke und neu laden bleibt es auf der Startseite
  await m.evaluate(() => scrollTo({ top: 600, behavior: "instant" }));
  await m.waitForTimeout(700); // Scrollstand wird verzögert gemerkt
  await m.reload();
  await m.locator(".top .brand-btn").waitFor();
  if (await m.locator(".start").count()) fail("Neuladen in der Reise landet auf der Startseite");
  await until(async () => (await m.evaluate(() => scrollY)) > 300, "Scrollstand nach dem Neuladen");
  await m.locator(".top .brand-btn").click();
  await m.locator(".start").waitFor();
  await m.reload();
  await m.locator(".start").waitFor();
  log("Handy: Neuladen bleibt in der Reise mit Scrollstand; nach der Marke bleibt es auf der Startseite");
  await mctx.close();

  // leere Kapitel (#198): je Kapitel eine Überschrift und ein Satz, was hierher gehört und welcher Knopf hilft
  const EM = { id: "leer", name: "Leere Reise", place: "Split", country: "Kroatien", from: "2027-07-18", to: "2027-07-25",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }], detail: { flights: true, stay: true, transport: true, attractions: true, misc: true },
    items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {} };
  const ectx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await ectx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, EM);
  const ep = await ectx.newPage();
  ep.on("pageerror", e => errors.push(e.message));
  await ep.goto(URL);
  await ep.locator(".start .home-trip", { hasText: "Leere Reise" }).click();
  const ef = await ep.locator("[data-empty=flights]").innerText();
  if (!ef.includes("Noch keine Anreise") || !ef.includes("„Flüge suchen“") || !ef.includes("„Flug oder Anreise“")) fail("Leeres Kapitel Flüge: " + ef);
  const es = await ep.locator("[data-empty=stay]").innerText();
  if (!es.includes("Noch keine Unterkunft") || !es.includes("„Unterkunft suchen“")) fail("Leeres Kapitel Unterkunft: " + es);
  for (const k of ["transport", "attractions", "misc"]) if (!(await ep.locator(`[data-empty=${k}] b`).innerText()).trim()) fail("Leeres Kapitel ohne Überschrift: " + k);
  await ectx.close();
  log("Leere Kapitel erklären, was hierher gehört, mit den Namen der passenden Knöpfe");

  // gemeinsam planen (#174, #175): wer wann kann, bester Zeitraum als Reisedatum, Abstimmung mit zwei Personen
  const GP = { id: "gp", name: "Gruppe plant", place: "Split", country: "Kroatien",
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 42 }, { id: "c", name: "Cleo", household: "Hase", age: 35 }],
    items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {},
    avail: { from: "2027-07-01", to: "2027-07-14", nights: 3, by: {} } };
  const gctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await gctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, GP);
  const gp = await gctx.newPage();
  gp.on("pageerror", e => errors.push(e.message));
  gp.on("dialog", d => d.accept());
  await gp.goto(URL);
  await gp.locator(".start .home-trip", { hasText: "Gruppe plant" }).click();
  const tg = gp.locator("#together .tg");
  await tg.scrollIntoViewIfNeeded();
  const cell = (row, day) => tg.locator(".tg-row").filter({ hasText: row }).locator(".tg-c").nth(day - 1);
  // Anna kann 1.–4. nicht (dreimal antippen = kann nicht), Ben 8. vielleicht (zweimal), Cleo trägt 10. „kann“ ein
  for (const d of [1, 2, 3, 4]) for (let i = 0; i < 3; i++) await cell("Anna", d).click();
  for (let i = 0; i < 2; i++) await cell("Ben", 8).click();
  await cell("Cleo", 10).click();
  if (!(await tg.locator(".tg-count").innerText()).includes("3 von 3")) fail("Eingetragen-Zähler: " + await tg.locator(".tg-count").innerText());
  const firstBest = await tg.locator(".tg-best li").first().innerText();
  if (!firstBest.includes("09.07.") || !firstBest.includes("alle 3")) fail("Bester Zeitraum: " + firstBest);
  await tg.locator(".tg-best li").first().locator(".tg-take").click();
  await until(async () => (await gp.locator(".hero .meta").innerText()).includes("3 Nächte"), "Zeitraum als Reisedatum");
  log("Termin finden: drei Personen tragen ein, bester Zeitraum 09.–12.07. für alle 3 (am 8. kann Ben nur vielleicht), als Reisedatum übernommen");
  // Abstimmung über die besten Zeiträume, zwei Personen stimmen, Ergebnis übernehmen
  await tg.locator(".tg-poll").click();
  const poll = tg.locator(".poll").first();
  await poll.waitFor({ timeout: 4000 }).catch(async () => fail("Abstimmung fehlt: " + (await tg.innerText()).slice(-900).replace(/\n/g, " / ") + " | " + errors.join(" | ")));
  await tg.locator(".tg-me select").selectOption({ label: "Anna" });
  await poll.locator("li").nth(1).locator(".pv-for").click();
  await tg.locator(".tg-me select").selectOption({ label: "Cleo" });
  // eine Stimme (#432): zweite Wahl ersetzt die erste
  await poll.locator("li").nth(0).locator(".pv-for").click();
  await poll.locator("li").nth(1).locator(".pv-for").click();
  if (await poll.locator("li").nth(0).locator(".pv-for.on").count()) fail("Eine Stimme: erste Wahl bleibt");
  // „✕ Ohne mich“ (#439): erst das Fenster mit Erklärung, Begründung freiwillig; danach „Wäre doch dabei“
  await poll.locator("li").nth(0).locator(".pv-veto").click();
  const vd = gp.locator(".modal", { hasText: "Ohne mich bei" });
  await vd.waitFor();
  if (!(await vd.innerText()).includes("2 statt 3 Personen")) fail("Fenster ohne Folgen: " + await vd.innerText());
  await vd.locator(".veto-why").fill("zu früh");
  await vd.locator(".veto-ok").click();
  await vd.waitFor({ state: "detached" });
  if (!(await poll.locator("li").nth(0).innerText()).includes("✕ Cleo: „zu früh“")) fail("Ohne mich nicht mit Namen und Grund: " + await poll.locator("li").nth(0).innerText());
  if (!(await poll.locator("li").nth(0).locator(".pv-veto").innerText()).includes("Wäre doch dabei")) fail("Knopf heißt nicht „Wäre doch dabei“");
  // Anna hat vorher abgestimmt: bekommt die Info
  await tg.locator(".tg-me select").selectOption({ label: "Anna" });
  await poll.locator(".pv-notes", { hasText: "Cleo wäre bei" }).waitFor({ timeout: 4000 }).catch(async () => fail("Keine Info an Anna: " + (await poll.innerText()).replace(/\n/g, " / ")));
  await poll.locator(".pv-seen").click();
  if (await poll.locator(".pv-notes").count()) fail("Info nach „Gelesen“ noch da");
  if (!(await poll.innerText()).includes("Noch nicht abgestimmt: Ben")) fail("Wer fehlt: " + await poll.innerText());
  const second = (await poll.locator("li").nth(1).locator(".poll-l").innerText()).split(" – ")[0];
  await poll.locator(".poll-apply").click();
  await poll.locator(".poll-done").waitFor();
  const day = String(+second.slice(0, 2)) + ". bis";
  if (!(await gp.locator(".hero .meta").innerText()).includes(day)) fail("Abstimmungsergebnis nicht als Reisedatum: " + second + " / " + await gp.locator(".hero .meta").innerText());
  // frei: neue Abstimmung, ohne zwei Möglichkeiten nicht startbar
  await tg.locator(".poll-new").click();
  await tg.locator(".poll-q").fill("Welches Ziel?");
  await tg.locator(".poll-opts").fill("Mallorca");
  if (await tg.locator(".poll-add").isEnabled()) fail("Abstimmung mit einer Möglichkeit startbar");
  await tg.locator(".poll-opts").fill("Mallorca\nKroatien");
  // Meilen-Wahl (#432): 4 Meilen je Person, alle auf eine Möglichkeit
  await tg.locator(".poll-mode").selectOption("miles");
  await tg.locator(".poll-miles").fill("4");
  await tg.locator(".poll-add").click();
  const mp = tg.locator(".poll", { hasText: "Welches Ziel?" });
  await mp.waitFor();
  if (!(await mp.locator(".pv-mode").innerText()).includes("Meilen-Wahl · 4 Meilen")) fail("Meilen-Wahl: " + await mp.locator(".pv-mode").innerText());
  await tg.locator(".tg-me select").selectOption({ label: "Ben" });
  const kro = mp.locator("li", { hasText: "Kroatien" });
  for (let i = 0; i < 4; i++) await kro.locator(".pv-more").click();
  if (await kro.locator(".pv-more").isEnabled()) fail("Mehr Meilen als erlaubt");
  if (!(await mp.locator(".pv-left").innerText()).includes("Noch 0 von 4")) fail("Meilen übrig: " + await mp.locator(".pv-left").innerText());
  if (!(await kro.innerText()).includes("4 Meilen")) fail("Meilen gezählt: " + await kro.innerText());
  // offene Abstimmung steht unter „Wichtiges“
  if (!(await gp.locator(".imp-btn").getAttribute("aria-label") || "").match(/Wichtig/)) fail("Wichtiges-Knopf fehlt");
  // Anna sagt mit Familie (Ben) „Ohne mich“ zu Kroatien; Kroatien trotzdem nehmen stellt beide auf „nicht dabei“
  await tg.locator(".tg-me select").selectOption({ label: "Anna" });
  await kro.locator(".pv-veto").click();
  await vd.waitFor();
  await vd.locator(".veto-fam").check();
  if (!(await vd.innerText()).includes("1 statt 3 Personen")) fail("Familie nicht mitgerechnet: " + await vd.innerText());
  await vd.locator(".veto-ok").click();
  await until(async () => (await kro.innerText()).includes("✕ Anna (mit Familie)"), "Ohne mich mit Familie");
  await mp.locator(".poll-apply").click();
  await until(async () => gp.evaluate(() => { const t = JSON.parse(localStorage.getItem("rk2-t:gp") || "{}"); return t.travelers?.filter(x => x.active === false).map(x => x.name).join() === "Anna,Ben"; }), "Anna und Ben nicht dabei");
  await gctx.close();
  log("Abstimmen: über die Zeiträume (eine Stimme, Cleo „ohne mich“, Ben fehlt), Ergebnis als Reisedatum; freie Abstimmung erst ab zwei Möglichkeiten, Meilen-Wahl mit 4 Meilen; „Ohne mich“ mit Fenster, Grund, Info an Anna, mit Familie, trotzdem nehmen stellt beide auf „nicht dabei“");

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
  await reloadHome(fp);
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
  // vom Auto-Posten zur Strecke (#243), dort der km-Satz
  await car.locator(".road-jump button").click();
  await until(async () => (await fp.locator("#transport .search-row.flash").count()) > 0, "Strecke leuchtet nach dem Sprung vom Auto-Posten");
  const fuel0 = await road.locator("li", { hasText: "⛽" }).first().innerText();
  await road.locator(".rt-km input").fill("0.6");
  await road.locator(".rt-km input").press("Enter");
  await road.locator(".rt-km input").blur();
  await until(async () => (await road.locator("li", { hasText: "⛽" }).first().innerText()) !== fuel0, "Sprit mit neuem km-Satz");
  if (!(await road.locator("li", { hasText: "⛽" }).first().innerText()).includes("0,60")) fail("km-Satz: " + await road.locator("li", { hasText: "⛽" }).first().innerText());
  await road.locator(".rt-km input").fill("0.3"); await road.locator(".rt-km input").blur();
  const tip = await fp.locator("#misc .food-tip").innerText();
  if (!tip.includes("10 %") || !tip.includes("Strand")) fail("Trinkgeld-Hinweis Kroatien: " + tip);
  log("Gepflegte Nebenkosten: Kurtaxe Rom 4 Sterne automatisch (Kind frei, Quelle), wegklicken bleibt nach Neuladen; Auto nach Kroatien als Posten mit Sprit, Vignetten AT/SI und Maut HR als Nebenkosten, weiteres Auto möglich, Sprung zur Strecke, km-Satz einstellbar; Trinkgeld-Hinweis");
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

  // Camper (#203): Umschalter, Stationen als Campingplatz/Stellplatz, Roadtrip mit Camper-Satz, Mietcamper mit Kaution, über 3,5 t
  const CP = { ...RT, id: "cp", name: "Mit dem Camper", place: "Verona", items: [] };
  const cctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await cctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, CP);
  const cp = await cctx.newPage();
  cp.on("pageerror", e => errors.push(e.message));
  await data(cp);
  await cp.goto(URL);
  await cp.locator(".start .home-trip", { hasText: "Mit dem Camper" }).click();
  const panel = cp.locator("#transport .camper");
  await panel.waitFor({ timeout: 15000 });
  await panel.locator(".cp-mode .chip", { hasText: "Camper" }).click();
  for (const [place, n, kind] of [["Verona", 3, "site"], ["Florenz", 2, "pitch"], ["Ljubljana", 2, "site"]]) {
    await panel.locator(".cp-place").fill(place);
    await panel.locator(".cp-nn").fill(String(n));
    await panel.locator(".cp-kind").selectOption(kind);
    await panel.locator(".cp-go").click();
    await panel.locator(".cp-list li", { hasText: place }).waitFor();
  }
  const rows = await panel.locator(".cp-list li").allInnerTexts();
  if (rows.length !== 3 || !rows[0].includes("44 €") || !rows[1].includes("22 €")) fail("Camper-Stationen: " + rows.join(" | "));
  const camp = cp.locator("#stay .card[data-item]", { hasText: "Stellplatz Florenz" });
  await camp.waitFor();
  if (!(await camp.innerText()).includes("ACSI")) fail("Stellplatz ohne Quelle: " + await camp.innerText());
  const crt = cp.locator("#transport .road-trip");
  await crt.waitFor({ timeout: 15000 });
  await until(async () => (await crt.innerText()).includes("0,25"), "Camper-km-Satz");
  // Mietcamper als Posten: Kaution nur Kreditkarte, Endreinigung nur auf Wunsch
  await panel.locator(".cp-rentadd").click();
  const rent = cp.locator("#transport .card[data-item]", { hasText: "Mietcamper" });
  await rent.waitFor();
  await rent.locator(".xc summary").click();
  const rxc = await rent.locator(".xc").innerText();
  if (!rxc.includes("Kaution") || !rxc.includes("1.500") || !rxc.includes("Übergabepauschale")) fail("Mietcamper: " + rxc.replace(/\n/g, " | "));
  if (!(await rent.locator(".xc li", { hasText: "Reinigung" }).first().innerText()).includes("einrechnen")) fail("Endreinigung nicht nur auf Wunsch");
  // über 3,5 t: Hinweis Führerschein
  await panel.locator(".chip", { hasText: "über 3,5 t" }).click();
  if (!(await panel.locator(".cp-heavy").innerText()).includes("C1")) fail("Hinweis über 3,5 t fehlt");
  log("Camper: drei Stationen (Campingplatz 44 €, Stellplatz 22 €, mit Quelle), Roadtrip mit Camper-Satz 0,25 €/km, Mietcamper mit Kaution und Pauschalen (Reinigung auf Wunsch), Hinweis über 3,5 t");
  // Unterkunft mit Camper (#269): Hinweis auf die Stationen statt Hotelsuche, die Suche nur für einzelne Nächte
  const stHint = cp.locator("#stay .st-camper");
  if (!(await stHint.innerText()).includes("Stellplätzen")) fail("Hinweis auf Camper-Stationen im Kapitel Unterkunft fehlt");
  if (await cp.locator("#stay .st-open.primary").count()) fail("Hotelsuche bei Camper-Reise als Hauptknopf");
  await cp.locator("#stay .st-open").click();
  await cp.locator(".modal .st-camper").waitFor();
  await cp.locator(".modal .st-camper .linkbtn").click();
  await until(async () => !(await cp.locator(".modal .st-camper").count()), "Suche zu, weiter zu den Stationen");
  log("Camper: Kapitel Unterkunft verweist auf die Stationen, Hotelsuche nur noch mit Hinweis");
  await cctx.close();

  // Zeitleiste (#228): drei Familien, gleich lang → eine Zeile; Zeiten einer Familie setzen, Reise wächst mit, zurücksetzen
  const TL = { id: "tl", name: "Zeitleiste", place: "Testort", country: "Testland", from: "2027-07-10", to: "2027-07-31",
    travelers: [{ id: "a", name: "Anna", household: "Bednorz" }, { id: "c", name: "Tom", household: "Klein" }, { id: "o", name: "Inge", household: "Oma" }],
    items: [{ id: "h", cat: "stay", name: "Ferienhaus", status: "idea", from: "2027-07-10", to: "2027-07-31",
      options: [{ id: "ho", label: "Ferienhaus", price: { mode: "unit", currency: "EUR", unit: 100, basis: "night" } }] }],
    tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {}, detail: { stay: true } };
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE" });
  await tctx.addInitScript(t => { if (localStorage.getItem("rk2-index")) return; localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place }])); localStorage.setItem("rk2-current", t.id); }, TL);
  const tp = await tctx.newPage();
  tp.on("pageerror", e => errors.push(e.message));
  await tp.goto(URL);
  await tp.locator(".start .home-trip", { hasText: "Zeitleiste" }).click();
  const tlc = tp.locator(".tl-card");
  await tlc.waitFor({ timeout: 15000 });
  if (!(await tlc.innerText()).includes("Alle gleich lang") || await tlc.locator(".tl-row").count()) fail("Zeitleiste nicht kompakt: " + await tlc.innerText());
  await tlc.locator(".tl-toggle").click();
  await tlc.locator(".tl-row", { hasText: "Oma" }).click();
  await tlc.locator(".tl-a").fill("2027-07-08");
  await tlc.locator(".tl-a").dispatchEvent("change");
  await tlc.locator(".tl-d").fill("2027-07-18");
  await tlc.locator(".tl-d").dispatchEvent("change");
  const oma = tlc.locator(".tl-row", { hasText: "Oma" });
  await until(async () => (await oma.innerText()).includes("08.07. – 18.07. · 10 Nächte") && (await oma.innerText()).includes("eigene Zeiten"), "Zeiten der Oma gesetzt");
  await until(async () => (await tlc.locator(".tl-h").innerText()).includes("08.07. – 31.07. · 23 Nächte"), "Reise wächst mit");
  // Aufteilung am Posten (#229): Oma nur 8 der 21 Nächte im Ferienhaus
  const house = tp.locator("#stay .card[data-item]", { hasText: "Ferienhaus" });
  await until(async () => (await house.locator(".isplit").innerText().catch(() => "")).includes("8 von 21 Nächten"), "Aufteilung am Posten");
  await tlc.locator(".tl-reset").click();
  await until(async () => (await oma.innerText()).includes("ganze Reise"), "Oma zurückgesetzt");
  log("Zeitleiste: drei Familien gleich lang kompakt, Zeiten der Oma gesetzt (Reise wächst auf 23 Nächte, Aufteilung am Ferienhaus: Oma 8 von 21 Nächten), zurückgesetzt");
  await tctx.close();

  // Link von einer Inhaltsseite (#314, #402): neue Reise mit Ziel, Land, drei Familien und den Kosten der Reiseidee, ohne Startseite
  const lctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE" });
  const lp = await lctx.newPage();
  lp.on("pageerror", e => errors.push(e.message));
  await lp.goto(URL + "?ziel=Riva%20del%20Garda&land=IT&name=Gardasee%20mit%20Familien&fam=2-2,2-2,2-1&idee=gardasee-mehrere-familien-kosten");
  await until(async () => (await lp.locator("body").innerText()).includes("Gardasee mit Familien"), "Reise aus dem Link", 15000);
  if (lp.url().includes("ziel=") || lp.url().includes("idee=")) fail("Link-Angaben noch in der Adresse: " + lp.url());
  const current = () => lp.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "null"));
  await until(async () => !!(await current()), "Reise gespeichert");
  const saved = await current();
  if (saved.place !== "Riva del Garda" || saved.country !== "Italien") fail("Ziel falsch: " + saved.place + " / " + saved.country);
  if (saved.travelers.length !== 11 || new Set(saved.travelers.map(x => x.household)).size !== 3) fail("Familien falsch: " + saved.travelers.map(x => x.name).join(", "));
  const cats = saved.items.map(i => i.cat).sort().join(",");
  // misc: Verpflegung, Souvenirs (#421) und der Posten der Idee
  if (cats !== "attractions,misc,misc,misc,stay,transport") fail("Posten der Reiseidee: " + cats);
  const ideaHouse = lp.locator("#stay .card", { hasText: "Ferienhaus mit Pool" });
  await ideaHouse.scrollIntoViewIfNeeded();
  // Richtwert 230–380 € pro Person → 305 € × 11 Personen
  if (!(await ideaHouse.innerText()).includes("3.355")) fail("Ferienhaus ohne Richtwert: " + (await ideaHouse.innerText()));
  if (!saved.kicker?.includes("3 Familien")) fail("Beispielrechnung fehlt in der Reise: " + saved.kicker);
  log("Link von Inhaltsseite: Reise „Gardasee mit Familien“ in Riva del Garda (Italien) mit 3 Familien, 6 Erw. und 5 Kindern und 5 Posten aus der Reiseidee (Richtwerte); Adresse bereinigt");
  await lctx.close();

  // Haustiere (#322): Familie Klein mit Hund (reist mit) → Hinweise unter „Wichtiges“ für London;
  // Familie Hase: Fische bleiben zuhause → Anfrage-Text und Posten Tierbetreuung nur für Hase
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await pctx.addInitScript(t => {
    if (localStorage.getItem("rk2-index")) return;
    localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 4 }]));
    localStorage.setItem("rk2-current", t.id);
  }, TRIP);
  const pp = await pctx.newPage();
  await data(pp);
  pp.on("pageerror", e => errors.push(e.message));
  await pp.goto(URL);
  await pp.locator(".start .home-trip", { hasText: "Zu viert" }).click();
  // versteckt (#323): ohne bekanntes Haustier und ohne Schalter kein Bereich; einschalten an der Reise (✎)
  if (await pp.locator(".pets-h").count()) fail("Zuhause während der Reise sichtbar, obwohl nichts eingeschaltet");
  await pp.locator(".top .top-edit").click();
  await pp.locator(".te-home input").check();
  await pp.locator(".trip-ed .btn.primary").click();
  await pp.locator(".pets-h", { hasText: "Zuhause während der Reise" }).click();
  await pp.locator(".pet-fam", { hasText: "Klein" }).locator(".chip", { hasText: "Hund" }).click();
  await pp.locator(".top .imp-btn").click();
  const pimp = pp.locator(".modal .imp");
  await pimp.locator("[data-key='hint:petEntry']").first().waitFor();
  await pimp.locator("[data-key='hint:petTapeworm']").first().waitFor();
  await pp.keyboard.press("Escape");
  const hase = pp.locator(".pet-fam", { hasText: "Hase" });
  await hase.locator(".chip", { hasText: "Fische" }).click();
  await hase.locator(".chip", { hasText: "bleibt zuhause" }).click();
  await hase.locator(".home-tasks .chip", { hasText: "Pflanzen gießen" }).click();
  await hase.locator(".home-tasks .chip", { hasText: "Briefkasten" }).click();
  await hase.locator(".chip", { hasText: "etwa alle 2–3 Tage" }).click();
  await hase.locator(".home-thanks .chip", { hasText: "50 €" }).click();
  await hase.locator('.home-thanks input[placeholder^="oder z. B."]').fill("eine Kiste Bier");
  const askT = await hase.locator(".pet-ask").innerText();
  if (!askT.includes("bei uns unsere Fische füttern, die Pflanzen gießen und den Briefkasten leeren (etwa alle 2–3 Tage)") || !askT.includes("Als Dankeschön: 50 € und eine Kiste Bier") || !askT.includes("14.05.")) fail("Anfrage Zuhause: " + askT);
  await hase.locator(".btn", { hasText: "Posten übernehmen" }).click();
  await hase.locator("text=Posten angelegt").waitFor();
  const cur = () => pp.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "null"));
  await until(async () => !!(await cur())?.items?.some(i => i.hint === "home:Hase"), "Posten Zuhause gespeichert");
  const pt = await cur();
  const care = pt.items.find(i => i.hint === "home:Hase");
  if (!care || care.name !== "Zuhause versorgt Hase" || care.participants?.sort().join() !== "m,s" || care.options.map(o => o.price.unit).join() !== "50,30") fail("Posten Zuhause: " + JSON.stringify(care));
  if (pt.households?.Klein?.pets?.kinds?.join() !== "dog" || !pt.households?.Hase?.pets?.home || pt.households?.Hase?.care?.tasks?.join() !== "plants,mail" || !pt.homeCare) fail("Zuhause nicht gespeichert: " + JSON.stringify({ h: pt.households, on: pt.homeCare }));
  log("Zuhause während der Reise: erst eingeschaltet sichtbar; Klein mit Hund nach London (Einreise mit Haustier, Bandwurmbehandlung unter „Wichtiges“); Hase: Fische zuhause, Pflanzen und Briefkasten alle 2–3 Tage, Dankeschön 50 € und eine Kiste Bier (Anfrage, Posten nur für Hase: 50 € bzw. Sitter 30 €)");
  await pctx.close();

  {
  // Vergleich (#429, #430): drei Varianten einer Reise, Kachel, Vergleichsansicht, „Diese nehmen“, umbenennen, herausnehmen
  const vtr = (id, label, place, country, stay, flight) => ({ id, name: "Chalet-Wochenende", place, country, from: "2027-05-05", to: "2027-05-09",
    cmp: { id: "chalet", title: "Chalet-Wochenende", label },
    travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 42 }],
    items: [
      { id: "f", cat: "transport", name: "Anreise mit dem Auto", status: "idea", options: [{ id: "o", label: "Auto", price: { mode: "unit", currency: "EUR", unit: flight } }] },
      { id: "s", cat: "stay", name: "Chalet", status: "idea", options: [{ id: "o", label: "Chalet", price: { mode: "unit", currency: "EUR", unit: stay, basis: "stay" } }] },
      { id: "e", cat: "attractions", name: "Kanu", status: "idea", options: [{ id: "o", label: "Kanu", price: { mode: "person", currency: "EUR", adult: 40 } }] }
    ], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } }, households: {}, detail: { transport: true, stay: true, attractions: true } });
  const VS = [vtr("v1", "Ardennen Frankreich", "Signy-l'Abbaye", "Frankreich", 1680, 214), vtr("v2", "Ardennen Belgien", "Durbuy", "Belgien", 2380, 196), vtr("v3", "Eifel", "Monschau", "Deutschland", 1890, 120)];
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  await vctx.addInitScript(ts => { if (localStorage.getItem("rk2-index")) return; for (const t of ts) localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify(ts.map(t => ({ id: t.id, name: t.name, place: t.place })))); }, VS);
  const cp = await vctx.newPage();
  cp.on("pageerror", e => errors.push(e.message));
  cp.on("dialog", d => d.type() === "prompt" ? d.accept("Eifel Monschau") : d.accept());
  await cp.goto(URL);
  const tile = cp.locator(".home-cmp", { hasText: "Chalet-Wochenende" });
  await tile.waitFor();
  if (!(await tile.innerText()).includes("3 Varianten") || (await tile.locator(".hc-var").count()) !== 3) fail("Kachel: " + await tile.innerText());
  if (!(await tile.locator(".hc-var", { hasText: "Ardennen Frankreich" }).innerText()).includes("günstigste")) fail("günstigste nicht markiert");
  // Reisen bleiben zusätzlich einzeln sichtbar, mit Hinweis auf den Vergleich
  if ((await cp.locator(".home-trip:not(.home-cmp) .ht-incmp", { hasText: "Chalet-Wochenende" }).count()) !== 3) fail("Varianten nicht als eigene Kacheln");
  await tile.locator(".hc-cmp-go").click();
  const cv = cp.locator(".cmpv");
  await cv.locator(".cv-table").waitFor();
  const head = await cv.locator(".cv-head").innerText();
  // Summen wie in der Reise: 214 + 1680 + 80 = 1974 €
  if (!head.includes("1.974 €") || !head.includes("2.656 €") || !head.includes("2.090 €")) fail("Summen im Vergleich: " + head.replace(/\n/g, " / "));
  if (!head.includes("Unterkunft +700") ) fail("Erklärung fehlt: " + head.replace(/\n/g, " / "));
  // Schaltflächen aller Spalten auf gleicher Höhe, auch in der günstigsten ohne Zusatzzeile (Desktop)
  const actsY = await cv.locator(".cv-head .cv-acts").evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
  if (actsY.length < 2 || new Set(actsY).size !== 1) fail("Schaltflächen im Vergleich nicht auf gleicher Höhe: " + actsY.join(","));
  // verschiedene Orte: alle Zeilen; „Nur Unterschiede“ blendet Erlebnisse (überall 80 €) aus
  if (!(await cv.locator(".cv-table [data-row=attractions]").count())) fail("Erlebnisse fehlen bei „alle Zeilen“");
  await cv.locator(".cv-mode .chip", { hasText: "Nur Unterschiede" }).click();
  if (await cv.locator(".cv-table [data-row=attractions]").count()) fail("gleiche Zeile bei „nur Unterschiede“");
  // Abstimmung über die Varianten (#432): im Vergleich starten, abstimmen, Stand in der Spalte und auf der Kachel, Ergebnis nehmen
  await cv.locator(".cv-poll-start .btn").click();
  const pv = cv.locator(".cv-poll .pv");
  await pv.waitFor();
  if ((await pv.locator("li").count()) !== 3) fail("Abstimmung nicht über alle drei Varianten");
  // „Ohne mich“ bei einer Variante (#439): Fenster mit Folgen an dieser Variante, danach in der Spalte
  await pv.locator("li", { hasText: "Ardennen Frankreich" }).locator(".pv-veto").click();
  await cp.locator(".modal .veto-pp").waitFor();
  await cp.locator(".modal .veto-ok").click();
  await cv.locator(".cv-var[data-var=v1] .cv-veto", { hasText: "ohne Anna" }).waitFor();
  await pv.locator("li", { hasText: "Ardennen Belgien" }).locator(".pv-for").click();
  await cv.locator(".cv-var[data-var=v2] .cv-votes", { hasText: "1 Stimme" }).waitFor();
  await cv.locator(".cv-back").click();
  await tile.locator(".hc-var", { hasText: "Ardennen Belgien" }).locator(".hc-votes", { hasText: "1 von 1" }).waitFor();
  await tile.locator(".hc-var", { hasText: "Ardennen Frankreich" }).locator(".hc-votes", { hasText: "✕ 1" }).waitFor();
  await tile.locator(".hc-cmp-go").click();
  await cv.locator(".cv-poll .poll-apply", { hasText: "„Ardennen Belgien“ nehmen" }).click();
  await cv.locator(".cv-picked", { hasText: "Ardennen Belgien" }).waitFor();
  if ((await cv.locator(".cv-head .cv-var").count()) !== 1) fail("andere Varianten nicht archiviert");
  await cv.locator(".cv-others", { hasText: "2 archivierte Varianten" }).click();
  if ((await cv.locator(".cv-head .cv-var").count()) !== 3) fail("archivierte Varianten nicht anzeigbar");
  if ((await cv.locator(".cv-head .cv-restore").count()) !== 2) fail("„Wiederherstellen“ fehlt an den archivierten Varianten");
  // umbenennen und herausnehmen über „⋯“
  await cv.locator(".cv-var[data-var=v3] .cv-menu").click();
  await cv.locator(".cv-var[data-var=v3] .cv-rename").click();
  await cv.locator(".cv-var[data-var=v3]", { hasText: "Eifel Monschau" }).waitFor();
  await cv.locator(".cv-var[data-var=v3] .cv-menu").click();
  await cv.locator(".cv-var[data-var=v3] .cv-remove").click();
  await until(async () => (await cv.locator(".cv-head .cv-var").count()) === 2, "Variante herausgenommen");
  await cv.locator(".cv-back").click();
  await tile.waitFor();
  const tt = await tile.innerText();
  if (!tt.includes("2 Varianten") || !(await tile.locator(".hc-vars").first().innerText()).includes("✓ Ardennen Belgien") || !(await tile.locator(".hc-arch").innerText()).includes("1 archivierte Variante")) fail("Kachel nach Wahl: " + tt.replace(/\n/g, " / "));
  if (!(await cp.locator(".home-trip:not(.home-cmp)", { hasText: "Monschau" }).count())) fail("herausgenommene Variante nicht als eigene Reise");
  if ((await cp.locator(".home-trip:not(.home-cmp) .ht-incmp").count()) !== 1) fail("archivierte Variante noch als eigene Kachel");
  // in der Reise: „Gewählt · 1 weitere Variante“, von dort zum Vergleich
  await tile.locator(".hc-var", { hasText: "Ardennen Belgien" }).click();
  await cp.locator(".hero .vbar", { hasText: "Gewählt · 1 weitere Variante" }).waitFor();
  await cp.locator(".hero .vb-cmp").click();
  await cv.locator(".cv-table").waitFor();
  // Handy: Kapitel untereinander mit Balken
  await cp.setViewportSize({ width: 390, height: 844 });
  await cv.locator(".cv-mob .cv-ch[data-row=stay]").waitFor();
  if ((await cv.locator(".cv-mob .cv-ch[data-row=stay] .cv-bar").count()) !== 1) fail("Handy: eingeklappt sollte eine Variante zeigen");
  // herausgenommene Reise wieder auf die Kachel ziehen, danach per ⇆ und Antippen
  await cp.setViewportSize({ width: 1280, height: 900 });
  await cv.locator(".cv-back").click();
  await tile.waitFor();
  await cp.locator(".home-trip:not(.home-cmp)", { hasText: "Monschau" }).dragTo(tile.locator(".hc-open"));
  await cv.locator(".cv-table").waitFor();
  await cv.locator(".cv-others").click();
  await until(async () => (await cv.locator(".cv-head .cv-var").count()) === 3, "Reise auf den Vergleich gezogen");
  await cv.locator(".cv-var[data-var=v3] .cv-menu").click();
  await cv.locator(".cv-var[data-var=v3] .cv-remove").click();
  await until(async () => (await cv.locator(".cv-head .cv-var").count()) === 2, "wieder herausgenommen");
  await cv.locator(".cv-back").click();
  await cp.locator(".ht-wrap", { hasText: "Monschau" }).locator(".ht-cmp").click();
  await cp.locator(".home-pick").waitFor();
  if (await cp.locator(".ht-wrap", { hasText: "Monschau" }).locator(".ht-pick").count()) fail("Reise selbst als Ziel angeboten");
  await cp.locator(".home-cmp-wrap .ht-pick").click();
  await cv.locator(".cv-table").waitFor();
  await cv.locator(".cv-others").click();
  await until(async () => (await cv.locator(".cv-head .cv-var").count()) === 3, "Reise per Antippen zum Vergleich");
  // archivierte Variante wiederherstellen
  await cv.locator(".cv-head .cv-restore").first().click();
  await until(async () => !(await cv.locator(".cv-head .cv-restore").count()), "Variante wiederhergestellt");
  // Vergleich trennen: alle wieder eigene Reisen
  await cv.locator(".cv-split").click();
  await until(async () => !(await cp.locator(".home-cmp").count()) && (await cp.locator(".home-trip:not(.home-cmp)").count()) === 3, "Vergleich getrennt");
  await vctx.close();
  log("Vergleich: Kachel mit 3 Varianten (günstigste markiert), Vergleichsansicht mit Summen wie in der Reise und Erklärung, nur Unterschiede, Abstimmung über die Varianten (Ohne mich mit Folgen an der Variante, Stand in Spalte und Kachel, Ergebnis nehmen), Diese nehmen (andere archiviert, wiederherstellbar), umbenennen, herausnehmen, „Gewählt“ in der Reise, Handy mit Kapiteln, Reise auf den Vergleich ziehen bzw. per ⇆ antippen, Vergleich trennen");
  }

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Einfacher Modus ok");
} finally { await browser.close(); server.kill(); }
