/* Diagnose (vorläufig, Lauf 4 nach Deploy): Karte der Reise auf der Testumgebung – Anfragen an die Kacheln, Fehler der Konsole */
import { chromium } from "playwright";
const URL = "https://elvau.github.io/startrek/";
import { PNG } from "pngjs";
const trip = { id: "ams", name: "Amsterdam", place: "Amsterdam", country: "Niederlande", from: "2027-10-16", to: "2027-10-17", tiers: {}, households: {}, detail: { stay: true },
  settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, travelers: [{ id: "a", name: "A", household: "A" }],
  items: [{ id: "s", cat: "stay", name: "Unterkunft in Amsterdam", status: "idea", from: "2027-10-16", to: "2027-10-17",
    options: [{ id: "o", label: "Hotel", price: { mode: "unit", currency: "EUR", unit: 140 }, query: { place: "Amsterdam", checkin: "2027-10-16", checkout: "2027-10-17", adults: 1, childAges: [], rooms: 1 }, loc: { lat: 52.37, lon: 4.9, q: "Hotel, Amsterdam" } }] },
    { id: "s2", cat: "attractions", name: "Museum", status: "idea", options: [{ id: "o2", label: "Museum", price: { mode: "unit", currency: "EUR", unit: 20 }, loc: { lat: 52.36, lon: 4.885 } }] }] };
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: vp, locale: "de-DE" });
  await ctx.addInitScript(t => { localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: 1 }])); localStorage.setItem("rk2-current", t.id); }, trip);
  const p = await ctx.newPage();
  const tiles = { ok: 0, bad: [] }, other = [];
  p.on("console", m => { if (m.type() === "error" || m.type() === "warning") other.push(`console.${m.type()}: ${m.text().slice(0, 300)}`); });
  p.on("pageerror", e => other.push("pageerror: " + e.message.slice(0, 300)));
  p.on("requestfailed", r => { if (/openfreemap/.test(r.url())) tiles.bad.push(`FAILED ${r.url().slice(0, 160)} ${r.failure()?.errorText}`); });
  p.on("response", r => { if (/openfreemap/.test(r.url())) { if (r.status() < 400) tiles.ok++; else tiles.bad.push(`${r.status()} ${r.url().slice(0, 160)}`); } });
  await p.goto(URL);
  await p.locator(".start .home-trip", { hasText: "Amsterdam" }).first().click().catch(e => other.push("kein Reise-Eintrag: " + e.message.slice(0, 100)));
  await p.waitForTimeout(2000);
  await p.locator("#stay .tm-open").first().click().catch(e => other.push("kein Karten-Knopf: " + e.message.slice(0, 100)));
  await p.waitForTimeout(12000);
  // Farben im Bild der Karte: nur Hintergrund (eine Farbe) oder Kacheln (viele)
  try {
    const shot = PNG.sync.read(await p.locator(".trip-map .mapbox, .trip-map").first().screenshot());
    const colors = new Map();
    for (let i = 0; i < shot.data.length; i += 4 * 7) { const k = (shot.data[i] >> 3) + "," + (shot.data[i + 1] >> 3) + "," + (shot.data[i + 2] >> 3); colors.set(k, (colors.get(k) || 0) + 1); }
    const top = [...colors].sort((a, b) => b[1] - a[1]).slice(0, 4);
    other.push(`Farben: ${colors.size}, häufigste: ${JSON.stringify(top)}`);
  } catch (e) { other.push("kein Bild: " + e.message.slice(0, 100)); }
  const info = await p.evaluate(() => {
    const c = document.querySelector(".maplibregl-canvas");
    return { canvas: c ? `${c.width}x${c.height}` : "keins", pins: document.querySelectorAll(".map-pin").length, fail: !!document.querySelector(".map-fail, .map-err") };
  });
  console.log(`\n=== ${vp.width}x${vp.height}`, JSON.stringify(info), `Kacheln ok: ${tiles.ok}`);
  for (const b of tiles.bad.slice(0, 15)) console.log("  " + b);
  for (const o of [...new Set(other)].slice(0, 15)) console.log("  " + o);
  // erste Kachel- und Stil-URLs
  await ctx.close();
}
// Stil prüfen: welche Kachel-Version steht drin, gibt es sie?
const st = await (await fetch("https://tiles.openfreemap.org/styles/liberty")).json();
const src = Object.values(st.sources || {}).map(s => s.url || (s.tiles || [])[0]);
console.log("\nStil-Quellen:", JSON.stringify(src));
for (const u of src.filter(Boolean)) { const r = await fetch(u); console.log(u, r.status, r.headers.get("cache-control")); if (r.ok && u.endsWith("planet")) { const j = await r.json(); console.log("tiles:", JSON.stringify(j.tiles)); const t = j.tiles[0].replace("{z}", "10").replace("{x}", "525").replace("{y}", "336"); const tr = await fetch(t); console.log("Kachel z10:", tr.status, tr.headers.get("content-type"), tr.headers.get("cache-control")); } }
const sr = await fetch("https://tiles.openfreemap.org/styles/liberty"); console.log("Stil cache-control:", sr.headers.get("cache-control"));
await browser.close();
