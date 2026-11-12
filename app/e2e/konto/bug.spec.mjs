/*
 * Fehler melden (Beta): 🐞 unten links, ohne Anmeldung nur Hinweis, dann Beschreibung und Bild;
 * Umgebung und letzte Fehler gehen mit. Danach die Admin-Ansicht (Nutzung der Kontingente) im Kontomenü und
 * „Mein Konto zurücksetzen“.
 * Such-Dienst nachgestellt. Start: npm run test:cloud
 */
import { test, fail, log, settle, reply, URL, startPage, login, adminGet, adminPut, AUTH, PROJECT } from "../lib/konto.mjs";

// kleines PNG (1×1) als Bildschirmfoto
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Kira meldet sich an (Dialog „Anmelden“ ist offen) */
const kiraIn = p => login(p, "Kira");

test("Meldung mit Bild, Umgebung und letztem Fehler; Fenster schließt nicht aus Versehen", async ({ open }) => {
  // der Testfehler gehört zum Ablauf (liegt der Meldung bei)
  const p = await open({ ignore: /Testfehler/ });
  const sent = [];
  await p.route("https://flights.test/bug", async r => {
    if (r.request().method() === "OPTIONS") return reply(r);
    const buf = r.request().postDataBuffer();
    const type = r.request().headers()["content-type"];
    // Formular im Test auseinandernehmen
    const parts = await (await new Response(buf, { headers: { "content-type": type } }).formData());
    const img = parts.get("image");
    sent.push({ auth: r.request().headers()["authorization"] || "", report: JSON.parse(parts.get("report")), img: img ? { type: img.type, size: img.size, head: [...new Uint8Array(await img.arrayBuffer()).slice(0, 3)] } : null });
    await reply(r, { ok: true, number: 12, remaining: 4 });
  });
  await p.goto(URL);
  await (await startPage(p)).locator(".start .home-title").waitFor();

  // ein Fehler im Browser, der der Meldung beiliegen soll
  const thrown = p.waitForEvent("pageerror");
  await p.evaluate(() => setTimeout(() => { throw new Error("Testfehler beim Rechnen"); }));
  await thrown;

  // ohne Anmeldung: nur Hinweis, Anmelden daraus
  await p.locator(".bug-fab").click();
  await p.locator(".modal .bug .btn.primary", { hasText: "Anmelden" }).click();
  await kiraIn(p);
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
  if (!s.report.nav?.some(e => /^\d\d:\d\d:\d\d geladen: \w+/.test(e))) fail("Reisewechsel fehlen: " + JSON.stringify(s.report.nav));
  if (!s.img || s.img.type !== "image/jpeg" || s.img.head.join(",") !== "255,216,255") fail("Bild nicht als JPEG verkleinert: " + JSON.stringify(s.img));
  log("Meldung gesendet: Text, Ansicht, Sprache, Bildschirm, App-Stand, letzter Fehler im Browser, Reisewechsel, Bild als JPEG; Danke mit Nummer #12");

  // schließen und neu: Formular ist leer
  await p.locator(".modal .bug .btn.primary").click();
  await p.locator(".bug-fab").click();
  if ((await p.locator(".modal .bug textarea").inputValue()) !== "") fail("Formular nicht geleert");

  // aus Versehen daneben: mit Eingaben schließt ein Klick auf den Hintergrund nicht (Hinweis), Rausziehen nie
  const bg = p.locator(".modal-bg");
  const ta = p.locator(".modal .bug textarea");
  await ta.fill("Halb geschrieben");
  await bg.click({ position: { x: 5, y: 5 } });
  if (!(await p.locator(".modal .bug textarea").count()) || (await ta.inputValue()) !== "Halb geschrieben") fail("Fenster mit Eingaben durch Danebenklicken geschlossen");
  await p.locator(".modal-hint", { hasText: "Schließen mit × oder Esc" }).waitFor({ timeout: 2000 }).catch(() => fail("Hinweis zum Schließen fehlt"));
  const tb = await ta.boundingBox();
  await p.mouse.move(tb.x + 20, tb.y + 10); await p.mouse.down(); await p.mouse.move(5, 5, { steps: 5 }); await p.mouse.up();
  if (!(await p.locator(".modal .bug textarea").count())) fail("Rausziehen hat das Fenster geschlossen");
  await p.locator(".modal .x").click();
  // leer: Rausziehen schließt trotzdem nicht, Danebenklicken schließt wie gewohnt
  await p.locator(".bug-fab").click();
  const tb2 = await p.locator(".modal .bug textarea").boundingBox();
  await p.mouse.move(tb2.x + 20, tb2.y + 10); await p.mouse.down(); await p.mouse.move(5, 5, { steps: 5 }); await p.mouse.up();
  if (!(await p.locator(".modal .bug textarea").count())) fail("Rausziehen hat das leere Fenster geschlossen");
  await p.locator(".modal-bg").click({ position: { x: 5, y: 5 } });
  if (await p.locator(".modal .bug").count()) fail("leeres Fenster schließt nicht beim Danebenklicken");
  log("Danebenklicken: mit Eingaben bleibt das Fenster offen (Hinweis), Rausziehen schließt nie, leer schließt es");
  await p.keyboard.press("Escape");
  log("Nach dem Senden ist das Formular wieder leer");
});

/** Such-Dienst für die Admin-Ansicht nachstellen; state.admin: der Dienst gibt das Konto frei */
async function mockUsage(p, state) {
  const days = ["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"];
  await p.route("https://flights.test/admin/usage**", async r => {
    if (r.request().method() === "OPTIONS") return reply(r);
    if (!state.admin) return reply(r, { error: "Kein Zugriff" }, 403);
    if (r.request().url().includes("check")) return reply(r, { admin: true });
    await reply(r, {
      at: "2026-09-30T12:00:00Z", days, errors: {}, config: { agentDaily: 5, bugDaily: 5, model: "gemini-3.8-flash", fallback: "", geminiPerDay: 0, partnerLinks: true },
      worker: { requests: [10, 20, 30, 40, 50, 60, 95000], errors: [0, 0, 0, 0, 0, 0, 1], subrequests: [0, 0, 0, 0, 0, 0, 0] },
      r2: { bytes: 2048, objects: 1, classA: 3, classB: 4 },
      series: [
        { kind: "api", name: "app.ticketmaster.com", detail: "", byDay: [0, 0, 0, 0, 0, 1, 12] },
        { kind: "route", name: "flights", detail: "", byDay: [0, 0, 0, 0, 0, 0, 4] },
        { kind: "route", name: "flights", detail: "hit", byDay: [0, 0, 0, 0, 0, 0, 2] },
        { kind: "click", name: "viator", detail: "activity", byDay: [0, 0, 0, 0, 1, 0, 2] }
      ]
    });
  });
}

/** Startseite, Kira angemeldet */
async function signedIn(open, state) {
  const p = await open();
  await mockUsage(p, state);
  await p.goto(URL);
  await (await startPage(p)).locator(".start .home-title").waitFor();
  await p.locator(".top .tm-btn", { hasText: "Anmelden" }).click();
  await kiraIn(p);
  return p;
}

test("Admin-Ansicht: Eintrag im Kontomenü nur mit Freigabe, Zahlen mit Warnstufe, Klicks und Partnerliste", async ({ open }) => {
  const state = { admin: false };
  const p = await signedIn(open, state);
  // beim ersten Öffnen des Kontomenüs fragt die App die Freigabe ab: erst nach der Antwort zählt, dass der Eintrag fehlt
  const checked = p.waitForResponse(r => r.url().includes("/admin/usage?check"));
  await p.locator(".top .acct-btn").click();
  await p.locator(".acct-pop").waitFor();
  await (await checked).finished();
  await settle(p);
  if (await p.locator(".acct-usage").count()) fail("Admin-Eintrag ohne Freigabe");
  // Freigabe wird je Anmeldung einmal geprüft: neu anmelden
  state.admin = true;
  await p.locator(".acct-pop .tm-act", { hasText: "Abmelden" }).click();
  await p.locator(".top .tm-btn", { hasText: "Anmelden" }).click();
  await kiraIn(p);
  await p.locator(".top .acct-btn").click();
  await p.locator(".acct-usage").click();
  await p.locator(".modal .usage .usage-card[data-id=workers].lv-high .barrel").waitFor();
  const text = await p.locator(".modal .usage").innerText();
  for (const s of ["95\u2009%", "95.000", "100.000 pro Tag", "fast ausgeschöpft", "Ticketmaster", "5.000 pro Tag", "Flugsuche", "aus dem Zwischenspeicher: 2", "Firestore"]) if (!text.includes(s)) fail(`Admin-Ansicht ohne „${s}“: ${text}`);
  // Klicks und Partnerliste: Viator mit aktiver Kennung und 3 Klicks, Booking.com neutral
  if (!text.includes("Klicks auf Anbieter-Links") || !text.includes("Viator · activity")) fail("Admin-Ansicht ohne Klicks: " + text);
  const vi = await p.locator(".modal .pt tr[data-id=viator]").innerText();
  if (!vi.includes("Kennung aktiv") || !vi.includes("Erlebnisse") || !vi.includes("direkt") || !/\b3\b/.test(vi)) fail("Partnerliste Viator: " + vi);
  if (!(await p.locator(".modal .pt tr[data-id=booking]").innerText()).includes("neutral")) fail("Partnerliste Booking.com nicht neutral");
  log("Admin-Ansicht: Eintrag nur mit Freigabe, Worker-Aufrufe über 90 % rot, Anbieter mit Grenze, Treffer im Zwischenspeicher, Klicks und Partnerliste");
});

test("Mein Konto zurücksetzen: eigene Daten gelöscht, geteilte Reise verlassen, Gerät leer", async ({ open }) => {
  const p = await signedIn(open, { admin: true });
  await p.locator(".top .acct-btn").click();
  await p.locator(".acct-usage").click();
  // eigene Reise, geteilte Reise, Aktionsseite, Personen und travelDocs im Emulator anlegen
  const users = await (await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: "POST", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: "{}" })).json().catch(() => ({}));
  const kira = (users.userInfo || users.users || []).find(u => u.displayName === "Kira")?.localId;
  if (!kira) fail("Konto Kira im Emulator nicht gefunden: " + JSON.stringify(users).slice(0, 200));
  const tj = (id, name) => JSON.stringify({ id, name, place: "Split", country: "Kroatien", travelers: [{ id: "a", name: "Kira", household: "Kira" }], items: [], tiers: {}, settings: { adultAge: 12, childAge: 2, rates: { EUR: 1 } } });
  await adminPut("trips/reset-own", { name: "Eigene", data: tj("reset-own", "Eigene"), owner: kira, memberIds: [kira], members: { [kira]: "owner" }, memberNames: { [kira]: "Kira" } });
  await adminPut("trips/reset-shared", { name: "Geteilt", data: tj("reset-shared", "Geteilt"), owner: "jemand", memberIds: ["jemand", kira], members: { jemand: "owner", [kira]: "editor" }, memberNames: { jemand: "Jemand", [kira]: "Kira" } });
  await adminPut("campaigns/reset-camp", { owner: kira, title: "Aktion" });
  await adminPut(`profiles/${kira}`, { data: "{}" });
  await adminPut(`travelDocs/${kira}`, { data: "{}" });
  await p.evaluate(() => { localStorage.setItem("rk-theme", "dark"); localStorage.setItem("rk2-dir", "{}"); });
  const um = p.locator(".modal .usage");
  await um.locator(".adm-reset-btn").click();
  await um.locator(".adm-reset-go").click();
  await um.locator(".adm-reset-done").waitFor({ timeout: 15000 });
  const done = await um.locator(".adm-reset-done").innerText();
  if (!done.includes("Reisen gelöscht: 1") || !done.includes("verlassen: 1, Aktionsseiten gelöscht: 1")) fail("Zurücksetzen: " + done);
  for (const path of ["trips/reset-own", "campaigns/reset-camp", `profiles/${kira}`, `travelDocs/${kira}`]) if (!(await adminGet(path)).error) fail("nach dem Zurücksetzen noch da: " + path);
  const all = await adminGet("trips?pageSize=300");
  const mine = (all.documents || []).filter(d => d.fields?.owner?.stringValue === kira || (d.fields?.memberIds?.arrayValue?.values || []).some(v => v.stringValue === kira));
  if (mine.length) fail("nach dem Zurücksetzen noch Reisen mit Kira: " + mine.map(d => d.fields?.name?.stringValue).join(", "));
  const shared = await adminGet("trips/reset-shared");
  if (shared.fields.memberIds.arrayValue.values.some(v => v.stringValue === kira) || !shared.fields.members.mapValue.fields.jemand) fail("geteilte Reise nicht verlassen: " + JSON.stringify(shared.fields.memberIds));
  const left = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("rk")));
  if (left.length) fail("auf dem Gerät noch: " + left.join(", "));
  await um.locator(".adm-reset-reload").click();
  await p.locator(".top .acct-btn").waitFor();
  log("Konto zurücksetzen: eigene Reise, Aktionsseite, Personen und travelDocs gelöscht, geteilte Reise verlassen, Gerät leer, weiter angemeldet");
});
