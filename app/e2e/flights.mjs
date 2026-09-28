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
  let asked = null;
  await p.route("https://flights.test/flights/search", async r => {
    asked = JSON.parse(r.request().postData());
    await new Promise(res => setTimeout(res, 300));
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(RESULT) });
  });
  await p.goto(URL);
  await p.locator(".modal .btn", { hasText: "Los geht's" }).click();
  await p.locator("#flights .fs-open").scrollIntoViewIfNeeded();
  await p.locator("#flights .fs-open").click();
  const m = p.locator(".modal");
  await m.locator("label", { hasText: "Von" }).locator("input").fill("DUS");
  await m.locator("label", { hasText: "Nach" }).locator("input").fill("SPU");
  await m.locator("label.f", { hasText: "Hin" }).locator("input").fill("2027-07-18");
  await m.locator("label", { hasText: "Zurück" }).locator("input").fill("2027-07-29");
  await m.locator(".fs-form .btn", { hasText: "Flüge suchen" }).click();
  await m.locator(".fs-res").first().waitFor();
  if (!asked || asked.from !== "DUS" || asked.ret !== "2027-07-29" || asked.adults !== 1) fail("Anfrage: " + JSON.stringify(asked));
  if ((await m.locator(".fs-res").count()) !== 2) fail("Treffer");
  const src = await m.locator(".fs-src").textContent();
  if (!src.includes("Kiwi.com: 2 Treffer") || !src.includes("Duffel: noch nicht eingerichtet")) fail("Quellen: " + src);
  if (!(await m.locator(".fs-res").first().locator(".btn", { hasText: "Hier buchen" }).isDisabled())) fail("Hier buchen sollte ausgegraut sein");
  log("Suche DUS → SPU: 2 Treffer von Kiwi.com, Duffel/Travelpayouts als „noch nicht eingerichtet“, „Hier buchen“ ausgegraut");

  await m.locator(".chip", { hasText: "Nur direkt" }).click();
  if ((await m.locator(".fs-res").count()) !== 1) fail("Filter direkt");
  await m.locator(".chip", { hasText: "Günstigste" }).click();
  await m.locator(".fs-res").nth(0).locator(".btn", { hasText: "Übernehmen" }).click();
  await m.locator(".fs-res").nth(1).locator(".btn", { hasText: "Übernehmen" }).click();
  await p.keyboard.press("Escape");
  const card = p.locator("#flights .card[data-item]");
  await card.first().waitFor();
  if ((await card.count()) !== 1) fail("ein Posten erwartet");
  const txt = await card.textContent();
  if (!txt.includes("Eurowings") || !txt.includes("DUS")) fail("Posten: " + txt.slice(0, 200));
  if (!txt.includes("2 Angebote")) fail("zwei Angebote erwartet: " + txt.slice(0, 200));
  log("Zwei Treffer übernommen: ein Flug-Posten mit 2 Angeboten, Eurowings direkt vorn");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
