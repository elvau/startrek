/*
 * Ende-zu-Ende-Test gegen die Firebase-Emulatoren: zwei Personen planen gemeinsam.
 * Start: npm run test:cloud (baut mit Emulator-Konfiguration, startet Emulatoren und Vorschau)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4174/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
/** Stand in der Datenbank, am Emulator vorbei gelesen */
let tripId = "";
async function dbState(tag) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-reisekasse/databases/(default)/documents/trips/${tripId}`, { headers: { Authorization: "Bearer owner" } });
  const j = await r.json();
  const data = JSON.parse(j.fields?.data?.stringValue || "{}");
  const auto = (data.items || []).find(x => x.id === "auto");
  console.log(`  [db ${tag}] Mietwagen=${auto?.options?.[0]?.price?.unit} von=${j.fields?.updatedBy?.stringValue?.slice(0, 6)} zeit=${j.updateTime}`);
}

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4174", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  p.on("console", m => { if (m.text().startsWith("[rk]") || m.type() === "error") console.log(`  (${name}) ${m.text()}`); });
  return p;
}
const total = p => p.locator(".tk-top b").textContent();
async function login(p, name) {
  await p.locator(".login .test input").fill(name);
  await p.locator(".login .test button").click();
  await p.locator(".acct-btn").first().waitFor({ timeout: 15000 });
}
async function until(fn, what, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); }
  fail("Zeitüberschreitung: " + what);
}

try {
  // Anna meldet sich an und übernimmt ihre Reise ins Konto
  const anna = await person("Anna");
  await anna.goto(URL);
  // erster Besuch: Willkommen, Anna schaut sich das Beispiel an
  await anna.locator(".start .linkbtn", { hasText: "Beispielreise ansehen" }).click();
  await until(async () => (await anna.locator(".hero-in").textContent()).includes("Makarska"), "Beispielreise offen");
  if ((await anna.locator(".top .tm-btn").first().click(), await anna.locator(".tm-trip").count()) !== 1) fail("leere Reise nicht weggeräumt");
  await anna.keyboard.press("Escape");
  await anna.locator(".top .acct .tm-btn", { hasText: "Anmelden" }).click();
  await login(anna, "Anna");
  log("Anna angemeldet");
  await anna.locator(".top .acct-btn").click();
  await anna.locator(".tm-act", { hasText: "Ins Konto übernehmen" }).click();
  await until(async () => (await anna.locator(".top .tm-btn").textContent()).includes("☁"), "Reise im Konto");
  const before = await total(anna);
  tripId = await anna.evaluate(() => localStorage.getItem("rk2-current"));
  log("Reise im Konto, Summe", before);

  // Anna erstellt einen Einladungslink
  await anna.locator(".top .tm-btn").first().click();
  await anna.locator(".tm-act", { hasText: "Teilen und Mitglieder" }).click();
  await anna.locator(".modal .btn", { hasText: "Link erstellen" }).click();
  const link = await anna.locator(".linkbox input").inputValue();
  if (!link.includes("?join=")) fail("kein Link: " + link);
  log("Einladungslink erstellt");
  await anna.keyboard.press("Escape");

  // Oma öffnet den Link, meldet sich an und landet in der Reise
  const oma = await person("Oma");
  await oma.goto(link);
  await oma.locator(".modal h3", { hasText: "eingeladen" }).waitFor();
  await login(oma, "Oma");
  await until(async () => (await oma.locator(".top .tm-btn").first().textContent()).includes("☁"), "Oma hat die Reise im Konto");
  await until(async () => (await oma.locator(".hero-in").textContent()).includes("Makarska"), "Oma sieht die Reise");
  await until(async () => !(await oma.locator(".banner").count()), "Stand geladen");
  if ((await total(oma)) !== before) fail(`Oma sieht ${await total(oma)} statt ${before}`);
  log("Oma ist beigetreten und sieht dieselbe Summe");

  // Oma ändert den Mietwagen, Anna sieht es live
  await oma.locator("#transport .card", { hasText: "Mietwagen" }).scrollIntoViewIfNeeded();
  await oma.locator("#transport .card", { hasText: "Mietwagen" }).click({ position: { x: 40, y: 30 } });
  await oma.locator(".editor label", { hasText: "Preis" }).locator("input").fill("45");
  await oma.keyboard.press("Escape");
  const omaTotal = await total(oma);
  await dbState("nach Omas Eingabe");
  await new Promise(r => setTimeout(r, 1500));
  await dbState("1,5 s später");
  await until(async () => (await total(anna)) === omaTotal, `Anna sieht Omas Änderung (${omaTotal})`).catch(async e => { await dbState("Fehler"); console.log("  Anna:", await total(anna), "Oma:", await total(oma)); throw e; });
  log("Omas Änderung ist bei Anna angekommen:", omaTotal);
  await dbState("danach");

  // Anna macht Oma zur Zuschauerin
  await anna.locator(".top .tm-btn").first().click();
  await anna.locator(".tm-act", { hasText: "Teilen und Mitglieder" }).click();
  await anna.locator(".members li", { hasText: "Oma" }).locator("select").selectOption("viewer");
  await until(async () => (await oma.locator(".banner", { hasText: "nur an" }).count()) > 0, "Oma ist nur noch Zuschauerin");
  await oma.locator("#transport .card", { hasText: "Mietwagen" }).click({ position: { x: 40, y: 30 } });
  if (await oma.locator(".editor").count()) fail("Zuschauerin kann bearbeiten");
  log("Oma sieht nur noch zu und kann nichts bearbeiten");

  // Anna zieht den Link zurück; Mallory kommt nicht mehr hinein
  await anna.locator(".linkbtn", { hasText: "Link zurückziehen" }).click();
  await anna.locator(".modal .btn", { hasText: "Link erstellen" }).waitFor();
  await anna.keyboard.press("Escape");
  const mal = await person("Mallory");
  await mal.goto(link);
  await login(mal, "Mallory");
  await until(async () => (await mal.locator(".banner.err").count()) > 0, "Mallory wird abgewiesen");
  if ((await mal.locator(".top .tm-btn").first().textContent()).includes("☁")) fail("Mallory ist in der Reise");
  log("Zurückgezogener Link funktioniert nicht mehr");

  // Mallory löscht die offene Reise: danach die Startseite, keine andere Reise und keine leere im Konto (Fehlerbericht #13)
  mal.on("dialog", d => d.accept());
  await mal.locator(".top .tm-btn").first().click();
  await mal.locator(".tm-act", { hasText: "Diese Reise löschen" }).click();
  await mal.locator(".start .home-title").waitFor();
  if (await mal.locator(".home-cont").count()) fail("nach dem Löschen eine andere Reise zum Weiterplanen");
  await mal.locator(".top .acct-btn").click();
  if (await mal.locator(".acct-pop", { hasText: "nur auf diesem Gerät" }).count()) fail("Hinweis auf Gerät-Reise bleibt");
  await mal.keyboard.press("Escape");
  log("Offene Reise gelöscht: Startseite, keine andere Reise geöffnet, keine leere im Konto");

  // Neue Reise angemeldet: solo plant man als man selbst, nicht als Tier (Fehlerbericht #16)
  await mal.locator(".start .home-new").click();
  const whoLine = mal.locator(".modal .who-d p").first();
  if (!(await whoLine.textContent()).includes("Du planst als Mallory")) fail("Neue Reise solo: " + await whoLine.textContent());
  await whoLine.locator(".linkbtn", { hasText: "Lieber als Tier planen" }).click();
  if ((await whoLine.textContent()).includes("Mallory") && !(await whoLine.textContent()).includes("Als Mallory planen")) fail("als Tier: " + await whoLine.textContent());
  await whoLine.locator(".linkbtn", { hasText: "Als Mallory planen" }).click();
  await mal.keyboard.press("Escape");
  log("Neue Reise angemeldet: „Du planst als Mallory“, umschaltbar auf ein Tier");

  // Verzeichniseintrag ohne gespeicherte Reise (z. B. gelöschte Konto-Reise) zählt nicht als Reise auf dem Gerät
  await mal.evaluate(() => {
    const ix = JSON.parse(localStorage.getItem("rk2-index") || "[]");
    localStorage.setItem("rk2-index", JSON.stringify([...ix, { id: "verwaist", name: "Alt", place: "" }]));
  });
  await mal.reload();
  await mal.locator(".top .acct-btn").click();
  await mal.locator(".acct-pop").waitFor();
  if (await mal.locator(".acct-pop", { hasText: "nur auf diesem Gerät" }).count()) fail("verwaister Eintrag zählt als Reise auf dem Gerät");
  await mal.keyboard.press("Escape");
  log("Verwaiste Einträge zählen nicht als Reisen auf dem Gerät");

  // Konto-Reise, die dieses Gerät kannte, wurde auf einem anderen Gerät gelöscht: Eintrag und Kopie verschwinden
  // (sonst erschiene sie als „nur auf diesem Gerät“ und „Ins Konto übernehmen“ holte sie zurück).
  // Vorbereiten auf einer Seite ohne App: die laufende App räumte sonst schon währenddessen auf und überschriebe die gesehene Liste
  await mal.goto(URL + "icon.svg");
  await mal.evaluate(() => {
    const uid = Object.keys(localStorage).find(k => k.startsWith("rk2-cloud-seen:"))?.split(":")[1];
    if (!uid) throw new Error("keine gesehene Konto-Liste");
    const seen = JSON.parse(localStorage.getItem("rk2-cloud-seen:" + uid) || "[]");
    localStorage.setItem("rk2-cloud-seen:" + uid, JSON.stringify([...seen, "woanders-weg"]));
    const ix = JSON.parse(localStorage.getItem("rk2-index") || "[]");
    localStorage.setItem("rk2-index", JSON.stringify([...ix, { id: "woanders-weg", name: "Rom", place: "Rom" }]));
    localStorage.setItem("rk2-t:woanders-weg", JSON.stringify({ id: "woanders-weg", name: "Rom", place: "Rom", country: "", travelers: [{ id: "x", name: "Mal", household: "M" }],
      items: [{ id: "i", cat: "misc", name: "Eis", status: "idea", options: [{ id: "o", label: "Eis", price: { mode: "unit", currency: "EUR", unit: 10 } }] }], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } } }));
  });
  await mal.goto(URL);
  // fertig aufgeräumt erst, wenn auch der Verzeichniseintrag weg ist (die Kopie kann vorher schon fehlen)
  await until(async () => await mal.evaluate(() => !localStorage.getItem("rk2-t:woanders-weg") && !(localStorage.getItem("rk2-index") || "").includes("woanders-weg")), "Kopie und Eintrag der woanders gelöschten Reise weg");
  if (await mal.locator(".home-trip", { hasText: "Rom" }).count()) fail("woanders gelöschte Reise auf der Startseite");
  await mal.locator(".top .acct-btn").click();
  await mal.locator(".acct-pop").waitFor();
  if (await mal.locator(".acct-pop", { hasText: "nur auf diesem Gerät" }).count()) fail("woanders gelöschte Reise zählt als Reise auf dem Gerät");
  await mal.keyboard.press("Escape");
  log("Woanders gelöschte Konto-Reise: Eintrag und Kopie auf dem Gerät weggeräumt, kein „nur auf diesem Gerät“");

  // Neu laden: Anna hat die Reise weiter im Konto
  await dbState("vor Neuladen");
  await anna.reload();
  await anna.locator(".start .home-trip").first().click();
  await until(async () => (await anna.locator(".top .tm-btn").first().textContent()).includes("☁"), "nach Neuladen im Konto");
  await until(async () => (await total(anna)) === omaTotal, "nach Neuladen gleiche Summe").catch(async e => {
    console.log("Anna nach Neuladen:", await total(anna), await anna.evaluate(() => [localStorage.getItem("rk2-current"), document.querySelector(".banner")?.textContent]));
    throw e;
  });
  log("Nach dem Neuladen alles da");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
