/*
 * „App installieren“: Knopf in Fußzeile und Menü ⋯ nur, wenn der Browser installieren kann (beforeinstallprompt, hier
 * nachgestellt) oder auf iPhone/iPad und Android (dort Anleitung statt Fenster, auf Android auch nach einem Versuch, #406);
 * schon installiert kein Knopf. Dazu das Manifest.
 * Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4181/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4181", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
const page = async (opts = {}, init) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE", ...opts });
  if (init) await ctx.addInitScript(init);
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  await p.goto(URL);
  await p.locator(".foot .foot-info").waitFor();
  return p;
};
try {
  // Manifest mit normalen und randlosen Symbolen
  const p = await page();
  const man = await p.evaluate(async () => (await fetch(document.querySelector("link[rel=manifest]").href)).json());
  if (man.display !== "standalone" || !man.icons.some(i => i.purpose === "maskable")) fail("Manifest");
  for (const i of man.icons) if (!(await p.request.get(URL + i.src)).ok()) fail("Symbol fehlt: " + i.src);
  log(`Manifest: ${man.icons.length} Symbole, davon ${man.icons.filter(i => i.purpose === "maskable").length} randlos`);

  // ohne Meldung des Browsers kein Knopf; mit Meldung in Fußzeile und Menü, Klick öffnet das Fenster des Browsers
  if (await p.locator(".foot-install").count()) fail("Knopf ohne beforeinstallprompt");
  await p.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => { window.__asked = (window.__asked || 0) + 1; };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    dispatchEvent(e);
  });
  await p.locator(".top-more .tbtn").click();
  await p.locator(".top-pop .top-install").waitFor();
  await p.locator(".top-more .tbtn").click();
  await p.locator(".foot-install").click();
  await p.waitForFunction(() => window.__asked === 1);
  await p.locator(".foot-install").waitFor({ state: "detached" });
  log("Browser meldet Installation: Knopf in Fußzeile und Menü ⋯, Klick öffnet das Fenster, danach weg");

  // iPhone: Anleitung
  const ios = await page({ userAgent: IPHONE, hasTouch: true, isMobile: true });
  await ios.locator(".foot-install").click();
  const m = ios.locator(".modal", { hasText: "Split&Fly als App" });
  await m.waitFor();
  if (!(await m.innerText()).includes("Zum Home-Bildschirm")) fail("Anleitung iPhone");
  await m.locator(".x").click();
  log("iPhone: Knopf zeigt die Anleitung (Teilen → Zum Home-Bildschirm)");

  // Android: mit Angebot das Fenster des Browsers, danach (Abbruch oder nicht angelegt) bleibt die Anleitung erreichbar
  const and = await page({ userAgent: ANDROID, hasTouch: true, isMobile: true });
  await and.evaluate(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => { window.__asked = (window.__asked || 0) + 1; };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    dispatchEvent(e);
  });
  await and.locator(".foot-install").click();
  await and.waitForFunction(() => window.__asked === 1);
  await and.locator(".foot-install").click();
  const ma = and.locator(".modal", { hasText: "Split&Fly als App" });
  await ma.waitFor();
  if (!(await ma.innerText()).includes("Zum Startbildschirm hinzufügen")) fail("Anleitung Android");
  await ma.locator(".x").click();
  await and.evaluate(() => dispatchEvent(new Event("appinstalled")));
  await and.locator(".foot-install").waitFor({ state: "detached" });
  log("Android: erst Fenster des Browsers, danach Anleitung (Menü ⋮); weg erst nach appinstalled");

  // schon installiert (eigenes Fenster): kein Knopf
  const app = await page({ userAgent: IPHONE }, () => { navigator.standalone = true; });
  if (await app.locator(".foot-install").count()) fail("Knopf in der installierten App");
  log("installiert: kein Knopf");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  console.log("\nApp installieren: alles in Ordnung");
} finally {
  await browser.close();
  server.kill();
}
