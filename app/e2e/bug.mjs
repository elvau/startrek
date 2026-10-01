/*
 * Fehler melden (Beta): 🐞 unten links, ohne Anmeldung nur Hinweis, dann Beschreibung und Bild;
 * Umgebung und letzte Fehler gehen mit. Danach die Admin-Ansicht (Nutzung der Kontingente) im Kontomenü.
 * Such-Dienst nachgestellt. Start: npm run test:cloud
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4182/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };

// kleines PNG (1×1) als Bildschirmfoto
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4182", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => { if (!e.message.includes("Testfehler")) errors.push(e.message); });
  const sent = [];
  await p.route("https://flights.test/bug", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" } });
    const buf = r.request().postDataBuffer();
    const type = r.request().headers()["content-type"];
    // Formular im Test auseinandernehmen
    const parts = await (await new Response(buf, { headers: { "content-type": type } }).formData());
    const img = parts.get("image");
    sent.push({ auth: r.request().headers()["authorization"] || "", report: JSON.parse(parts.get("report")), img: img ? { type: img.type, size: img.size, head: [...new Uint8Array(await img.arrayBuffer()).slice(0, 3)] } : null });
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, number: 12, remaining: 4 }) });
  });
  await p.goto(URL);
  await p.locator(".start .home-title").waitFor();

  // ein Fehler im Browser, der der Meldung beiliegen soll
  await p.evaluate(() => setTimeout(() => { throw new Error("Testfehler beim Rechnen"); }));
  await p.waitForTimeout(200);

  // ohne Anmeldung: nur Hinweis, Anmelden daraus
  await p.locator(".bug-fab").click();
  await p.locator(".modal .bug .btn.primary", { hasText: "Anmelden" }).click();
  await p.locator(".login .test input").fill("Kira");
  await p.locator(".login .test button").click();
  await p.locator(".top .acct-btn").waitFor({ timeout: 15000 });
  log("Ohne Anmeldung nur Hinweis, Anmeldung daraus");

  // Meldung mit Bild
  await p.locator(".bug-fab").click();
  await p.locator(".modal .bug textarea").fill("Bei 3 Personen steht 7 € pro Person\nmüssten 6,67 € sein");
  await p.locator(".modal .bug input[type=file]").setInputFiles({ name: "bild.png", mimeType: "image/png", buffer: PNG });
  await p.locator(".modal .bug-img img").waitFor();
  await p.locator(".modal .bug-send").click();
  await p.locator(".modal .bug-done", { hasText: "#12" }).waitFor();
  const s = sent[0];
  if (!s.auth.startsWith("Bearer ") || s.auth.length < 30) fail("kein Anmelde-Nachweis");
  if (!s.report.text.startsWith("Bei 3 Personen") || s.report.lang !== "de" || s.report.view !== "Startseite" || !s.report.screen.includes("×") || !s.report.version) fail("Meldung: " + JSON.stringify(s.report));
  if (!s.report.errors.some(e => e.includes("Testfehler beim Rechnen"))) fail("letzter Fehler fehlt: " + JSON.stringify(s.report.errors));
  if (!s.img || s.img.type !== "image/jpeg" || s.img.head.join(",") !== "255,216,255") fail("Bild nicht als JPEG verkleinert: " + JSON.stringify(s.img));
  log("Meldung gesendet: Text, Ansicht, Sprache, Bildschirm, App-Stand, letzter Fehler im Browser, Bild als JPEG; Danke mit Nummer #12");

  // schließen und neu: Formular ist leer
  await p.locator(".modal .bug .btn.primary").click();
  await p.locator(".bug-fab").click();
  if ((await p.locator(".modal .bug textarea").inputValue()) !== "") fail("Formular nicht geleert");
  await p.keyboard.press("Escape");
  log("Nach dem Senden ist das Formular wieder leer");

  // Admin: Eintrag im Kontomenü nur, wenn der Such-Dienst zustimmt; Zahlen mit Warnstufe
  let isAdmin = false;
  const days = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"];
  await p.route("https://flights.test/admin/usage**", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" } });
    const headers = { "access-control-allow-origin": "*" };
    if (!isAdmin) return r.fulfill({ status: 403, contentType: "application/json", headers, body: JSON.stringify({ error: "Kein Zugriff" }) });
    if (r.request().url().includes("check")) return r.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({ admin: true }) });
    await r.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify({
      at: "2026-09-30T12:00:00Z", days, errors: {}, config: { agentDaily: 5, bugDaily: 5, model: "gemini-3.8-flash", fallback: "", geminiPerDay: 0 },
      worker: { requests: [10, 20, 30, 40, 50, 60, 95000], errors: [0, 0, 0, 0, 0, 0, 1], subrequests: [0, 0, 0, 0, 0, 0, 0] },
      r2: { bytes: 2048, objects: 1, classA: 3, classB: 4 },
      series: [
        { kind: "api", name: "app.ticketmaster.com", detail: "", byDay: [0, 0, 0, 0, 0, 1, 12] },
        { kind: "route", name: "flights", detail: "", byDay: [0, 0, 0, 0, 0, 0, 4] },
        { kind: "route", name: "flights", detail: "hit", byDay: [0, 0, 0, 0, 0, 0, 2] }
      ]
    }) });
  });
  await p.locator(".top .acct-btn").click();
  await p.locator(".acct-pop").waitFor();
  await p.waitForTimeout(500);
  if (await p.locator(".acct-usage").count()) fail("Admin-Eintrag ohne Freigabe");
  // Freigabe wird je Anmeldung einmal geprüft: neu anmelden
  isAdmin = true;
  await p.locator(".acct-pop .tm-act", { hasText: "Abmelden" }).click();
  await p.locator(".top .tm-btn", { hasText: "Anmelden" }).click();
  await p.locator(".login .test input").fill("Kira");
  await p.locator(".login .test button").click();
  await p.locator(".top .acct-btn").click();
  await p.locator(".acct-usage").click();
  await p.locator(".modal .usage .usage-card[data-id=workers].lv-high .barrel").waitFor();
  const text = await p.locator(".modal .usage").innerText();
  for (const s of ["95\u2009%", "95.000", "100.000 pro Tag", "fast ausgeschöpft", "Ticketmaster", "5.000 pro Tag", "Flugsuche", "aus dem Zwischenspeicher: 2", "Firestore"]) if (!text.includes(s)) fail(`Admin-Ansicht ohne „${s}“: ${text}`);
  await p.keyboard.press("Escape");
  log("Admin-Ansicht: Eintrag nur mit Freigabe, Worker-Aufrufe über 90 % rot, Anbieter mit Grenze, Treffer im Zwischenspeicher");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("Fehler melden ok");
} finally { await browser.close(); server.kill(); }
