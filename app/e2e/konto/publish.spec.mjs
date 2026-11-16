/*
 * Reise im Katalog veröffentlichen (#644) gegen die Firebase-Emulatoren, am Handy (390 px): ohne Konto erst anmelden,
 * ohne Benutzernamen erst den Namen wählen; Angaben vorbelegt, Check (Link im Text blockiert, Namen gelb), Vorschau wie im
 * Katalog ohne Namen, Zustimmung, veröffentlichen; im Katalog sehen (auch ohne Konto, mit „Melden“), zurückziehen.
 */
import { test, fail, log, until, settle, reply, URL, TOUCH, reloadHome, myTrips, autoAsk, login, adminPut } from "../lib/konto.mjs";

const stay = (id, place, from, to, unit, lat, lon) => ({ id, cat: "stay", name: `Unterkunft in ${place}`, status: "idea", from, to,
  options: [{ id: id + "o", label: "", price: { mode: "unit", currency: "EUR", unit }, loc: { lat, lon }, query: { place, checkin: from, checkout: to, adults: 2, childAges: [], rooms: 1 } }] });
const TRIP = {
  id: "kat", name: "Kroatien mit Anna", place: "Split", country: "Kroatien", from: "2027-06-05", to: "2027-06-10",
  travelers: [{ id: "a", name: "Anna", household: "Klein", age: 40 }, { id: "b", name: "Ben", household: "Klein", age: 42 }],
  items: [
    stay("s1", "Split", "2027-06-05", "2027-06-08", 300, 43.5, 16.44), stay("s2", "Dubrovnik", "2027-06-08", "2027-06-10", 220, 42.65, 18.09),
    { id: "r", cat: "transport", name: "Mietwagen", status: "idea", hint: "rental", options: [{ id: "ro", label: "", price: { mode: "unit", currency: "EUR", unit: 150 } }] },
    { id: "t1", cat: "attractions", name: "Bootstour", status: "idea", day: "2027-06-06T10:00", options: [{ id: "t1o", label: "", price: { mode: "person", currency: "EUR", adult: 45 } }] }
  ],
  tiers: {}, settings: { adultAge: 12, childAge: 6, rates: { EUR: 1 }, kmCost: 0.3 }, days: {}
};

/** Person am Handy in eigenem Browser */
const page = (open, name) => open({ ...TOUCH, timezoneId: "Europe/Berlin", name, data: true });
const shot = async (p, n) => { if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${n}.png`, fullPage: true }); };
const menu = async p => { await p.locator("header.top .tm-btn").first().click(); return p.locator(".tm-acts .tm-publish"); };

test("Reise veröffentlichen, im Katalog sehen, übernehmen mit Preispunkten, zurückziehen", async ({ open }) => {
  const a = await page(open, "Ersteller");
  await a.goto(URL);
  await reloadHome(a, { set: { "rk2-t:kat": TRIP, "rk2-index": [{ id: "kat", name: TRIP.name, place: TRIP.place }], "rk2-current": "kat" } });
  await (await myTrips(a)).locator(".home-trip", { hasText: "Kroatien" }).first().click();

  // 1. ohne Konto: erst anmelden
  await (await menu(a)).click();
  await a.locator(".pub", { hasText: "nur mit Konto" }).waitFor();
  await a.locator(".pub .btn.primary").click();
  await login(a, "Paula");
  await until(async () => !(await a.locator(".login").count()), "angemeldet");
  log("ohne Konto: Hinweis „nur mit Konto“, Anmelden führt zur Anmeldung");

  // 2. ohne Benutzernamen: erst den Namen wählen, dann geht es weiter
  await (await menu(a)).click();
  await a.locator(".pub .un-in").waitFor();
  await a.locator(".pub .un-in").fill("paula_reist");
  await a.locator(".pub .un-st", { hasText: "Frei" }).waitFor({ timeout: 10000 });
  await a.locator(".pub .un-save").click();
  await a.locator(".pub .pub-title").waitFor({ timeout: 10000 });
  log("Benutzername zuerst gewählt (paula_reist), dann Schritt 1");

  // 3. Angaben: vorbelegt ohne Namen; Link blockiert, Namen gelb
  if ((await a.locator(".pub .pub-title").inputValue()).includes("Anna")) fail("Titel vorbelegt mit Namen");
  { const on = (await a.locator(".pub .pub-months .chip.on").allInnerTexts()).join(" "); if (!on.includes("Jun")) fail("gute Monate nicht vorbelegt: " + on + " / " + (await a.locator(".pub .pub-months").innerText())); }
  await a.locator(".pub .pub-title").fill("Kroatien-Rundreise mit Anna");
  await a.locator(".pub .pub-summary").fill("Zwei Orte an der Küste, Infos unter www.example.com");
  await a.locator(".pub .pub-f.red li", { hasText: "Links" }).waitFor();
  if (!(await a.locator(".pub .pub-next").isDisabled())) fail("Link im Text blockiert nicht");
  if (!(await a.locator(".pub .pub-f.yellow").innerText()).includes("Namen")) fail("Hinweis auf Namen fehlt");
  await a.locator(".pub .pub-summary").fill("Zwei Orte an der Küste, mit Mietwagen und Bootstour.");
  await until(async () => !(await a.locator(".pub .pub-next").isDisabled()), "Weiter frei");
  await shot(a, "schritt1");
  await a.locator(".pub .pub-next").click();
  log("Schritt 1: vorbelegt ohne Namen, Link rot und blockiert, Namen gelb");

  // 4. Vorschau wie im Katalog, ohne Namen; erst mit Zustimmung veröffentlichen
  const prev = a.locator(".pub .pub-prev");
  await prev.locator(".kat-card").waitFor();
  const text = await prev.innerText();
  if (text.includes("Anna") || text.includes("Klein") || !text.includes("Kroatien-Rundreise mit")) fail("Vorschau: " + text.slice(0, 300));
  if (!text.includes("von paula_reist") || !text.includes("Zwei Orte an der Küste")) fail("Vorschau ohne Ersteller oder Beschreibung");
  if (!text.includes("Bootstour")) fail("Vorschau ohne Tour");
  if (await prev.locator(".kat-take, .kat-report").count()) fail("Vorschau mit Übernehmen oder Melden");
  if (!(await a.locator(".pub .pub-go").isDisabled())) fail("Veröffentlichen ohne Zustimmung möglich");
  await shot(a, "vorschau");
  await a.locator(".pub .pub-agree input").check();
  await a.locator(".pub .pub-go").click();
  await a.locator(".pub .pub-done", { hasText: "Veröffentlicht" }).waitFor({ timeout: 10000 });
  log("Schritt 2: Vorschau ohne Namen mit Ersteller, Beschreibung, Tour; veröffentlicht nach Zustimmung");

  // 5. im Katalog: eigener Eintrag mit „Deine Reise“
  await a.locator(".pub .pub-view").click();
  await a.locator(".kat .kat-h", { hasText: "Kroatien-Rundreise mit" }).waitFor({ timeout: 10000 });
  if (!(await a.locator(".kat .kat-own .kat-tag.mine").count())) fail("eigener Eintrag nicht erkannt");
  if (await a.locator(".kat .kat-report").count()) fail("eigenen Eintrag melden");
  log("Katalog: eigener Eintrag mit „Deine Reise“ und Zurückziehen");

  // 6. ohne Konto: Eintrag in der Liste, Detail mit Melden und Übernehmen
  const v = await page(open, "Besucher");
  await v.goto(URL);
  await v.locator(".start .home-catalog").click();
  const card = v.locator(".kat-card", { hasText: "Kroatien-Rundreise mit" });
  await card.waitFor({ timeout: 15000 });
  if (!(await card.innerText()).includes("von paula_reist")) fail("Ersteller fehlt in der Liste");
  await card.click();
  await v.locator(".kat .kat-report").waitFor();
  if (!(await v.locator(".kat .kat-take .btn").count())) fail("Übernehmen fehlt bei Nutzer-Reisen");
  await v.locator(".kat .kat-report").click();
  await v.locator(".bug", { hasText: "angemeldete" }).waitFor();
  await v.keyboard.press("Escape");
  log("Besucher ohne Konto: Eintrag in der Liste mit Ersteller, Detail mit Übernehmen und Melden");

  // 6b. geprüfte Preise (#652): der Such-Dienst legt Punkte ab (hier als Admin), der Katalog zeigt die Mitte und „geprüft“
  const id = await a.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:kat")).pub.id);
  const pts = [{ c: "stay", k: "Split", pp: 480, m: 6, n: 2, d: "2026-10-20" }, { c: "stay", k: "Split", pp: 520, m: 6, n: 2, d: "2026-10-28" }];
  const put = await adminPut(`catalogStats/${id}`, { p: JSON.stringify(pts) });
  if (!put.ok) fail("Preispunkte anlegen: " + put.status);
  await v.goto(URL);
  await v.locator(".start .home-catalog").click();
  await v.locator(".kat-card", { hasText: "Kroatien-Rundreise mit" }).click();
  await v.locator(".kat-dh", { hasText: "2× beim Übernehmen geprüft" }).waitFor({ timeout: 10000 });
  // Unterkunft: Split mit der Mitte der zwei Prüfungen (500 € p. P.) plus Dubrovnik (220 €)
  if (!(await v.locator(".kat-rows").innerText()).includes("720")) fail("Richtwert aus den Prüfungen fehlt (Split 500 + Dubrovnik 220): " + await v.locator(".kat-rows").innerText());
  log("Geprüfte Preise: „2× beim Übernehmen geprüft“, Unterkunft mit der Mitte der Prüfungen");

  // 6c. übernehmen mit Konto: Preise prüfen, danach geht je Bereich ein Preispunkt an den Such-Dienst (ohne Namen, Anbieter, Links)
  const src = [{ id: "t", name: "Test", configured: true, ok: true, count: 1 }];
  const sent = [];
  await a.route("https://flights.test/stays/search", r => reply(r, { offers: [{ id: "s1", source: "t", sourceName: "Testbett", name: "Villa Testa", total: 900, currency: "EUR", url: "https://example.com/s" }], sources: src }));
  await a.route("https://flights.test/flights/search", r => reply(r, { offers: [], sources: src }));
  await a.route("https://flights.test/activities/search", r => reply(r, { activities: [{ id: "a1", source: "t", sourceName: "Testtour", title: "Bootstour zu den Inseln", price: 50, currency: "EUR", url: "https://example.com/t" }], sources: src }));
  await a.route("https://flights.test/catalog/price", r => { if (r.request().method() === "POST") sent.push({ auth: r.request().headers().authorization || "", body: JSON.parse(r.request().postData() || "{}") }); return reply(r, { ok: true }); });
  await a.locator(".kat .kat-take .btn").click();
  await a.locator(".kat-form .kat-when input").fill("2027-06-05");
  await a.locator(".kat-form .kat-take .btn").click();
  await a.locator(".pc .pc-sum").waitFor({ timeout: 20000 });
  await until(async () => sent.length > 0, "Preispunkte gesendet");
  const b = sent[0].body;
  if (!sent[0].auth.startsWith("Bearer ") || b.entry !== id) fail("Meldung ohne Anmeldung oder Eintrag: " + JSON.stringify(b));
  const cats = b.points.map(x => `${x.c}:${x.k}`).sort().join(",");
  if (!cats.includes("stay:Split") || !cats.includes("tour:Bootstour")) fail("Preispunkte: " + cats);
  if (/Anna|Ben|Klein|paula|Testbett|Testtour|example\.com|Villa/i.test(JSON.stringify(b))) fail("Preispunkt mit persönlichen Daten oder Anbietern: " + JSON.stringify(b));
  await until(async () => (await a.evaluate(() => { const t = JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "{}"); return t.catalog?.sent; })), "einmal gesendet gemerkt");
  log(`Übernommen mit Konto: Preise geprüft, Preispunkte gesendet (${cats}), ohne Namen und Anbieter`);

  // 7. Eintrag aktualisieren geht nur über den Knopf; zurückziehen löscht ihn
  await reloadHome(a);
  await (await myTrips(a)).locator(".home-trip", { hasText: "Kroatien mit Anna" }).first().click();
  const item = await menu(a);
  if (!(await item.innerText()).includes("zurückziehen")) fail("Menü zeigt den Eintrag nicht: " + await item.innerText());
  await item.click();
  await a.locator(".pub .pub-on", { hasText: "Im Katalog seit" }).waitFor();
  autoAsk(a, { once: true });
  await a.locator(".pub .pub-withdraw").click();
  await a.locator(".pub .pub-done", { hasText: "Zurückgezogen" }).waitFor({ timeout: 10000 });
  // erst wenn die veröffentlichten Reisen geladen sind, zählt, dass der Eintrag fehlt
  const listed = v.waitForResponse(r => r.url().includes("/documents/catalog?"));
  await v.goto(URL);
  await v.locator(".start .home-catalog").click();
  await v.locator(".kat-card").first().waitFor();
  await (await listed).finished();
  await settle(v);
  if (await v.locator(".kat-card", { hasText: "Kroatien-Rundreise mit" }).count()) fail("Eintrag nach dem Zurückziehen noch im Katalog");
  log("Zurückgezogen: Eintrag nicht mehr im Katalog");
});
