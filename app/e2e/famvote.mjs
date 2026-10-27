/*
 * Familie stimmt mit (#585): eine Familie mit drei Erwachsenen. Anna stimmt ab, das zählt auch für die beiden anderen
 * (abwählbar). Oma verknüpft sich später: Hinweis „Anna hat bisher für dich abgestimmt“, „Weiter wie Anna“ folgt Annas
 * Änderungen; eigene Stimme geht vor, „wieder wie Anna“ nimmt sie zurück. Termin finden: Omas Zeile wie Annas.
 * Start: npm run build:emu && firebase emulators:exec --only auth,firestore --project demo-reisekasse "node e2e/famvote.mjs"
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4176/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4176", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
async function person(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  p.on("dialog", d => d.accept());
  return p;
}
async function login(p, name) {
  await p.locator(".login .test input").fill(name);
  await p.locator(".login .test button").click();
  await p.locator(".acct-btn").first().waitFor({ timeout: 15000 });
}
async function until(fn, what, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn().catch(() => false)) return; await new Promise(r => setTimeout(r, 250)); }
  fail("Zeitüberschreitung: " + what);
}

try {
  // Anna legt eine Reise für eine Familie mit drei Erwachsenen an, übernimmt sie ins Konto und teilt sie
  const anna = await person("Anna");
  await anna.goto(URL + "?ziel=Rom&land=IT&name=Familie%20Rom&fam=3-0");
  await until(async () => (await anna.locator(".hero-in").textContent()).includes("Rom"), "Reise offen");
  await anna.locator(".top .acct .tm-btn", { hasText: "Anmelden" }).click();
  await login(anna, "Anna");
  await anna.locator(".top .acct-btn").click();
  await anna.locator(".tm-act", { hasText: "Ins Konto übernehmen" }).click();
  await until(async () => (await anna.locator(".top .tm-btn").textContent()).includes("☁"), "Reise im Konto");
  await anna.locator(".top .tm-btn").first().click();
  await anna.locator(".tm-act", { hasText: "Teilen und Mitglieder" }).click();
  await anna.locator(".modal .btn", { hasText: "Link erstellen" }).click();
  const link = await anna.locator(".linkbox input").inputValue();
  await anna.keyboard.press("Escape");
  await anna.locator(".modal").waitFor({ state: "detached" });

  // Anna stimmt ab: zählt auch für die beiden anderen Erwachsenen der Familie
  const atg = anna.locator("#together .tg");
  await atg.scrollIntoViewIfNeeded();
  await atg.locator(".poll-new").click();
  await atg.locator(".poll-q").fill("Was essen wir?");
  await atg.locator(".poll-opts").fill("Pizza\nPasta");
  await atg.locator(".poll-add").click();
  const apoll = atg.locator(".poll", { hasText: "Was essen wir?" });
  await apoll.locator(".pv-who .linkbtn").click();
  const awho = anna.locator(".modal", { hasText: "Wer bist du?" });
  await awho.locator(".who-p").first().click();
  await awho.locator("input").fill("Anna");
  await awho.locator(".who-ok").click();
  await awho.waitFor({ state: "detached" });
  await apoll.locator("li", { hasText: "Pizza" }).locator(".pv-for").click();
  await until(async () => (await apoll.locator("li", { hasText: "Pizza" }).innerText()).includes("3 Stimmen") && (await apoll.innerText()).includes("Alle haben abgestimmt."), "Annas Stimme zählt dreifach")
    .catch(async e => { console.log("ANNA:", (await apoll.innerText()).replace(/\s+/g, " ")); throw e; });
  if ((await apoll.locator(".ff-p").count()) !== 2) fail("„Zählt auch für“ nicht mit zwei Personen");
  // abwählen: die dritte Person fehlt dann
  const third = apoll.locator(".ff-p").nth(1);
  const thirdName = (await third.innerText()).replace("✓", "").trim();
  await third.click();
  await until(async () => (await apoll.innerText()).includes(`Noch nicht abgestimmt: ${thirdName}`) && (await apoll.locator("li", { hasText: "Pizza" }).innerText()).includes("2 Stimmen"), "abgewählt fehlt");
  log(`Zählt auch für: Annas Stimme gilt für die Familie (3 Stimmen), ${thirdName} abgewählt fehlt`);

  // Termin finden: Anna trägt ein, die Zeile der anderen zeigt dasselbe (👪)
  await atg.locator(".tg-open").click();
  await atg.locator(".tg-start").click();
  await atg.locator(".tg-view button", { hasText: "Raster" }).click();
  const row = (side, re) => side.locator("#together .tg-row", { has: side.locator(".tg-name", { hasText: re }) });
  await row(anna, /^Anna/).locator(".tg-c").first().click();

  // Oma tritt bei und verknüpft sich mit der zweiten Person: Hinweis, Familie zählt weiter
  const oma = await person("Oma");
  await oma.goto(link);
  await oma.locator(".modal h3", { hasText: "eingeladen" }).waitFor();
  await login(oma, "Oma");
  const owho = oma.locator(".modal", { hasText: "Wer bist du?" });
  await owho.waitFor();
  await owho.locator(".who-p").first().click();
  await owho.locator("input").fill("Oma");
  await owho.locator(".who-ok").click();
  await owho.waitFor({ state: "detached" });
  const otg = oma.locator("#together .tg");
  await otg.scrollIntoViewIfNeeded();
  const opoll = otg.locator(".poll", { hasText: "Was essen wir?" });
  await until(async () => (await otg.locator(".fb-ask").innerText()).includes("Anna hat bisher für dich abgestimmt") && (await opoll.locator(".pv-like").innerText()).includes("Zählt wie Anna"), "Hinweis bei Oma")
    .catch(async e => { console.log("OMA:", (await otg.innerText()).replace(/\s+/g, " ").slice(0, 900)); throw e; });
  await until(async () => (await row(anna, /^Oma/).locator(".tg-c").first().innerText()) === "✓" && (await row(anna, /^Oma/).locator(".tg-name").innerText()).includes("👪"), "Omas Zeile wie Annas");
  await otg.locator(".fb-keep").click();
  await until(async () => !(await otg.locator(".fb-ask").count()) && (await otg.locator(".fb-like select option:checked").innerText()) === "wie Anna", "Oma stimmt wie Anna");
  log("Oma verknüpft sich: Hinweis „Anna hat bisher für dich abgestimmt“, Zeile in Termin finden wie Annas, „Weiter wie Anna“");

  // Anna ändert ihre Stimme: Oma folgt
  await apoll.locator("li", { hasText: "Pasta" }).locator(".pv-for").click();
  await until(async () => (await opoll.locator("li", { hasText: "Pasta" }).locator(".pv-for").getAttribute("aria-pressed")) === "true"
    && (await apoll.locator("li", { hasText: "Pasta" }).innerText()).includes("2 Stimmen"), "Oma folgt Anna");
  // Oma stimmt selbst: ihre Stimme gilt (auch für die dritte Person, die nur Anna abgewählt hat), „wieder wie Anna“ nimmt sie zurück
  if (await opoll.locator(".ff-p", { hasText: "Anna" }).count()) fail("Oma kann Anna abwählen");
  await opoll.locator("li", { hasText: "Pizza" }).locator(".pv-for").click();
  await until(async () => (await apoll.locator("li", { hasText: "Pizza" }).innerText()).includes("2 Stimmen") && (await apoll.locator("li", { hasText: "Pasta" }).innerText()).includes("1 Stimme"), "Omas eigene Stimme bei Anna")
    .catch(async e => { console.log("ANNA:", (await apoll.innerText()).replace(/\s+/g, " ")); console.log("OMA:", (await opoll.innerText()).replace(/\s+/g, " ")); throw e; });
  await opoll.locator(".pv-again").click();
  await until(async () => (await apoll.locator("li", { hasText: "Pasta" }).innerText()).includes("2 Stimmen") && (await opoll.locator(".pv-like").innerText()).includes("Zählt wie Anna")
    && (await apoll.innerText()).includes(`Noch nicht abgestimmt: ${thirdName}`), "wieder wie Anna");
  log("Wie Anna: Oma folgt Annas Änderung, eigene Stimme geht vor (zählt auch für die dritte Person), „wieder wie Anna“ nimmt sie zurück");

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
