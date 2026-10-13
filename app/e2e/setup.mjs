/*
 * Konto einrichten (#160) gegen die Firebase-Emulatoren: Start von selbst beim ersten Öffnen, „Später“ merkt sich das;
 * angemeldet über das Kontomenü, KI-Text (Such-Dienst gemockt) füllt vor, sensible Angaben direkt, gespeichert;
 * danach persönliche Hinweise (#302) unter „Wichtiges“.
 * Start: npm run build:emu && npx firebase emulators:exec --only auth,firestore --project demo-reisekasse "node e2e/setup.mjs"
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4184/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4184", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
async function until(fn, what, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); }
  fail("Zeitüberschreitung: " + what);
}
async function page(name, auto) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  // automatisierte Browser starten den Assistenten nur auf Wunsch
  if (auto) await ctx.addInitScript(() => localStorage.setItem("rk2-setup-auto", "1"));
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  for (const f of ["world.json", "packs.json", "airports.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  return p;
}

try {
  // 1. erster Besuch ohne Konto: startet von selbst, ohne KI und ohne sensible Felder; „Später“ gilt dauerhaft
  const a = await page("ohne Konto", true);
  await a.goto(URL);
  await a.locator(".wz").waitFor({ timeout: 15000 });
  if (await a.locator(".wz-ai").count()) fail("KI ohne Konto angeboten");
  if (await a.evaluate(() => getComputedStyle(document.documentElement).overflowY) !== "hidden") fail("Hintergrund scrollt hinter dem Assistenten");
  await a.locator(".wz-manual").click();
  if (!(await a.locator(".wz-b", { hasText: "nur mit Konto" }).count())) fail("Hinweis auf sensible Felder nur mit Konto fehlt");
  if (await a.locator(".wz-gender").count()) fail("Geschlecht ohne Konto abgefragt");
  // Abflughäfen: die zwei nächsten zum Wohnort sind vorausgewählt, weitere als Vorschlag
  await a.locator(".wz-plz").fill("40210");
  await until(async () => (await a.locator(".wz label.plzf").textContent()).includes("Düsseldorf"), "Wohnort zur PLZ");
  for (let i = 0; i < 3; i++) await a.locator(".wz-next").click();
  await until(async () => (await a.locator(".wz-aps .chip.on").count()) === 2, "zwei Abflughäfen vorausgewählt");
  const onAps = await a.locator(".wz-aps .chip.on").allTextContents();
  if (!onAps.includes("DUS") || (await a.locator(".wz-aps .chip").count()) < 3) fail("Vorauswahl Abflughäfen: " + onAps);
  await a.locator(".wz .x").click();
  await a.reload();
  await a.waitForTimeout(2500);
  if (await a.locator(".wz").count()) fail("Assistent startet nach „Später“ erneut");
  log("ohne Konto: startet einmal von selbst, danach nicht mehr; Abflughäfen am Wohnort vorausgewählt");

  // 2. angemeldet: über das Kontomenü, mit KI-Text
  const b = await page("angemeldet", false);
  const asked = [];
  await b.route("https://flights.test/setup", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: cors });
    asked.push({ auth: r.request().headers()["authorization"] || "", body: JSON.parse(r.request().postData()) });
    await r.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({
      fields: { adults: 2, childAges: [6], license: "gt5", creditCard: true, car: { seats: 5, fuel: "diesel" }, styles: ["beach"], stayType: "whole",
        board: "half", airports: ["DUS"], holidays: "NW", nightsMin: 10, nightsMax: 14, pet: true, gender: "f", name: "Alex" }, remaining: 4 }) });
  });
  await b.goto(URL);
  await b.waitForTimeout(1500);
  if (await b.locator(".wz").count()) fail("Assistent startet im automatisierten Browser ungefragt");
  await b.locator(".top .acct .tm-btn", { hasText: "Anmelden" }).click();
  await b.locator(".login .test input").fill("Alex");
  await b.locator(".login .test button").click();
  await b.locator(".acct-btn").first().waitFor({ timeout: 15000 });
  await b.locator(".top .acct-btn").click();
  await b.locator(".tm-act.acct-setup").click();
  await b.locator(".wz-text").fill("Wir sind zu dritt, Kind 6, ab Düsseldorf, Ferienwohnung am Strand, Halbpension, Sommerferien NRW, 10–14 Nächte, mit Hund. Diesel, 5 Sitze.");
  await b.locator(".wz-ai-go").click();
  await b.locator(".wz-b[data-step=me]").waitFor();
  if (asked.length !== 1 || !asked[0].auth.startsWith("Bearer ") || Object.keys(asked[0].body).join() !== "text") fail("Anfrage an den Such-Dienst falsch: " + JSON.stringify(asked));
  if (!(await b.locator(".wz-note").textContent()).includes("vorbefüllt")) fail("Hinweis auf Vorbefüllung fehlt");
  // Geschlecht aus der KI-Antwort wird nicht übernommen
  if (await b.locator(".wz-gender .chip.on", { hasText: "weiblich" }).count()) fail("Geschlecht aus der KI übernommen");
  await b.locator(".wz label", { hasText: "Vorname" }).locator("input").fill("Alex");
  await b.locator(".wz label", { hasText: "Nachname" }).locator("input").fill("Klein");
  await b.locator(".wz .bd-d").selectOption("1");
  await b.locator(".wz .bd-m").selectOption("6");
  await b.locator(".wz .bd-y").fill("1990");
  await b.locator(".wz-plz").fill("40210");
  await until(async () => (await b.locator(".wz label.plzf").textContent()).includes("Düsseldorf"), "Wohnort zur PLZ");
  await b.locator(".wz-nat").selectOption("PL");
  await b.locator(".wz-gender .chip", { hasText: "divers" }).click();
  await b.locator(".wz-next").click();
  if ((await b.locator(".wz-lic .chip.on").textContent()).trim() !== "über 5 Jahre") fail("Führerschein nicht aus dem Text");
  if (!(await b.locator(".wz-fuel .chip.on").textContent()).includes("Diesel")) fail("Antrieb nicht aus dem Text");
  await b.locator(".wz-next").click();
  const names = b.locator(".wz-pfirst");
  if ((await names.count()) !== 2) fail("Mitreisende aus dem Text fehlen: " + (await names.count()));
  await names.nth(0).fill("Sam");
  await names.nth(1).fill("Mia");
  if ((await b.locator(".wz-group").inputValue()) !== "Familie") fail("Gruppe nicht vorbelegt");
  await b.locator(".wz-next").click();
  if (!(await b.locator(".wz .chip.on", { hasText: "Strand" }).count())) fail("Reisestil nicht aus dem Text");
  // Abflughafen aus dem Text bleibt allein gewählt, ein Vorschlag in der Nähe kommt per Antippen dazu
  if ((await b.locator(".wz-aps .chip.on").allTextContents()).join() !== "DUS") fail("Abflughafen nicht aus dem Text");
  await b.locator(".wz-aps .chip", { hasText: "CGN" }).click();
  await b.locator(".wz-skip").click();
  if ((await b.locator(".wz-hol").inputValue()) !== "NW") fail("Ferien nicht aus dem Text");
  await b.locator(".wz-next").click();
  if (!(await b.locator(".wz-pet").isChecked())) fail("Haustier nicht aus dem Text");
  await b.locator(".wz-next").click();
  const sum = await b.locator(".wz-sum").textContent();
  for (const x of ["Alex Klein", "Polen", "40210 Düsseldorf", "über 5 Jahre", "Familie", "Sam", "Mia", "Strand", "Nordrhein-Westfalen", "Haustier"]) if (!sum.includes(x)) fail(`Zusammenfassung ohne „${x}“: ${sum}`);
  await b.locator(".wz-done").click();
  await until(async () => !(await b.locator(".wz").count()), "Assistent zu");
  log("angemeldet: KI-Text vorbefüllt, sensible Angaben direkt, Zusammenfassung stimmt");

  // gespeichert: Personen, Gruppe, Vorlieben im Verzeichnis; Geschlecht und Staatsangehörigkeit nicht im Browser
  const dirJson = await b.evaluate(() => localStorage.getItem("rk2-dir") || "");
  const d = JSON.parse(dirJson);
  if (d.people.map(p => p.first).join() !== "Alex,Sam,Mia" || d.groups[0]?.name !== "Familie" || d.groups[0].memberIds.length !== 3) fail("Verzeichnis falsch: " + dirJson);
  if (d.people[0].birth !== "1990-06-01") fail("Geburtsdatum falsch: " + d.people[0].birth);
  if (!d.prefs?.styles?.includes("beach") || !d.prefs.pet || !d.setup || d.prefs.airports?.join() !== "DUS,CGN") fail("Vorlieben nicht gespeichert: " + JSON.stringify(d.prefs));
  const store = await b.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  if (/gender|nats|\\"PL\\"|lgbtq|divers/.test(store)) fail("sensible Angaben im Browser-Speicher");
  await b.waitForTimeout(2000);
  // neu laden: Geschlecht und Staatsangehörigkeit kommen aus dem Konto
  await b.reload();
  await b.locator(".top .acct-btn").click();
  await b.locator(".tm-act.acct-setup").click();
  await b.locator(".wz-manual").click();
  await until(async () => (await b.locator(".wz-gender .chip.on").count()) === 1 && (await b.locator(".wz-gender .chip.on").textContent()).includes("divers"), "Geschlecht aus dem Konto");
  if (!(await b.locator(".wz-b .chip.on", { hasText: "Polen" }).count())) fail("Staatsangehörigkeit nicht aus dem Konto");
  if ((await b.locator(".wz label", { hasText: "Vorname" }).locator("input").inputValue()) !== "Alex") fail("Name nicht wieder im Entwurf");
  log("Geschlecht und Staatsangehörigkeit im Konto (travelDocs), beim erneuten Öffnen wieder da");

  // 3. „Nur für dich“ (#302): divers → Hinweis zum Passeintrag „X“ für Ägypten, nur im Popup, ohne „gelesen“, nichts in der Reise
  await b.locator(".wz .x").click();
  await b.route("**/hinweise.json", r => r.fulfill({ path: "../public/hinweise.json" }));
  await b.evaluate(id => {
    const t = { id: "eg", name: "Kairo", place: "Kairo", country: "Ägypten", from: "2027-03-01", to: "2027-03-08", tiers: {}, households: {}, items: [],
      settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, travelers: [{ id: "a", name: "Alex", household: "Alex", personId: id }] };
    localStorage.setItem("rk2-t:eg", JSON.stringify(t));
    const ix = JSON.parse(localStorage.getItem("rk2-index") || "[]");
    localStorage.setItem("rk2-index", JSON.stringify([...ix, { id: "eg", name: t.name, place: t.place, from: t.from, to: t.to, people: 1 }]));
  }, d.people[0].id);
  await b.reload();
  await b.locator(".start .home-trip", { hasText: "Kairo" }).first().click();
  await b.locator(".hero h1").waitFor();
  await b.locator(".top .imp-btn").click();
  const own = b.locator(".modal .imp [data-personal]");
  await own.locator("[data-pers=x]").waitFor({ timeout: 15000 });
  const ownText = await own.innerText();
  if (!ownText.includes("Ägypten") || !ownText.includes("FCDO")) fail("Hinweis „X“ ohne Land bzw. Quelle: " + ownText);
  if (await own.locator("[data-pers=lgbt], [data-pers=women]").count()) fail("Hinweise ohne passende Angaben");
  if (await own.locator(".imp-persons").count()) fail("persönliche Hinweise mit „gelesen“");
  const saved = await b.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith("rk2-")).map(([, v]) => v).join());
  if (/xAny|pers\.|divers/.test(saved)) fail("persönliche Hinweise im Browser-Speicher bzw. in der Reise");
  log("„Nur für dich“: Hinweis zum Passeintrag „X“ aus dem Konto, nur im Popup, nichts in der Reise");

  if (errors.length) fail("Seitenfehler: " + errors.join(" | "));
  console.log("\n✓ Konto einrichten in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
