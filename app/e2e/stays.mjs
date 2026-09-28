/*
 * Unterkunftssuche in der App: Such-Dienst nachgestellt (keine echten Anbieter), Ergebnis übernehmen.
 * Start: npm run test:cloud (nach flights.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4176/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const RESULT = {
  offers: [
    { id: "booking:496993", source: "booking", sourceName: "Booking.com", name: "Rooms Šećer", total: 720, currency: "EUR", url: "https://www.booking.com/hotel/hr/sobe-a-eaer.html", score: 9.4, reviews: 416, stars: 1, place: "Split Stadtzentrum, Split", facts: ["Parkplatz", "Familienzimmer"] },
    { id: "trivago:c89342aae3a0", source: "trivago", sourceName: "Trivago", via: "Airbnb", name: "Ferienwohnung Klara", total: 783, currency: "EUR", url: "https://www.trivago.de/de/lm/klara", score: 9.4, reviews: 194, place: "Split, 0.9 km bis Zentrum", facts: ["Küche", "Parkplatz"] },
    { id: "trivago:9c4d6ea1f5e0", source: "trivago", sourceName: "Trivago", via: "Trip.com", name: "Cornaro Hotel", total: 2364, currency: "EUR", url: "https://www.trivago.de/de/lm/cornaro", score: 9.6, reviews: 4022, stars: 5, place: "Split, 0.4 km bis Zentrum" }
  ],
  sources: [
    { id: "booking", name: "Booking.com", configured: true, ok: true, count: 1, ms: 2100 },
    { id: "trivago", name: "Trivago", configured: true, ok: true, count: 2, ms: 1800 }
  ]
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4176", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [];
  await p.route("https://flights.test/stays/search", async r => {
    asked.push(JSON.parse(r.request().postData()));
    await new Promise(res => setTimeout(res, 200));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(RESULT) });
  });
  // Orts- und Flughafendaten des Artefakts (liegen auf der Seite eine Ebene über der App)
  for (const f of ["world.json", "packs.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await p.route("**/places/*.json", r => r.fulfill({ path: `../public/places/${r.request().url().split("/").pop()}` }));
  await p.goto(URL);
  await p.locator(".modal .btn", { hasText: "Los geht's" }).click();
  await p.locator("#stay .st-open").scrollIntoViewIfNeeded();
  await p.locator("#stay .st-open").click();
  const m = p.locator(".modal");

  // Ort und Daten eintragen, Art „Ganze Unterkunft“ ist Standard, beide Quellen an
  if (!(await m.locator(".chip.on", { hasText: "Ganze Unterkunft" }).count())) fail("Ganze Unterkunft nicht vorausgewählt");
  if ((await m.locator(".chip.on", { hasText: /Booking\.com|Trivago/ }).count()) !== 2) fail("nicht beide Quellen an");
  await m.locator("label.f", { hasText: "Ort" }).locator("input").fill("Split");
  await m.locator("label.f", { hasText: "Check-in" }).locator("input").fill("2027-07-18");
  await m.locator("label.f", { hasText: "Check-out" }).locator("input").fill("2027-07-25");
  if (!(await m.locator("p", { hasText: "7 Nächte" }).count())) fail("Nächte nicht angezeigt");
  const bk = await m.locator(".fs-direct a", { hasText: "Booking.com" }).getAttribute("href");
  if (!bk.includes("ss=Split") || !bk.includes("checkin=2027-07-18") || !bk.includes("checkout=2027-07-25")) fail("Booking-Link: " + bk);
  log("Direkt-Link zu Booking.com mit Ort und Daten");
  const gyg = p.locator("#attractions .fs-direct a", { hasText: "GetYourGuide" });
  if (await gyg.count()) fail("Erlebnis-Links ohne Reiseziel");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q = asked[0];
  if (q.place !== "Split" || q.checkin !== "2027-07-18" || q.checkout !== "2027-07-25" || q.type !== "whole" || q.adults !== 1 || q.rooms !== 1) fail("Anfrage falsch: " + JSON.stringify(q));
  if (q.sources.join() !== "booking,trivago") fail("Quellen falsch: " + q.sources);
  log("Anfrage an den Such-Dienst stimmt");

  const src = await m.locator(".fs-src").textContent();
  if (!src.includes("Booking.com: 1 Treffer") || !src.includes("Trivago: 2 Treffer")) fail("Quellen-Zeile: " + src);
  const first = m.locator(".fs-res").first();
  const t = await first.textContent();
  if (!t.includes("Rooms Šećer") || !t.includes("720") || !t.includes("103 € pro Nacht") || !t.includes("9,4 (416 Bew.)")) fail("Treffer: " + t);
  if (!(await m.locator(".fs-res", { hasText: "Ferienwohnung Klara" }).locator(".fs-badge", { hasText: "Trivago · Airbnb" }).count())) fail("Portal fehlt");
  log("Treffer mit Preis pro Nacht, Bewertung und Quelle");

  // nach Bewertung sortieren
  await m.locator(".chip", { hasText: "Beste Bewertung" }).click();
  if (!(await m.locator(".fs-res").first().textContent()).includes("Cornaro Hotel")) fail("Sortierung nach Bewertung");

  // zwei übernehmen → ein Posten mit 2 Angeboten, Preis für den ganzen Aufenthalt
  await m.locator(".fs-res", { hasText: "Ferienwohnung Klara" }).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".fs-res", { hasText: "Rooms Šećer" }).locator(".btn", { hasText: "Übernehmen" }).click();
  if ((await m.locator(".btn", { hasText: "✓ Übernommen" }).count()) !== 2) fail("Übernommen-Markierung");
  await m.locator(".x").click();
  const cards = p.locator("#stay .card", { hasText: "Unterkunft in Split" });
  if ((await cards.count()) !== 1) fail("Posten nicht angelegt");
  const c = await cards.textContent();
  if (!c.includes("2 Angebote") || !c.includes("7 Nächte")) fail("Posten: " + c);
  if (!c.includes("720")) fail("günstigstes Angebot nicht gewählt: " + c);
  log("Übernommen: ein Posten mit 2 Angeboten, günstigstes zählt");

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
  await p.evaluate(t => { localStorage.setItem("rk2-t:k1", JSON.stringify(t)); localStorage.setItem("rk2-index", JSON.stringify([{ id: "k1", name: t.name, place: t.place }])); localStorage.setItem("rk2-current", "k1"); }, TRIP);
  await p.reload();
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
  if (!pres.includes("So 18.07. 08:05 an") || !pres.includes("Do 29.07. 16:25 ab") || pres.includes("Hase")) fail("Anwesenheit: " + pres);
  if ((await m.locator("label.f", { hasText: "Check-in" }).locator("input").inputValue()) !== "2027-07-25") fail("Check-in nicht aus der Lücke");
  if ((await m.locator("label.f", { hasText: "Check-out" }).locator("input").inputValue()) !== "2027-07-29") fail("Check-out nicht aus der Lücke");
  const gg = await m.locator(".st-guests").textContent();
  if (!gg.includes("2 Gäste") || !gg.includes("1 Erw., 1 Kind (9 J.)")) fail("Gäste: " + gg);
  log("Suche aus der Lücke: 25.07. bis 29.07., 2 Gäste (Anna, Ben 9 J.), Anwesenheit laut Flug");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q2 = asked.at(-1);
  if (q2.checkin !== "2027-07-25" || q2.checkout !== "2027-07-29" || q2.adults !== 1 || q2.childAges.join() !== "9") fail("Anfrage aus der Lücke: " + JSON.stringify(q2));
  await m.locator(".fs-res").first().locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".x").click();
  await p.locator("#stay .pl-ok, #stay .pl-notes").first().waitFor();
  if ((await p.locator("#stay .pl-notes li.crit", { hasText: "Klein" }).count())) fail("Lücke für Klein noch da");
  log("Übernommen: Posten nur für Klein, 25.07. bis 29.07., Lücke weg");

  // Suche aus dem Posten heraus: Vergleich zum bisherigen Preis
  await p.locator("#stay .card:not(.plan-card)", { hasText: "Villa" }).click();
  await p.locator(".st-item").click();
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  if (!(await m.locator(".fs-res", { hasText: "Rooms Šećer" }).locator(".st-diff.good", { hasText: "−680 €" }).count())) fail("Vergleich zum bisherigen Preis fehlt");
  log("Suche aus dem Posten: 720 € ist 680 € günstiger als die Villa");
  await m.locator(".x").click();
  // Fehler von vorher: der offene Posten graute danach „Wer ist wann wo“ aus
  if (await p.evaluate(() => document.body.classList.contains("editing"))) fail("Posten nach der Suche noch offen, Plan ausgegraut");
  const op = await p.locator("#stay .plan-card").evaluate(el => getComputedStyle(el).opacity);
  if (op !== "1") fail("Plan ausgegraut: opacity " + op);
  log("Nach der Suche aus dem Posten ist der Plan nicht ausgegraut");

  // wie im Artefakt: sehr früher Rückflug weit weg vom Ziel → letzte Nacht am Flughafen, mit Orten in der Nähe
  const early = JSON.parse(JSON.stringify(TRIP));
  early.place = "Makarska";
  early.items[0].options[0].legs[1].dep = "2027-07-29T06:30";
  early.items.push({ id: "s2", cat: "stay", name: "Villa 2", status: "idea", from: "2027-07-25", to: "2027-07-29", participants: ["a", "b"], options: [{ id: "v2", label: "Villa 2", price: { mode: "unit", currency: "EUR", unit: 800, basis: "stay" } }] });
  await p.evaluate(t => localStorage.setItem("rk2-t:k1", JSON.stringify(t)), early);
  await p.reload();
  const apn = p.locator("#stay .pl-notes li", { hasText: "Letzte Nacht näher am Flughafen?" });
  await apn.waitFor();
  const at = await apn.textContent();
  if (!at.includes("06:30 ab SPU") || !at.includes("von Makarska") || !at.includes("Trogir")) fail("Vorschlag am Flughafen: " + at);
  log("Plan: Rückflug 06:30 ab SPU, von Makarska ca. 1 h → letzte Nacht am Flughafen, z. B. Trogir");
  await apn.locator(".linkbtn", { hasText: "Unterkunft am Flughafen suchen" }).click();
  if ((await m.locator("label.f", { hasText: "Check-in" }).locator("input").inputValue()) !== "2027-07-28") fail("Check-in nicht die letzte Nacht");
  const placeNow = await m.locator("label.f", { hasText: "Ort" }).locator("input").inputValue();
  if (!(await m.locator(".st-near .chip.on", { hasText: placeNow }).count())) fail("Ort am Flughafen nicht vorgewählt: " + placeNow);
  if (!(await m.locator(".st-near", { hasText: "Am Flughafen SPU" }).count())) fail("Orte am Flughafen fehlen");
  await m.locator(".st-near .chip", { hasText: "Trogir" }).click();
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const q3 = asked.at(-1);
  if (q3.place !== "Trogir" || q3.country !== "Croatia" || q3.checkin !== "2027-07-28" || q3.checkout !== "2027-07-29") fail("Anfrage am Flughafen: " + JSON.stringify(q3));
  log("Suche am Flughafen: Trogir, Croatia, eine Nacht 28.07. bis 29.07.");
  await m.locator(".x").click();

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  console.log("\nUnterkunftssuche: alles in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
