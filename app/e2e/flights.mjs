/*
 * Flugsuche in der App: Such-Dienst nachgestellt (keine echten Anbieter), Ergebnis übernehmen.
 * Start: npm run test:cloud (nach cloud.mjs und groups.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4175/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
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

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4175", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  const asked = [];
  await p.route("https://flights.test/flights/search", async r => {
    asked.push(JSON.parse(r.request().postData()));
    await new Promise(res => setTimeout(res, 200));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(RESULT) });
  });
  await p.goto(URL);
  await p.locator(".modal .btn", { hasText: "Los geht's" }).click();
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  const m = p.locator(".modal");

  // Abflughäfen: Standard 4, zwei abwählen → DUS und NRN
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
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  if (asked.length !== 2 || asked.map(a => a.from).join() !== on.slice(0, 2).join()) fail("Anfragen je Flughafen: " + JSON.stringify(asked.map(a => a.from)));
  const a0 = asked[0];
  if (a0.depart !== "2027-07-15" || a0.latest !== "2027-07-29" || a0.nightsMin !== 7 || a0.nightsMax !== 12 || a0.maxStops !== 1 || a0.bags !== true || a0.selfTransfer !== false || a0.ret)
    fail("Anfrage: " + JSON.stringify(a0));
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

  // wieder 20:00, feste Daten mit ± Tagen prüfen, dann übernehmen
  await m.locator(".fs-mode .chip", { hasText: "Feste Daten" }).click();
  await m.locator("label", { hasText: "Hin am" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Rück am" }).locator("input").fill("2027-07-29");
  await m.locator("label", { hasText: "± Tage" }).locator("select").selectOption("2");
  await m.locator(".fs-form .btn.primary").click();
  await m.locator(".fs-res").first().waitFor();
  const f = asked.at(-1);
  if (f.ret !== "2027-07-29" || f.flexDays !== 2 || f.latest) fail("feste Anfrage: " + JSON.stringify(f));
  await m.locator(".chip", { hasText: "Nur direkt" }).click();
  if ((await m.locator(".fs-res").count()) !== 2) fail("Filter direkt (je Flughafen einer)");
  await m.locator(".chip", { hasText: "Günstigste" }).click();
  await m.locator(".fs-res").nth(0).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".fs-cmp .btn", { hasText: "Wählen" }).nth(1).click();
  await p.keyboard.press("Escape");
  const card = p.locator("#flights .card[data-item]");
  await card.first().waitFor();
  if ((await card.count()) !== 1) fail("ein Posten erwartet");
  const txt = await card.textContent();
  if (!txt.includes("Eurowings") || !txt.includes("2 Angebote")) fail("Posten: " + txt.slice(0, 200));
  log("Feste Daten ± 2 Tage; zwei Treffer übernommen (Liste und „Wählen“ in der Tabelle): ein Flug-Posten mit 2 Angeboten");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
