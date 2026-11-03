/*
 * Handy-Ansicht (#530): Reise als Pager mit Reitern oben und Leiste unten (390 × 844, Touch).
 * Start: npm run test:cloud (nach den anderen)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { reloadHome, myTrips, startPage, quickTrip } from "./nav.mjs";

const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
async function until(fn, what, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  fail("Zeitüberschreitung: " + what);
}
const fam = (h, list) => list.map(([n, a], i) => ({ id: h + i, name: n, household: h, age: a }));
const P = (adult, child, infant) => ({ mode: "person", currency: "EUR", adult, child, infant: infant ?? child });
const TRIP = {
  id: "demo", name: "Kroatien mit Freunden", place: "Split", country: "Kroatien", from: "2027-07-17", to: "2027-07-24",
  travelers: [...fam("Klein", [["Anna", 38], ["Ben", 40], ["Mila", 9], ["Jonas", 6]]), ...fam("Hase", [["Lena", 36], ["Tom", 37], ["Emma", 4]])],
  households: { Klein: { plz: "50667", geo: { ort: "Köln", lat: 50.94, lon: 6.96 } }, Hase: { plz: "40213", geo: { ort: "Düsseldorf", lat: 51.23, lon: 6.78 } } },
  items: [
    { id: "f1", cat: "flights", name: "Flug Köln – Split", status: "chosen", options: [
      { id: "f1a", label: "Sun Air", price: P(139, 129, 29), source: { name: "Suche", at: "2027-01-10" }, legs: [
        { dir: "out", from: "CGN", to: "SPU", dep: "2027-07-17T06:10", arr: "2027-07-17T08:05", carrier: "Sun Air", stops: 0 },
        { dir: "back", from: "SPU", to: "CGN", dep: "2027-07-24T18:40", arr: "2027-07-24T20:35", carrier: "Sun Air", stops: 0 }] },
      { id: "f1b", label: "Blue Wings", price: P(112, 99, 29), legs: [
        { dir: "out", from: "DUS", to: "SPU", dep: "2027-07-17T11:30", arr: "2027-07-17T15:10", carrier: "Blue Wings", stops: 1 },
        { dir: "back", from: "SPU", to: "DUS", dep: "2027-07-24T09:20", arr: "2027-07-24T13:00", carrier: "Blue Wings", stops: 1 }] }] },
    { id: "s1", cat: "stay", name: "Ferienhaus mit Pool", status: "booked", from: "2027-07-17", to: "2027-07-24",
      options: [{ id: "s1a", label: "Villa Marina", price: { mode: "unit", basis: "night", currency: "EUR", unit: 245 }, stay: { stars: 4, rating: 92, nights: 7, board: "none" } }] },
    { id: "t1", cat: "transport", name: "Mietwagen (Van)", status: "idea", options: [{ id: "t1a", label: "7-Sitzer", price: { mode: "unit", currency: "EUR", unit: 420 } }] },
    { id: "a1", cat: "attractions", name: "Bootstour Hvar", status: "chosen", day: "2027-07-20", options: [{ id: "a1a", label: "Tagestour", price: P(55, 28, 0) }] },
    { id: "a2", cat: "attractions", name: "Krka-Wasserfälle", status: "idea", day: "2027-07-22", options: [{ id: "a2a", label: "Eintritt", price: P(40, 15, 0) }] },
    { id: "m1", cat: "misc", name: "Reiseversicherung", status: "paid", options: [{ id: "m1a", label: "Gruppe", price: P(24, 24, 24) }] }
  ],
  tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, days: {},
  detail: { flights: true, stay: true, transport: true, attractions: true, misc: true }
};
const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4183", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto("http://127.0.0.1:4183/");
  await reloadHome(p, { set: { "rk2-t:demo": TRIP, "rk2-index": [{ id: "demo", name: TRIP.name, place: TRIP.place }], "rk2-current": "demo" } });
  // Startseite (#533): Einstiege in zwei Spalten, Seite scrollt
  const acts = (await startPage(p)).locator(".home-acts .home-act");
  await acts.first().waitFor();
  const [a0, a1] = [await acts.nth(0).boundingBox(), await acts.nth(1).boundingBox()];
  if (Math.abs(a0.y - a1.y) > 4 || a1.x <= a0.x) fail("Startseite: Kacheln nicht nebeneinander");
  if (await p.evaluate(() => getComputedStyle(document.body).overflow === "hidden")) fail("Startseite scrollt nicht");
  // Fehler melden: auf der Startseite schwebt der 🐞-Knopf unten links
  if (!(await p.locator(".bug-fab").isVisible())) fail("Startseite: Fehler melden fehlt");
  if (await p.locator(".top-bug").count()) fail("Startseite: 🐞 in der Kopfzeile");
  // schwebende Knöpfe sitzen ganz unten (keine Leiste auf der Startseite) und lassen der Liste Platz zum Weiterscrollen (#553)
  for (const sel of [".bug-fab", ".ai-fab"]) {
    const fb = await p.locator(sel).boundingBox();
    if (!fb || fb.y + fb.height < 844 - 30) fail(`Startseite: ${sel} schwebt zu hoch über der Reiseliste: ` + JSON.stringify(fb));
  }
  if (!(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".start")).paddingBottom) >= 90))) fail("Startseite: kein Platz unter der Reiseliste für die schwebenden Knöpfe");
  log("Startseite: Einstiege in zwei Spalten, Seite scrollbar, Fehler melden unten links");
  // Weniger ist mehr (#640): höchstens eine Reise (Weiter planen), alle Reisen hinter der Kachel „Meine Reisen“
  if (await p.locator(".start .home-trip, .start .home-row, .start .home-sort").count()) fail("Startseite: Reiseliste noch sichtbar");
  if (!(await (await startPage(p)).locator(".start .home-cont").innerText()).includes("Kroatien")) fail("Startseite: zuletzt geöffnete Reise fehlt");
  if (!(await p.locator(".start .home-mine").innerText()).includes("1 Reise")) fail("Kachel „Meine Reisen“ ohne Anzahl");
  await p.locator(".start .home-mine").click();
  await p.locator(".start .hm-back").waitFor();
  if (await p.locator(".start .home-acts").count()) fail("Meine Reisen: Einstiege noch da");
  await p.locator(".start .hm-back").click();
  await p.locator(".start .home-acts").waitFor();
  log("Startseite: nur die zuletzt geöffnete Reise, alle Reisen hinter „Meine Reisen“ mit Rückweg");
  await (await myTrips(p)).locator(".home-trip", { hasText: "Kroatien" }).first().click();
  const on = () => p.locator(".mbar .mb.on").getAttribute("data-pg");
  await p.locator("main.pager").waitFor();
  if ((await p.locator(".mbar .mb").count()) !== 9) fail("Reiter: " + await p.locator(".mbar .mb").count());
  if (await on() !== "hero") fail("Start nicht auf der Übersicht");
  // iOS 27 zeichnete den Pager in einer 0 px hohen Ebene nicht (#612): .wrap darf in der Reise keine eigene Ebene sein
  if (await p.evaluate(() => { const s = getComputedStyle(document.querySelector(".wrap")); return s.position !== "static" || s.zIndex !== "auto"; })) fail(".wrap bildet eine eigene Ebene um den Pager");
  if (await p.locator(".mtabs").count()) fail("Reiter oben noch da");
  if (!/€/.test(await p.locator(".mbar .mb-tot").innerText())) fail("Gesamtsumme unten fehlt");
  // Kopfzeile: der Reisename ist lesbar (nicht nur ein Buchstabe), Anmelden nur als Symbol (#553)
  const nameW = (await p.locator("header.top .tm-name").boundingBox()).width;
  if (nameW < 120) fail("Reisename in der Kopfzeile zu schmal: " + nameW);
  // höchstens vier Bedienelemente oben (#662): Reisename, Wichtiges, Konto, ⋯
  const topN = await p.locator("header.top .top-in").evaluate(el => [...el.querySelectorAll("button, select, a")].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && !b.closest(".top-pop, .nav"); }).length);
  if (topN > 4) fail("Kopfzeile: " + topN + " Bedienelemente statt höchstens 4");
  if (await p.locator("header.top .tm-plus").isVisible()) fail("Kopfzeile: „+“ nimmt dem Reisenamen den Platz");
  log("Kopfzeile in der Reise: Reisename " + Math.round(nameW) + " px breit");
  // Lasche am Rand: auf der Übersicht nur „weiter“, antippen wechselt zur nächsten Seite, dann auch „zurück“; Anstupser einmal je Gerät
  if ((await p.locator(".mb-edge.prev").count()) || !(await p.locator(".mb-edge.next").count())) fail("Lasche am Rand der Übersicht");
  await p.locator(".mb-edge.next").click();
  await until(async () => (await on()) === "trav" && (await p.locator(".mb-edge.prev").count()) === 1, "Lasche wechselt zur nächsten Seite");
  await p.locator(".mb-edge.prev").click();
  await until(async () => (await on()) === "hero", "Lasche zurück zur Übersicht");
  await until(async () => (await p.evaluate(() => localStorage.getItem("sf-mob-nudged"))) === "1", "Anstupser gemerkt");
  log("Lasche am Rand zeigt die Nachbarseite und wechselt dorthin; Anstupser einmal je Gerät");
  // Fehler melden in der Reise: nicht schwebend (dort liegt die Leiste), sondern im ⋯-Menü (#662)
  if (await p.locator(".bug-fab").count()) fail("Fehler melden schwebt noch");
  await p.locator("header.top .top-more .tbtn").click();
  await p.locator("header.top .top-pop .top-bug").click();
  await p.locator(".modal", { hasText: "Fehler melden" }).waitFor();
  await p.keyboard.press("Escape");
  await until(async () => !(await p.locator(".modal", { hasText: "Fehler melden" }).count()), "Fehler melden schließen");
  if (await p.locator(".dock").count()) fail("alte Leiste unten noch da");
  // Übersicht: nichts ragt über den Bildschirmrand (langer Name, Kostenbox)
  const wide = await p.evaluate(() => [...document.querySelectorAll(".pg-hero *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && e.getBoundingClientRect().width > 40).map(e => e.className));
  if (wide.length) fail("Übersicht breiter als der Bildschirm: " + wide.join(", "));
  // Seite hat keine lange Seite mehr: Fenster scrollt nicht
  if ((await p.evaluate(() => document.documentElement.scrollHeight)) > 900) fail("Seite scrollt noch");
  // Leiste: Unterkunft
  await p.locator('.mbar [data-pg="stay"]').click();
  await until(async () => (await on()) === "stay", "Leiste Unterkunft");
  if (!(await p.locator('main.pager > [data-ch="stay"]').innerText()).includes("Ferienhaus mit Pool")) fail("Unterkunft: Posten fehlt");
  // wischen nach links: nächste Seite (erst, wenn der Sprung angekommen ist)
  await p.waitForTimeout(900);
  await p.evaluate(() => { const m = document.querySelector("main.pager"); m.scrollBy({ left: m.clientWidth }); });
  await until(async () => (await on()) === "transport", "wischen → Vor Ort");
  // Leiste: Tage, Abrechnung, Übersicht
  await p.locator('.mbar [data-pg="plan"]').click();
  await until(async () => (await on()) === "plan", "Leiste Tage");
  await p.locator('.mbar [data-pg="split"]').click();
  await until(async () => (await on()) === "split", "Leiste Abrechnung");
  await p.locator('.mbar [data-pg="hero"]').click();
  await until(async () => (await on()) === "hero", "Leiste Übersicht");
  // Kachel der Übersicht springt ins Kapitel
  await p.locator(".ht-tile.ht-st").click();
  await until(async () => (await on()) === "stay", "Kachel Unterkunft");
  // Posten kompakt (#531): eine Zeile, Antippen klappt auf, nur einer offen
  const stay = p.locator('main.pager > [data-ch="stay"]');
  const villa = stay.locator(".card[data-item=s1]");
  if (!(await villa.evaluate(e => e.classList.contains("compact")))) fail("Unterkunft nicht zugeklappt");
  if ((await villa.boundingBox()).height > 110) fail("zugeklappte Zeile zu hoch: " + (await villa.boundingBox()).height);
  if (!(await villa.innerText()).includes("1.792")) fail("Zeile ohne Preis: " + await villa.innerText());
  await villa.click();
  await until(async () => !(await villa.evaluate(e => e.classList.contains("compact"))), "Posten aufklappen");
  await villa.locator(".ic-fold").click();
  await until(async () => villa.evaluate(e => e.classList.contains("compact")), "Posten zuklappen");
  await p.locator('.mbar [data-pg="attractions"]').click();
  await until(async () => (await on()) === "attractions", "Reiter Erlebnisse");
  const att = p.locator('main.pager > [data-ch="attractions"]');
  await att.locator(".card[data-item=a1]").click();
  await att.locator(".card[data-item=a2]").click();
  await until(async () => (await att.locator(".card:not(.compact)").count()) === 1 && !(await att.locator(".card[data-item=a2]").evaluate(e => e.classList.contains("compact"))), "nur ein Posten offen");
  // Anbieter-Links erst auf „⋯“
  if (await att.locator(".fs-direct").isVisible()) fail("Anbieter-Links sichtbar ohne ⋯");
  await att.locator(".ch-links").click();
  if (!(await att.locator(".fs-direct").isVisible())) fail("⋯ zeigt keine Anbieter-Links");
  log("Posten zugeklappt als Zeile (Preis, Status), Antippen klappt auf, nur einer offen; Anbieter-Links hinter ⋯");
  // Abrechnung (#532): Familien als Karussell mit Reitern, Kasse und Zuschüsse dahinter
  await p.locator('.mbar [data-pg="split"]').click();
  await until(async () => (await on()) === "split", "Leiste Abrechnung");
  const sp = p.locator('main.pager > [data-ch="split"]');
  const shTabs = sp.locator(".sh-tab");
  if ((await shTabs.count()) !== 4) fail("Abrechnung: Reiter " + (await shTabs.allTextContents()).join(" | "));
  if (!(await shTabs.nth(0).innerText()).includes("Klein") || !(await shTabs.nth(1).innerText()).includes("Hase")) fail("Abrechnung: Familien in den Reitern");
  if (await sp.locator(".sh-cats details[open]").count()) fail("Abrechnung: Kapitel nicht zugeklappt");
  await shTabs.nth(1).click();
  await until(async () => (await sp.locator(".sh-tab.on").innerText()).includes("Hase"), "Reiter Hase");
  const hase = sp.locator("#hh-Hase");
  const vb = await sp.boundingBox();
  await until(async () => { const hb = await hase.boundingBox(); return hb.x >= vb.x - 2 && hb.x <= vb.x + 40; }, "Karussell zeigt Hase");
  await hase.locator(".sh-cats summary").first().click();
  if (!(await hase.locator(".sh-cats details[open] li").count())) fail("Kapitelzeile zeigt keine Posten");
  if ((await sp.evaluate(e => e.scrollHeight)) > 1300) fail("Abrechnung noch zu lang: " + await sp.evaluate(e => e.scrollHeight));
  log("Abrechnung: Familien als Karussell mit Beträgen in den Reitern, Kasse und Zuschüsse dahinter, Kapitel zugeklappt");
  // Mehr: Fehler melden, Kostenübersicht, Fußzeile
  await p.locator(".mbar .mb-tot").click();
  const sh = p.locator(".mb-sheet");
  await sh.waitFor();
  if (!(await sh.locator(".foot-legal").innerText()).includes("Impressum")) fail("Mehr: Fußzeile fehlt");
  await sh.locator(".sheet-x").click();
  // Reisewechsel (#612): Seiten weit unten gescrollt, auf „Abheben“, dann neue Reise über das Reise-Menü:
  // Übersicht mit Inhalt, jede Seite von oben, Kapitel und Hintergrund wieder auf der Übersicht
  await p.locator('.mbar [data-pg="flights"]').click();
  await until(async () => (await on()) === "flights", "Leiste Abheben");
  await p.evaluate(() => document.querySelectorAll("main.pager > .chapter").forEach(c => (c.scrollTop = 99999)));
  await p.locator("header.top .tmenu .tm-btn").click();
  await p.locator(".modal .btn.primary", { hasText: "Neue Reise" }).click();
  await quickTrip(p);
  await until(async () => (await on()) === "hero", "neue Reise auf der Übersicht");
  const st = await p.evaluate(() => ({ ch: document.body.dataset.ch, tops: [...document.querySelectorAll("main.pager > .chapter")].map(c => c.scrollTop) }));
  if (st.ch !== "hero") fail("Hintergrund noch vom vorigen Kapitel: " + st.ch);
  if (st.tops.some(y => y > 0)) fail("Seiten behalten den Scrollstand der vorigen Reise: " + st.tops.join(","));
  const h1 = await p.locator(".pg-hero h1").boundingBox();
  if (!h1 || h1.x < 0 || h1.x > 390 || h1.y < 0 || h1.y > 844) fail("Übersicht der neuen Reise nicht zu sehen");
  log("Reisewechsel am Handy: Übersicht mit Inhalt, jede Seite von oben, Hintergrund der Übersicht (#612)");
  // Kapitelköpfe (#631): in ru und ar ragt auf keiner Seite etwas über den Rand, bei 390 und 320 px Breite
  // Tippziele mindestens 44 px (#661): Kopf, Leiste und jede Seite; kleine Symbole zählen mit ihrer Fläche (::after).
  // Ausgenommen: Links im Fließtext und die Laschen am Rand (.mb-edge, dort wischt man)
  const smallTargets = pg => p.evaluate(pg => {
    const ch = document.querySelector(`main.pager > [data-ch="${pg}"]`);
    const els = [...document.querySelectorAll("header.top *, .mbar *"), ...(ch ? ch.querySelectorAll("*") : [])];
    const out = [];
    for (const el of els) {
      const tag = el.tagName, r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.disabled || el.closest(".mb-edge")) continue;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const inter = ["BUTTON", "SELECT", "SUMMARY", "TEXTAREA"].includes(tag) || (tag === "INPUT" && el.type !== "hidden") || (tag === "A" && el.href && !el.closest("p, small, .small, .muted, footer"));
      if (!inter) continue;
      let w = r.width, h = r.height;
      if ((el.type === "checkbox" || el.type === "radio") && el.closest("label")) { const l = el.closest("label").getBoundingClientRect(); w = l.width; h = l.height; }
      const a = getComputedStyle(el, "::after");
      if (a.content !== "none" && a.position === "absolute" && (parseFloat(a.top) < 0 || parseFloat(a.left) < 0)) { w -= parseFloat(a.left) + parseFloat(a.right); h -= parseFloat(a.top) + parseFloat(a.bottom); }
      if (w < 43.5 || h < 43.5) out.push(`${tag.toLowerCase()}.${String(el.className).split(" ")[0]} ${Math.round(w)}×${Math.round(h)} „${(el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 30)}“`);
    }
    return [...new Set(out)];
  }, pg);
  await p.setViewportSize({ width: 390, height: 844 });
  for (const pg of await p.locator(".mbar [data-pg]").evaluateAll(els => els.map(e => e.getAttribute("data-pg")))) {
    await p.locator(`.mbar [data-pg="${pg}"]`).click();
    await until(async () => (await on()) === pg, `Leiste ${pg}`);
    const small = await smallTargets(pg);
    if (small.length) fail(`Tippziele unter 44 px auf ${pg}: ` + small.join(" | "));
  }
  log("Tippziele: Kopf, Leiste und alle Seiten mindestens 44 px (#661)");
  // Leiste (#663): Verlauf am Rand, wo es weitergeht; schwebende Knöpfe beim Herunterscrollen weg, beim Hochscrollen da
  await p.locator('.mbar [data-pg="hero"]').click();
  await until(async () => (await on()) === "hero", "zurück zur Übersicht");
  await until(async () => await p.locator(".mbar .mb-row").evaluate(el => el.classList.contains("fade-e") && !el.classList.contains("fade-s")), "Verlauf rechts an der Leiste");
  const tall = await p.evaluate(() => [...document.querySelectorAll("main.pager > [data-ch]")].map(c => [c.dataset.ch, c.scrollHeight - c.clientHeight]).sort((a, b) => b[1] - a[1])[0]);
  if (!tall || tall[1] < 250) fail("keine Seite zum Scrollen: " + JSON.stringify(tall));
  await p.locator(`.mbar [data-pg="${tall[0]}"]`).click();
  // erst scrollen, wenn der Pager dort steht: sonst zählt sein Nachgleiten als Seitenwechsel und blendet die Knöpfe wieder ein
  const settled = k => p.evaluate(k => { const m = document.querySelector("main.pager"), c = m.querySelector(`:scope > [data-ch="${k}"]`); return !!c && Math.abs(m.scrollLeft - c.offsetLeft) < 2; }, k);
  await until(async () => (await on()) === tall[0] && await settled(tall[0]), "lange Seite");
  const scrollHero = y => p.evaluate(([y, k]) => { document.querySelector(`main.pager > [data-ch="${k}"]`).scrollTop = y; }, [y, tall[0]]);
  await scrollHero(80); await p.waitForTimeout(150); await scrollHero(240);
  await until(async () => p.evaluate(() => document.body.classList.contains("fab-hide")), "KI-Knopf beim Herunterscrollen weg");
  await p.waitForTimeout(150); await scrollHero(120);
  await until(async () => p.evaluate(() => !document.body.classList.contains("fab-hide")), "KI-Knopf beim Hochscrollen da");
  await scrollHero(0);
  log("Leiste mit Verlauf am Rand, schwebende Knöpfe weichen beim Herunterscrollen (#663)");

  for (const lang of ["ru", "ar"]) for (const width of [390, 320]) {
    await p.setViewportSize({ width, height: 844 });
    await p.evaluate(l => localStorage.setItem("rk-lang", l), lang);
    await p.reload();
    await p.locator(".mbar").waitFor();
    const pages = await p.locator(".mbar [data-pg]").evaluateAll(els => els.map(e => e.getAttribute("data-pg")));
    for (const pg of pages) {
      await p.locator(`.mbar [data-pg="${pg}"]`).click();
      await until(async () => (await on()) === pg, `${lang} ${width}: Leiste ${pg}`);
      // relativ zum Kapitel (der Pager scrollt seitlich); Kopf darf nicht breiter sein als das Kapitel
      const over = await p.evaluate(pg => {
        const ch = document.querySelector(`main.pager > [data-ch="${pg}"]`);
        const c = ch?.getBoundingClientRect(); if (!c) return ["Kapitel fehlt"];
        return [...ch.querySelectorAll(".ch-head *")]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > c.right + 1 || r.left < c.left - 1); }).map(e => e.className || e.tagName);
      }, pg);
      if (over.length) fail(`Kapitelkopf ${pg} (${lang}, ${width} px) ragt über den Rand: ` + over.join(", "));
    }
  }
  await p.evaluate(() => localStorage.removeItem("rk-lang"));
  log("Kapitelköpfe in ru und ar bei 390 und 320 px ohne Überlauf (#631)");

  // Geführte neue Reise (#672): Wohin (Suche), Wann (Ferien mit Regler), Wer (zwei Familien), Von wo (je Familie)
  await p.setViewportSize({ width: 390, height: 844 });
  for (const f of ["world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/holidays?cc=DE", r => r.fulfill({ json: { public: [], school: [
    { from: "2027-07-19", to: "2027-08-31", n: { de: "Sommerferien", en: "Summer holidays" }, nationwide: false, regions: ["DE-NW"] },
    { from: "2027-03-22", to: "2027-04-03", n: { de: "Osterferien", en: "Easter holidays" }, nationwide: false, regions: ["DE-BY"] }] } }));
  await reloadHome(p);
  await (await startPage(p)).locator(".start .home-new").click();
  const gt = p.locator(".modal .newtrip.gt");
  if ((await gt.locator(".gt-back").evaluate(e => getComputedStyle(e).visibility)) !== "hidden") fail("Geführt: Zurück auf der ersten Frage");
  await gt.locator(".gt-q").fill("Berl");
  await gt.locator(".gt-sugg button", { hasText: "Berlin" }).first().click();
  await gt.locator(".gt-next").click();
  if (await p.locator(".modal .nt-mode").count()) fail("Geführt: Leer/Importieren nach der ersten Frage");
  await gt.locator(".gt-seg button", { hasText: "Ferien" }).click();
  // Bundesland aus dem Wohnort der letzten Reise (Köln → NRW), nur dessen Ferien
  await gt.locator(".gt-hols .chip", { hasText: "Sommerferien" }).click();
  if (await gt.locator(".gt-hols .chip", { hasText: "Osterferien" }).count()) fail("Geführt: Ferien eines anderen Bundeslands");
  const range = () => gt.locator(".gt-range").innerText();
  if (!(await range()).includes("Sa 24.07. bis Sa 31.07.")) fail("Geführt: Vorgabe in den Ferien: " + await range());
  await gt.locator(".rs-in").nth(1).focus();
  for (let k = 0; k < 3; k++) await p.keyboard.press("ArrowRight");
  if (!(await range()).includes("10 Nächte")) fail("Geführt: Regler per Tastatur: " + await range());
  const small = await gt.evaluate(g => [...g.querySelectorAll("button, input, select")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 44 && !e.classList.contains("rs-in"); }).map(e => `${e.tagName}.${e.className}`));
  if (small.length) fail("Geführt: Tippziele unter 44 px: " + small.join(", "));
  await gt.locator(".gt-next").click();
  await gt.locator(".who-b", { hasText: "Familie" }).click();
  await gt.locator(".src-b", { hasText: "Mit Platzhalter-Tieren" }).click();
  await gt.locator(".qf .linkbtn").click();
  await gt.locator(".gt-next").click();
  // zwei Familien: erst „Alle vom selben Ort“, dann je Familie; die erste mit dem bekannten Wohnort
  await gt.locator(".gt-seg2 button", { hasText: "Von verschiedenen Orten" }).click();
  const homes = gt.locator(".gt-home input:not([type=hidden])");
  if ((await homes.count()) !== 2) fail("Geführt: Wohnort je Familie: " + await homes.count());
  if (!(await homes.first().inputValue()).includes("Köln")) fail("Geführt: bekannter Wohnort fehlt: " + await homes.first().inputValue());
  if (!(await gt.innerText()).includes("1 Familie noch ohne Startort")) fail("Geführt: offene Startorte nicht genannt");
  await gt.locator(".gt-next", { hasText: "Reise anlegen" }).click();
  await until(async () => (await p.locator(".pg-hero h1").innerText()).includes("Berlin"), "geführte Reise offen");
  const saved = () => p.evaluate(() => { const id = localStorage.getItem("rk2-current"); return JSON.parse(localStorage.getItem("rk2-t:" + id) || "null"); });
  await until(async () => (await saved())?.place === "Berlin", "geführte Reise gespeichert");
  const made = await saved();
  const hh = Object.values(made.households || {});
  if (made.from !== "2027-07-24" || made.to !== "2027-08-03") fail("Geführt: Zeitraum " + made.from + " bis " + made.to);
  if (made.travelers.length < 4 || !hh.some(h => h.geo?.ort === "Köln") || !hh.some(h => !h.geo && h.region === "DE-NW")) fail("Geführt: Familien und Wohnorte " + JSON.stringify(made.households));
  log("Geführte neue Reise: Ziel aus der Suche, Sommerferien NRW mit Regler, zwei Familien, Startort je Familie (#672)");
  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Handy: Pager mit 9 Seiten, Wischen, Leiste unten mit allen Seiten und Gesamtsumme (öffnet Mehr), Kachel springt ins Kapitel, kein langes Scrollen");
  console.log("\nHandy-Ansicht: alles in Ordnung");
} finally { await b.close(); server.kill(); }
