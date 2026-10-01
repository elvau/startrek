/* Bildschirmfotos der Konto-Dialoge gegen die Emulatoren (nur zur Sichtprüfung) */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const OUT = process.env.OUT || ".";
const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4174", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 860 }, locale: "de-DE" });
  await p.goto("http://127.0.0.1:4174/"); await p.waitForTimeout(1200);
  await p.locator(".top .acct .tm-btn").click(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/e-login.png` });
  await p.locator(".login .test button").click();
  await p.locator(".top .acct-btn").waitFor();
  await p.locator(".top .acct-btn").click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/e-account.png` });
  await p.locator(".tm-act", { hasText: "Ins Konto übernehmen" }).click(); await p.waitForTimeout(1500);
  await p.locator(".top .tm-btn").first().click(); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/e-menu.png` });
  await p.locator(".tm-act", { hasText: "Teilen" }).click();
  await p.locator(".modal .btn", { hasText: "Link erstellen" }).click(); await p.waitForTimeout(800);
  await p.screenshot({ path: `${OUT}/e-share.png` });
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, locale: "de-DE" });
  await m.goto("http://127.0.0.1:4174/"); await m.waitForTimeout(1500);
  await m.screenshot({ path: `${OUT}/e-m-hero.png` });
} finally { await b.close(); server.kill(); }
