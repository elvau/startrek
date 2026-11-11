/*
 * „App installieren“: Knopf in Fußzeile und Menü ⋯ nur, wenn der Browser installieren kann (beforeinstallprompt, hier
 * nachgestellt) oder auf iPhone/iPad (dort Anleitung statt Fenster); schon installiert kein Knopf. Dazu das Manifest.
 */
import { test, fail, log, URL, PHONE } from "../lib/test.mjs";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** Startseite am Handy; opts gehen an open (Browser-Kennung, Startzustand) */
async function start(open, opts = {}) {
  const p = await open({ ...PHONE, ...opts });
  await p.goto(URL);
  await p.locator(".foot .foot-info").waitFor();
  return p;
}

test("Manifest mit normalen und randlosen Symbolen", async ({ open }) => {
  const p = await start(open);
  const man = await p.evaluate(async () => (await fetch(document.querySelector("link[rel=manifest]").href)).json());
  if (man.display !== "standalone" || !man.icons.some(i => i.purpose === "maskable")) fail("Manifest");
  for (const i of man.icons) if (!(await p.request.get(URL + i.src)).ok()) fail("Symbol fehlt: " + i.src);
  log(`Manifest: ${man.icons.length} Symbole, davon ${man.icons.filter(i => i.purpose === "maskable").length} randlos`);
});

test("Browser meldet Installation: Knopf in Fußzeile und Menü ⋯, sonst keiner", async ({ open }) => {
  // ohne Meldung des Browsers kein Knopf; mit Meldung in Fußzeile und Menü, Klick öffnet das Fenster des Browsers
  const p = await start(open);
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
});

test("iPhone: Knopf zeigt die Anleitung", async ({ open }) => {
  const ios = await start(open, { userAgent: IPHONE, hasTouch: true, isMobile: true });
  await ios.locator(".foot-install").click();
  const m = ios.locator(".modal", { hasText: "Split&Fly als App" });
  await m.waitFor();
  if (!(await m.innerText()).includes("Zum Home-Bildschirm")) fail("Anleitung iPhone");
  await m.locator(".x").click();
  log("iPhone: Knopf zeigt die Anleitung (Teilen → Zum Home-Bildschirm)");
});

test("installierte App (eigenes Fenster): kein Knopf", async ({ open }) => {
  const app = await start(open, { userAgent: IPHONE, init: () => { navigator.standalone = true; } });
  if (await app.locator(".foot-install").count()) fail("Knopf in der installierten App");
  log("installiert: kein Knopf");
});
