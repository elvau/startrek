// Echte Screenshots für die Anleitung aus der gebauten App (dist-emu) mit einer Demo-Reise.
// Aufruf (in app/): npm run build:emu && node e2e/anleitung-shots.mjs <Zielordner>
// Ergebnis: JPEG je Ansicht plus spots.json (Lage der nummerierten Markierungen in Prozent). Nach app/src/lib/guide/shots/ legen.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const out = process.argv[2];
if (!out) throw new Error("Zielordner fehlt");
mkdirSync(out, { recursive: true });
const URL = "http://127.0.0.1:4181/";
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
const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4181", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

/** Markierungen je Bild: Schlüssel → Suche nach Text (exakt oder RegExp), Reihenfolge = Nummer */
const SPOTS = {
  home: { neu: "Neue Reise", event: "Zu einem Event", ki: "Mit KI planen", ideen: "Reiseideen", reise: /Kroatien mit Freunden/, fuss: /Neues & Ausblick/ },
  trav: { personen: /^7 Personen/, familien: /Familien: Wohnort/i, termin: /Termin finden/, abst: /Abstimmung/ },
  flights: { modus: "Detailliert", suche: /Flüge suchen/, anreise: /Bahn 10 €/, vergleich: /Angebote vergleichen/ },
  stay: { suche: /Unterkunft suchen/, plan: "Wer ist wann wo", status: "Gebucht", aufteilung: /Aufteilung/ },
  transport: { status: "Idee", posten: /\+ Posten/ },
  attractions: { tabs: /Touren & Tickets/, status: "Gewählt", aufteilung: /Aufteilung/ },
  plan: { kalender: /Tagesplan in den Kalender/, tag: /^Tag 1/, eintrag: /\+ Eintrag/ },
  split: { familie: "Klein", fest: /Gebucht/, personen: "Anna", zeile: "Flüge" }
};
const spots = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: "de-DE", deviceScaleFactor: 1.5 });
  await ctx.addInitScript(t => {
    if (localStorage.getItem("rk2-index")) return;
    localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
    localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 7 }]));
    localStorage.setItem("rk2-current", t.id);
  }, TRIP);
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.waitForTimeout(1500);
  // feste Knöpfe (Fehler melden, Assistent) und Leiste stören in Ausschnitten
  await p.addStyleTag({ content: ".bug-fab,.ai-fab,.dock,header.top{display:none!important}" });
  const rect = (loc) => loc.evaluate(e => { const g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; });
  /** Ausschnitt aufnehmen und Markierungen in Prozent des Ausschnitts ablegen */
  async function shot(name, clip, scope = p) {
    await p.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 84, fullPage: true, clip });
    spots[name] = { w: Math.round(clip.width), h: Math.round(clip.height), spots: [] };
    for (const [key, q] of Object.entries(SPOTS[name] || {})) {
      const hits = scope.getByText(q, typeof q === "string" ? { exact: true } : {});
      const n = await hits.count();
      for (let i = 0; i < n; i++) {
        const r = await rect(hits.nth(i));
        if (!r.w || r.y < clip.y || r.y + r.h > clip.y + clip.height) continue;
        // links neben den Text, am Rand rechts daneben (Pin soll nichts verdecken)
        const left = r.x - 20 - clip.x, px = left >= 16 ? left : r.x + r.w + 20 - clip.x;
        spots[name].spots.push({ key, x: +((px / clip.width) * 100).toFixed(1), y: +(((r.y + r.h / 2 - clip.y) / clip.height) * 100).toFixed(1) });
        break;
      }
    }
    console.log("ok", name, spots[name].spots.length + "/" + Object.keys(SPOTS[name] || {}).length);
  }
  await shot("home", { x: 0, y: 270, width: 1100, height: 700 });
  await p.locator(".home-trip", { hasText: "Kroatien" }).first().click();
  await p.waitForTimeout(1800);
  for (const id of ["trav", "flights", "stay", "transport", "attractions", "misc", "plan", "split"]) {
    const el = p.locator("#" + id).first();
    await el.scrollIntoViewIfNeeded();
    await p.waitForTimeout(900);
    // ab Kapitelüberschrift (Abrechnung: ab erster Familie), höchstens 1100 px hoch (Seitenkoordinaten)
    const r = await p.evaluate(sel => {
      const e = document.querySelector(sel), h = (sel === "#split" ? e.querySelector(".sh-head")?.parentElement : e.querySelector(".ch-head")) || e, b = e.getBoundingClientRect(), t = h.getBoundingClientRect();
      return { x: b.x + scrollX, y: t.y + scrollY - (sel === "#split" ? 6 : 20), w: b.width, bottom: b.bottom + scrollY };
    }, "#" + id);
    await shot(id, { x: r.x, y: r.y, width: r.w, height: Math.min(r.bottom - r.y, 1100) }, el);
  }
} finally { await browser.close(); server.kill(); }
import { writeFileSync } from "node:fs";
writeFileSync(`${out}/spots.json`, JSON.stringify(spots, null, 1));
