/*
 * KI-Planer: ohne Anmeldung nur der Hinweis, nach der Anmeldung Wunsch schicken (Such-Dienst nachgestellt),
 * Vorschlag übernehmen. Start: npm run test:cloud (braucht den Auth-Emulator)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4178/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };
const until = async (fn, what, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 150)); } fail("Zeit abgelaufen: " + what); };
const leg = (from, to, dep, arr) => ({ from, to, fromCity: from, toCity: to, dep, arr, minutes: 150, stops: 0, route: [from, to], carriers: ["Sun Air"], flights: ["SA1"] });
const RESULT = {
  remaining: 4,
  trips: [
    { title: "Sonne in Palma", summary: "Kurzer Flug, Altstadt und Strand.", place: "Palma", country: "Spanien", from: "2027-05-07", to: "2027-05-10", total: 1080,
      flight: { id: "kiwi:x1", source: "kiwi", sourceName: "Kiwi.com", price: 480, currency: "EUR", url: "https://kiwi.com/u/x1",
        out: leg("DUS", "PMI", "2027-05-07T08:00:00", "2027-05-07T10:30:00"), back: leg("PMI", "DUS", "2027-05-10T18:00:00", "2027-05-10T20:30:00") },
      stay: { id: "b:1", source: "booking", sourceName: "Booking.com", name: "Casa Palma", total: 600, currency: "EUR", score: 8.7, place: "Altstadt" },
      stayQuery: { place: "Palma", country: "Spain", checkin: "2027-05-07", checkout: "2027-05-10", adults: 1, childAges: [], rooms: 1, type: "all", currency: "EUR" },
      board: "half", transport: { label: "Mietwagen 3 Tage", eur: 120 }, extras: [{ name: "Bootstour", eur: 80 }] },
    { title: "Lissabon", summary: "Stadt am Meer.", place: "Lissabon", from: "2027-05-14", to: "2027-05-17", total: 350,
      flight: { id: "kiwi:x2", source: "kiwi", sourceName: "Kiwi.com", price: 350, currency: "EUR",
        out: leg("DUS", "LIS", "2027-05-14T07:00:00", "2027-05-14T09:30:00"), back: leg("LIS", "DUS", "2027-05-17T19:00:00", "2027-05-17T23:00:00") } }
  ]
};

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4178", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
try {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  p.on("pageerror", e => errors.push(e.message));
  for (const f of ["world.json", "packs.json", "airports.json"]) await p.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  const asked = [];
  await p.route("https://flights.test/agent", async r => {
    if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" } });
    const body = JSON.parse(r.request().postData());
    asked.push({ auth: r.request().headers()["authorization"] || "", body });
    await new Promise(res => setTimeout(res, body.prompt?.includes("langsam") ? 6500 : 300));
    // Strandurlaub mit Kindern: erst eine Rückfrage, nach der Antwort Vorschläge für die Familie
    // offene Reise: Antwort mit Änderungen (eigene Anreise statt Flug)
    if (body.current) {
      const fl = body.current.items.find(i => i.cat === "flights");
      const edit = { reply: "Ich ersetze den Flug durch die Anreise mit dem Auto.", estimates: [{ cat: "transport", name: "Anreise mit dem Auto", eur: 300, replaces: fl?.id }] };
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ trips: [], edit, remaining: 1 }) });
    }
    // Mannschaftsfahrt: 10 Personen, Flüge in Buchungen zu 2 Plätzen
    if (body.prompt.includes("Mannschaftsfahrt")) {
      const t = RESULT.trips[0];
      const trip = { ...t, title: "Mannschaftsfahrt Cala Rajada", party: { adults: 10, childAges: [], infants: 0 }, bookings: [{ offer: t.flight, seats: 2, travelers: 10 }], total: 2400 + 600 };
      return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ trips: [trip], remaining: 1 }) });
    }
    const beach = body.prompt.includes("Strandurlaub");
    const out = beach && !body.asked ? { trips: [], question: "Von wo fliegt ihr los und wie alt sind die Kinder?", options: ["Köln, Kinder 5 und 8", "Düsseldorf, Kinder 3 und 10"], remaining: 3 }
      : beach ? { ...RESULT, remaining: 2, trips: RESULT.trips.map(x => ({ ...x, party: { adults: 2, childAges: [5, 8], infants: 0 } })) } : RESULT;
    await r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(out) });
  });
  // Bildschirmfotos zur Sichtprüfung: SHOTS=<Ordner> node e2e/agent.mjs
  const shot = async (name, w = 1280, h = 900) => {
    if (!process.env.SHOTS) return;
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(400);
    await p.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
    await p.setViewportSize({ width: 1280, height: 900 });
  };
  await p.goto(URL);

  // Startseite: KI-Knopf unten rechts; ohne Anmeldung nur der Hinweis mit Anmelde-Knopf
  await p.locator(".start .home-title").waitFor();
  await shot("home");
  await p.locator(".ai-fab").click();
  const c = p.locator(".ai-chat");
  await c.locator(".ai-login").waitFor();
  if (await c.locator(".ai-bar").count()) fail("Eingabe ohne Anmeldung sichtbar");
  await c.locator(".ai-login .btn").click();
  await p.locator(".login .test input").fill("Kira");
  await p.locator(".login .test button").click();
  await p.locator(".top .acct-btn").waitFor({ timeout: 15000 });
  log("Chat unten rechts: ohne Anmeldung nur Hinweis, Anmeldung daraus");

  // Beispiel antippen schickt den Wunsch; Anfrage mit Anmelde-Nachweis und Reisenden
  await c.locator(".ai-ex .chip").first().click();
  await c.locator(".ai-card").first().waitFor();
  const a = asked[0];
  if (!a.auth.startsWith("Bearer ") || a.auth.length < 30) fail("kein Anmelde-Nachweis mitgeschickt");
  if (!a.body.prompt.includes("Wochenende") || a.body.lang !== "de" || a.body.adults !== 1 || !a.body.origins.length || !/^\d{4}-\d{2}-\d{2}$/.test(a.body.today)) fail("Anfrage falsch: " + JSON.stringify(a.body));
  if ((await c.locator(".ai-card").count()) !== 2) fail("nicht zwei Vorschläge");
  if (!(await c.locator(".ai-foot", { hasText: "noch 4 Anfragen heute" }).count())) fail("verbleibende Anfragen fehlen");
  log("Wunsch per Beispiel, Anfrage mit Anmeldung und Reisenden, zwei Vorschläge, 4 Anfragen übrig");

  // nachschärfen: der frühere Wunsch geht als Zusammenhang mit
  await c.locator(".ai-bar textarea").fill("lieber günstiger bitte");
  await c.locator(".ai-bar textarea").press("Enter");
  await until(() => asked.length === 2 && c.locator(".ai-msg.me").count().then(n => n === 2), "zweite Anfrage");
  await until(() => c.locator(".ai-card").count().then(n => n === 4), "zweite Antwort");
  const p2 = asked[1].body.prompt;
  if (!p2.includes("Bisherige Wünsche") || !p2.includes("Wochenende") || !p2.includes("lieber günstiger")) fail("Zusammenhang fehlt: " + p2);
  log("Nachschärfen im Chat mit Zusammenhang");
  await shot("chat");
  await shot("chat-m", 390, 844);

  // von der Startseite übernehmen: neue Reise mit Ziel, Daten, Name, Flug und Unterkunft; Chat schließt
  await c.locator(".ai-card", { hasText: "Sonne in Palma" }).last().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  await shot("trip");
  await shot("trip-m", 390, 844);
  if (await p.locator(".ai-chat").count()) fail("Chat nicht geschlossen");
  if (!(await p.locator("#transport .card", { hasText: "Mietwagen 3 Tage" }).count())) fail("Transport vor Ort nicht übernommen");
  if (!(await p.locator("#attractions .card", { hasText: "Bootstour" }).count())) fail("Erlebnis nicht übernommen");
  // Verpflegung an der Unterkunft: Halbpension von der KI, Verpflegung unter „Sonstiges“ folgt; auf der Karte änderbar
  const board = p.locator("#stay .card", { hasText: "Casa Palma" }).locator(".board-fact select");
  if ((await board.inputValue()) !== "half") fail("Halbpension nicht an der Unterkunft");
  await p.locator("#misc .food-board", { hasText: "Halbpension" }).waitFor();
  const before = await p.locator("#misc .ch-sum b").innerText();
  await board.selectOption("all");
  await p.locator("#misc .food-board", { hasText: "All-inclusive" }).waitFor();
  await until(async () => (await p.locator("#misc .ch-sum b").innerText()) !== before, "Verpflegung günstiger bei All-inclusive");
  if (process.env.SHOTS) {
    for (const [sel, name] of [["#stay .card:has-text('Casa Palma')", "board-stay"], ["#misc .plan-card", "board-food"]]) {
      await p.locator(sel).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
      await p.locator(sel).first().screenshot({ path: `${process.env.SHOTS}/${name}.png` });
    }
  }
  const meta = await p.locator(".hero .meta").innerText();
  if (!meta.includes("Palma") || !meta.includes("3 Nächte")) fail("Kopf: " + meta);
  if (!(await p.locator("#flights .card", { hasText: "Sun Air" }).count())) fail("Flug nicht übernommen");
  if (!(await p.locator("#stay .card", { hasText: "Casa Palma" }).count())) fail("Unterkunft nicht übernommen");
  log("Vorschlag von der Startseite übernommen: neue Reise mit Flug und Unterkunft");

  // zurück zur Startseite: die Reise steht unter „Deine Reisen“
  await p.locator(".top .brand-btn").click();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).waitFor();
  await shot("home-trips");
  await shot("home-m", 390, 844);
  log("Übersicht zeigt die neue Reise");

  // Rückfrage: Strandurlaub mit Kindern ohne Abflugort und Alter → KI fragt nach, Antwort antippen, dann Vorschläge
  await p.locator(".ai-fab").click();
  const c2 = p.locator(".ai-chat");
  await c2.locator(".ai-bar textarea").fill("Eine Woche Strandurlaub mit Kindern in den Sommerferien");
  await c2.locator(".ai-bar textarea").press("Enter");
  await c2.locator(".ai-msg.ai-q", { hasText: "Von wo fliegt ihr los" }).waitFor();
  await shot("ai-q");
  const q1 = asked.at(-1).body;
  if (q1.asked || q1.travelersKnown !== false || q1.originsKnown !== false) fail("erste Anfrage: " + JSON.stringify(q1));
  const cardsBefore = await c2.locator(".ai-card").count();
  await c2.locator(".ai-opts .chip", { hasText: "Köln, Kinder 5 und 8" }).click();
  await until(() => c2.locator(".ai-card").count().then(n => n === cardsBefore + 2), "Vorschläge nach der Antwort");
  const q2 = asked.at(-1).body;
  if (!q2.asked || !q2.prompt.includes("Rückfrage: Von wo fliegt ihr los") || !q2.prompt.includes("Köln, Kinder 5 und 8")) fail("Antwort ohne Zusammenhang: " + JSON.stringify(q2));
  if (await c2.locator(".ai-opts").count()) fail("Antworten nach dem Antippen noch sichtbar");
  if (!(await c2.locator(".ai-card").last().innerText()).includes("pro Person")) fail("pro Person für die Familie fehlt");
  log("Rückfrage mit Antworten zum Antippen, Antwort mit Zusammenhang, danach keine zweite Rückfrage");
  await c2.locator(".ai-card", { hasText: "Sonne in Palma" }).last().locator(".btn", { hasText: "Übernehmen" }).click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  const who = await p.locator(".hero .meta").innerText();
  if (!who.includes("4 Personen")) fail("Reisende aus der Antwort nicht angelegt: " + who);
  log("Übernommen: neue Reise mit 2 Erwachsenen und 2 Kindern aus der Antwort");

  // ganze Reise auf der Karte: Posten, Schätzungen mit ≈, Gesamtpreis; alle Vorschläge als Reisen anlegen
  await p.locator(".top .brand-btn").click();
  await p.locator(".ai-fab").click();
  const card = p.locator(".ai-card", { hasText: "Sonne in Palma" }).last();
  const ct = await card.innerText();
  for (const x of ["Halbpension", "Mietwagen 3 Tage", "Bootstour", "Verpflegung", "ca."]) if (!ct.includes(x)) fail(`Karte ohne „${x}“: ${ct}`);
  await card.scrollIntoViewIfNeeded(); await shot("ai-card");
  await p.locator(".ai-all").last().click();
  await p.locator(".start .home-title").waitFor();
  await until(() => p.locator(".start .home-trip .ht-ai").count().then(n => n >= 3), "KI-Reisen gekennzeichnet");
  if (!(await p.locator(".start .home-trip", { hasText: "Lissabon" }).count())) fail("Lissabon nicht angelegt");
  await p.locator(".start .home-h").first().scrollIntoViewIfNeeded(); await shot("ai-home");
  log("Karte als ganze Reise (Halbpension, Mietwagen, Bootstour, Verpflegung, Gesamtpreis); alle angelegt und mit &✈KI gekennzeichnet");

  // Vorlieben: „Ich“ mit Wohnort, gesperrtes Land, Umstiege, Reisestil → gehen ohne Namen an den KI-Planer
  await p.keyboard.press("Escape");
  await p.locator(".top .grp-btn").click();
  const gd = p.locator(".modal");
  const pform = gd.locator("form", { hasText: "Vorname" });
  await pform.locator("input").nth(0).fill("Dani");
  await pform.locator("input").nth(1).fill("Klein");
  await pform.locator("button").click();
  await gd.locator('.pmore[aria-label="Details zu Dani"]').click();
  await gd.locator(".pdet label", { hasText: "Wohnort" }).locator("input").fill("41236");
  await until(async () => (await gd.locator(".pdet label", { hasText: "Wohnort" }).locator("input").inputValue()).includes("Mönchengladbach"), "Wohnort Dani");
  // Vorlieben haben einen eigenen Knopf oben, nicht mehr bei Gruppen und Personen
  if (await gd.locator(".prefs").count()) fail("Vorlieben noch im Dialog Gruppen und Personen");
  await gd.locator(".modal-h .x").click();
  await p.locator(".top .prefs-btn").click();
  const pd = p.locator(".modal", { hasText: "Meine Vorlieben" });
  const pe = pd.locator(".prefs").first();
  await pe.locator("label", { hasText: "Ich bin" }).locator("select").selectOption({ label: "Dani Klein" });
  await pe.locator('input[placeholder^="Land hinzufügen"]').fill("Türk");
  await pe.locator(".sugg button", { hasText: "Türkei" }).click();
  await pe.locator("label", { hasText: "Umstiege max." }).locator("select").selectOption("0");
  await pe.locator(".chip", { hasText: "Strand" }).click();
  await pd.locator(".modal-h .x").click();
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem("rk2-dir") || "{}"));
  if (!stored.me || stored.prefs?.avoid?.join() !== "TR" || stored.prefs?.maxStops !== 0) fail("Vorlieben nicht gespeichert: " + JSON.stringify(stored.prefs));
  await p.locator(".ai-fab").click();
  const c3 = p.locator(".ai-chat");
  const before3 = asked.length;
  await c3.locator(".ai-bar textarea").fill("Ein langes Wochenende irgendwo in der Sonne");
  await c3.locator(".ai-bar textarea").press("Enter");
  await until(() => asked.length > before3, "Anfrage mit Vorlieben");
  const q3 = asked.at(-1).body;
  if (q3.prefs?.avoid?.join() !== "TR" || q3.prefs?.maxStops !== 0 || q3.prefs?.styles?.join() !== "beach") fail("Vorlieben fehlen in der Anfrage: " + JSON.stringify(q3.prefs));
  if (q3.originsKnown === false || !q3.origins.includes("DUS")) fail("Wohnort von „Ich“ nicht genutzt: " + JSON.stringify({ o: q3.origins, k: q3.originsKnown }));
  if (JSON.stringify(q3).includes("Dani") || JSON.stringify(q3).includes("Klein")) fail("Name in der KI-Anfrage");
  log("Vorlieben: Ich = Dani (Mönchengladbach), Türkei gesperrt, 0 Umstiege, Strand → KI-Anfrage mit Vorlieben und Abflug ab DUS, ohne Namen");

  // offene Reise: die KI kennt sie (ohne Namen), alle Änderungen eines Auftrags mit einer Rückfrage übernehmen
  await c3.locator(".ai-head .x").click();
  await p.locator(".start .home-trip", { hasText: "Sonne in Palma" }).first().click();
  await p.locator(".hero h1", { hasText: "Sonne in Palma" }).waitFor();
  const tripName = (await p.locator(".hero h1").innerText()).trim();
  await p.locator(".ai-fab").click();
  const c4 = p.locator(".ai-chat");
  await c4.locator(".ai-trip", { hasText: "Sonne in Palma" }).waitFor();
  const before4 = asked.length;
  await c4.locator(".ai-bar textarea").fill("Wir reisen selbst mit dem Auto an");
  await c4.locator(".ai-bar textarea").press("Enter");
  await c4.locator(".ai-edit", { hasText: "1 Sache" }).waitFor();
  const q4 = asked[before4].body;
  if (!q4.current?.items?.some(i => i.cat === "flights" && i.eur > 0) || q4.current.place !== "Palma") fail("Reise fehlt in der Anfrage: " + JSON.stringify(q4.current));
  if (/Dani|Klein|Kira/.test(JSON.stringify(q4.current))) fail("Name in der Reise für die KI");
  await shot("ai-edit");
  await c4.locator(".ai-apply").click();
  await p.locator("#transport .card", { hasText: "Anreise mit dem Auto" }).locator(".aif", { hasText: "Von der KI angepasst" }).waitFor();
  if (await p.locator("#flights .card", { hasText: "Sun Air" }).count()) fail("Flug nicht ersetzt");
  if (!(await p.locator("#stay .card", { hasText: "Casa Palma" }).locator(".aif", { hasText: "Von der KI vorgeschlagen" }).count())) fail("Unterkunft aus dem Vorschlag nicht markiert");
  await shot("ai-applied");
  if (process.env.SHOTS) {
    const fc = p.locator("#transport .card", { hasText: "Anreise mit dem Auto" });
    await fc.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
    await fc.screenshot({ path: `${process.env.SHOTS}/ai-flag.png` });
  }
  await c4.locator(".ai-undo").click();
  await p.locator("#flights .card", { hasText: "Sun Air" }).waitFor();
  if (await p.locator("#transport .card", { hasText: "Anreise mit dem Auto" }).count()) fail("Rückgängig hat nicht gewirkt");
  log("Offene Reise: Anfrage mit Reise ohne Namen, eine Rückfrage, Übernehmen ersetzt den Flug (markiert), Rückgängig");

  // als KI-Vergleichsreise: eigene Reise daneben, die bisherige bleibt
  await c4.locator(".ai-bar textarea").fill("Wir reisen selbst mit dem Auto an");
  await c4.locator(".ai-bar textarea").press("Enter");
  await until(() => c4.locator(".ai-variant").count().then(n => n === 1), "zweite Antwort zur Reise");
  await c4.locator(".ai-variant").click();
  await p.locator(".hero h1", { hasText: "(KI-Vergleich)" }).waitFor();
  if (await p.locator("#flights .card", { hasText: "Sun Air" }).count()) fail("Vergleichsreise mit Flug");
  await c4.locator(".ai-head .x").click();
  await p.locator(".top .brand-btn").click();
  await p.locator(".start .home-trip", { hasText: "(KI-Vergleich)" }).first().waitFor();
  if (!(await p.locator(".start .home-trip", { hasText: tripName }).count())) fail("ursprüngliche Reise fehlt");
  log("Als KI-Vergleichsreise angelegt, ursprüngliche Reise unverändert");

  // große Gruppe: 10 Personen, Flug in 5 Buchungen à 2 Plätze, jede ein eigener Posten
  await p.locator(".ai-fab").click();
  const c5 = p.locator(".ai-chat");
  await c5.locator(".ai-bar textarea").fill("Mannschaftsfahrt mit 10 Männern nach Mallorca");
  await c5.locator(".ai-bar textarea").press("Enter");
  const gcard = c5.locator(".ai-card", { hasText: "Mannschaftsfahrt Cala Rajada" });
  await gcard.waitFor();
  if (!(await gcard.innerText()).includes("10 Pers. in 5 Buchungen à 2 Plätze")) fail("Buchungen nicht auf der Karte: " + await gcard.innerText());
  await gcard.locator(".btn", { hasText: "Übernehmen" }).click();
  await p.locator(".hero h1", { hasText: "Mannschaftsfahrt" }).waitFor();
  if (!(await p.locator(".hero .meta").innerText()).includes("10 Personen")) fail("nicht 10 Personen");
  await until(() => p.locator("#flights .card").count().then(n => n === 5), "5 Flugposten");
  if (!(await p.locator("#flights .card", { hasText: "(5/5)" }).count())) fail("Buchungen nicht nummeriert");
  // der übernommene Vorschlag liegt auch im Konto (nicht nur die leere Reise vom Anlegen)
  const mfId = await p.evaluate(() => localStorage.getItem("rk2-current"));
  const inDb = async () => {
    const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-reisekasse/databases/(default)/documents/trips/${mfId}`, { headers: { Authorization: "Bearer owner" } });
    const f = (await r.json()).fields || {};
    const d = JSON.parse(f.data?.stringValue || "{}");
    return f.name?.stringValue === "Mannschaftsfahrt Cala Rajada" && (d.items || []).filter(i => i.cat === "flights").length === 5 && d.travelers?.length === 10;
  };
  await until(inDb, "Vorschlag im Konto gespeichert");
  // auch die mit „Alle übernehmen“ angelegten Reisen: keine bleibt als leere „Reise“ im Konto
  const uid = await p.evaluate(() => Object.keys(localStorage).find(k => k.startsWith("rk2-cloud-seen:")).slice("rk2-cloud-seen:".length));
  const names = async () => {
    const r = await fetch("http://127.0.0.1:8080/v1/projects/demo-reisekasse/databases/(default)/documents/trips?pageSize=300", { headers: { Authorization: "Bearer owner" } });
    return ((await r.json()).documents || []).filter(d => d.fields?.owner?.stringValue === uid).map(d => d.fields?.name?.stringValue);
  };
  await until(async () => !(await names()).includes("Reise"), "alle KI-Reisen im Konto gespeichert, nicht leer");
  log("Mannschaftsfahrt: 10 Personen, Flug in 5 Buchungen à 2 Plätze als eigene Posten");

  // Startseite: sortieren (Preis, zuletzt bearbeitet, Land), Liste statt Kacheln, Wahl bleibt nach dem Neuladen
  await p.locator(".top .brand-btn").click();
  await p.locator(".home-sort .chip", { hasText: "Preis" }).click();
  const prices = await p.locator(".home-trips").first().locator(".ht-total").allInnerTexts();
  const num = s => Number(s.replace(/[^\d,]/g, "").replace(",", "."));
  if (prices.length < 2 || prices.some((x, i) => i && num(x) < num(prices[i - 1]))) fail("nicht nach Preis sortiert: " + prices);
  await p.locator(".home-sort .chip", { hasText: "Zuletzt bearbeitet" }).click();
  await p.locator(".home-h", { hasText: "Zuletzt bearbeitet" }).waitFor();
  const first = await p.locator(".home-trip").first().innerText();
  if (!first.includes("Mannschaftsfahrt")) fail("zuletzt bearbeitete nicht oben: " + first);
  await p.locator(".home-sort .chip", { hasText: "Land" }).click();
  await p.locator(".home-h", { hasText: "Spanien" }).waitFor();
  await p.locator(".home-view .chip", { hasText: "Liste" }).click();
  await p.locator(".home-trips.as-list .home-row").first().waitFor();
  await shot("home-list"); await shot("home-list-m", 390, 844);
  await p.reload();
  await p.locator(".home-trips.as-list .home-row").first().waitFor();
  if (!(await p.locator(".home-sort .chip.on", { hasText: "Land" }).count())) fail("Sortierung nicht gemerkt");
  log("Startseite: nach Preis, zuletzt bearbeitet und Land sortiert, Liste statt Kacheln, gemerkt");

  // Aufräumen: unberührter Entwurf verschwindet still, Reise ohne Kosten nach Rückfrage
  await p.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem("rk2-index") || "[]");
    const base = { country: "", travelers: [{ id: "x", name: "Reh", household: "Reh", placeholder: true }], items: [], tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 } } };
    localStorage.setItem("rk2-t:leer1", JSON.stringify({ ...base, id: "leer1", name: "", autoName: true, place: "" }));
    localStorage.setItem("rk2-t:idee1", JSON.stringify({ ...base, id: "idee1", name: "Idee Lissabon", place: "Lissabon", from: "2027-09-01", to: "2027-09-05" }));
    idx.push({ id: "leer1", name: "", place: "" }, { id: "idee1", name: "Idee Lissabon", place: "Lissabon", from: "2027-09-01", to: "2027-09-05" });
    localStorage.setItem("rk2-index", JSON.stringify(idx));
  });
  await p.reload();
  await p.locator(".home-clean", { hasText: "ohne Kosten aufräumen" }).waitFor();
  if (!(await p.locator(".home-h .home-clean").count())) fail("„aufräumen“ nicht neben der Überschrift");
  if (process.env.SHOTS) { await p.locator(".home-h .home-clean").scrollIntoViewIfNeeded(); await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(400); await p.screenshot({ path: `${process.env.SHOTS}/clean.png` }); await p.emulateMedia({ colorScheme: "light" }); }
  await until(() => p.evaluate(() => localStorage.getItem("rk2-t:leer1") === null), "unberührter Entwurf gelöscht");
  let asked2 = "";
  p.once("dialog", d => { asked2 = d.message(); void d.accept(); });
  await p.locator(".home-clean").click();
  await until(() => p.locator(".home-row", { hasText: "Idee Lissabon" }).count().then(n => n === 0), "Idee aufgeräumt");
  if (!asked2.includes("Idee Lissabon")) fail("Rückfrage ohne Namen: " + asked2);
  if (!(await p.locator(".home-row", { hasText: "Mannschaftsfahrt" }).count())) fail("Reise mit Kosten weg");
  log("Aufräumen: unberührter Entwurf still gelöscht, „Idee Lissabon“ (ohne Kosten) nach Rückfrage, Reisen mit Kosten bleiben");

  // „Zu einem Event“ direkt nach dem Laden, das Konto ist noch nicht da: Kommt es danach, bleibt die neue Reise offen
  // (früher wurde sie gegen die erste Konto-Reise getauscht und der Event-Plan landete dort)
  let release = () => {};
  const gate = new Promise(r => (release = r));
  await p.route("**/assets/firebase-*.js", async r => { await gate; await r.continue(); });
  await p.reload();
  await p.locator(".start .home-event").click();
  await p.locator(".modal[aria-label='Reise zu einem Event']").waitFor();
  release();
  await p.locator(".top .acct-btn").waitFor({ timeout: 15000 });
  await p.waitForTimeout(1500);
  const opened = await p.locator(".top .tm-name").innerText();
  if (opened !== "Neue Reise") fail("neue Reise gegen Konto-Reise getauscht: " + opened);
  await p.unroute("**/assets/firebase-*.js");
  log("Zu einem Event direkt nach dem Laden: neue Reise bleibt offen, auch wenn das Konto erst danach da ist");

  await p.keyboard.press("Escape");
  // Vorlieben einer Gruppe, angemeldet und in einem zweiten Fenster offen: langsam tippen und auswählen,
  // nichts springt zurück (beide Fenster gleichen über das Konto ab und dürfen sich nicht gegenseitig überschreiben)
  const w2 = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" })).newPage();
  for (const f of ["world.json", "packs.json", "airports.json"]) await w2.route(`**/${f}`, r => r.fulfill({ path: `../public/${f}` }));
  await w2.goto(URL);
  await w2.locator(".top .tm-btn", { hasText: "Anmelden" }).click();
  await w2.locator(".login .test input").fill("Kira");
  await w2.locator(".login .test button").click();
  await w2.locator(".top .acct-btn").waitFor({ timeout: 15000 });
  await p.locator(".top .grp-btn").click();
  const gd2 = p.locator(".modal");
  await gd2.locator("label", { hasText: "Neue Gruppe" }).locator("input").fill("Familie Klein");
  await gd2.locator("form", { hasText: "Neue Gruppe" }).locator("button").click();
  await gd2.locator(".modal-h .x").click();
  await p.locator(".top .prefs-btn").click();
  const pd2 = p.locator(".modal", { hasText: "Meine Vorlieben" });
  await pd2.locator(".grp-h", { hasText: "Familie Klein" }).click();
  const ge = pd2.locator(".grp-b .prefs");
  const apIn = ge.locator("label", { hasText: "Bevorzugte Abflughäfen" }).locator("input");
  // Datenbank langsam wie im echten Netz: das Echo des Speicherns kommt, während schon weitergetippt wird
  const slow = async r => { await new Promise(res => setTimeout(res, 700)); await r.continue().catch(() => {}); };
  await p.route("**/google.firestore.v1.Firestore/**", slow);
  await w2.route("**/google.firestore.v1.Firestore/**", slow);
  for (const ch of "DUS, CGN") { await apIn.press(ch === " " ? "Space" : ch); await p.waitForTimeout(350); }
  await ge.locator("label", { hasText: "Verpflegung" }).locator("select").selectOption({ label: "Halbpension" });
  await p.waitForTimeout(4000);
  await p.unroute("**/google.firestore.v1.Firestore/**", slow);
  if ((await apIn.inputValue()) !== "DUS, CGN") fail("Eingabe in den Gruppen-Vorlieben zurückgesprungen: " + await apIn.inputValue());
  if ((await ge.locator("label", { hasText: "Verpflegung" }).locator("select").inputValue()) !== "half") fail("Verpflegung zurückgesprungen");
  const gp = await p.evaluate(() => JSON.parse(localStorage.getItem("rk2-dir")).groups.find(g => g.name === "Familie Klein")?.prefs);
  if (gp?.airports?.join() !== "DUS,CGN" || gp?.board !== "half") fail("Gruppen-Vorlieben nicht gespeichert: " + JSON.stringify(gp));
  const gp2 = await w2.evaluate(() => JSON.parse(localStorage.getItem("rk2-dir")).groups.find(g => g.name === "Familie Klein")?.prefs);
  if (gp2?.board !== "half") fail("zweites Fenster hat die Gruppen-Vorlieben nicht: " + JSON.stringify(gp2));
  await w2.close();
  await pd2.locator(".modal-h .x").click();
  log("Gruppen-Vorlieben angemeldet, zweites Fenster offen: langsam getippt und Halbpension gewählt, nichts springt zurück, gespeichert");

  // dauert es länger: Wartezeit läuft sichtbar mit (statt „bis zu einer Minute“)
  if (await p.locator(".ai-fab").count()) await p.locator(".ai-fab").click();
  const cw = p.locator(".ai-chat");
  await cw.locator(".ai-bar textarea").fill("Bitte langsam: ein Wochenende am Meer");
  await cw.locator(".ai-bar textarea").press("Enter");
  await cw.locator(".ai-busy", { hasText: "ein paar Minuten" }).waitFor();
  await cw.locator(".ai-busy .ai-wait", { hasText: /^0:0[5-9]$/ }).waitFor({ timeout: 8000 });
  await cw.locator(".ai-busy").waitFor({ state: "detached", timeout: 10000 });
  log("Längere Antwort: Hinweis „ein paar Minuten“, Wartezeit läuft mit");

  // im Hintergrund: Fenster schließen und weiterarbeiten, der Knopf zeigt den Stand und meldet das Ergebnis
  await cw.locator(".ai-bar textarea").fill("Bitte langsam: noch ein Wochenende");
  await cw.locator(".ai-bar textarea").press("Enter");
  await cw.locator(".ai-busy .ai-cancel").waitFor();
  await cw.locator(".ai-head .x").click();
  await p.locator(".ai-fab.working", { hasText: "KI arbeitet" }).waitFor();
  await p.locator(".top .brand-btn").click().catch(() => {});
  await p.locator(".start .home-title").waitFor();
  await p.locator(".ai-note", { hasText: "Die KI ist fertig" }).waitFor({ timeout: 12000 });
  if (!(await p.locator(".ai-fab.unread").count())) fail("Knopf zeigt das Ergebnis nicht an");
  await p.locator(".ai-note").click();
  await p.locator(".ai-chat .ai-card").last().waitFor();
  if (await p.locator(".ai-note").count()) fail("Meldung bleibt nach dem Öffnen");
  log("Im Hintergrund: Fenster zu, weitergearbeitet, „Die KI ist fertig“ am Knopf, Klick öffnet das Ergebnis");

  if (errors.length) fail("Fehler auf der Seite: " + errors.join(" | "));
  log("KI-Planer ok");
} finally { await browser.close(); server.kill(); }
