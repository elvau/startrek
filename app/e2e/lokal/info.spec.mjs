/*
 * „Neues & Ausblick“: Link in der Fußzeile, Reiter Neu / Bald / Bekannte Fehler / FAQ, Daten vom Such-Dienst (/ausblick,
 * hier nachgestellt), ohne Daten nur die mitgelieferten Fragen; Link …/?info=faq.
 */
import { test, fail, log, reply, CORS, URL, PHONE } from "../lib/test.mjs";

const DATA = {
  stand: "2026-10-14T05:00:00Z",
  neu: [{ version: "0.40.0", datum: "2026-10-14", punkte: [{ de: "Reiseübersicht als Seite oder PDF", en: "Trip overview as page or PDF" }] }],
  bald: [
    { nr: 377, status: "in-arbeit", titel: { de: "Feiertage im Kalender", en: "Public holidays in the calendar" }, text: { de: "Feiertage und Ferien direkt im Kalender.", en: "Holidays right in the calendar." } },
    { nr: 310, status: "geplant", titel: { de: "Sparplan je Reise" } }
  ],
  fehler: [{ nr: 370, status: "auf-test", titel: { de: "Reiseideen übernehmen die Angaben nicht" } }],
  faq: [{ f: { de: "Kann ich hier buchen?", en: "Can I book here?" }, a: { de: "Nein, beim Anbieter.", en: "No, at the provider." } }]
};

/** Seite am Handy mit nachgestelltem Such-Dienst; state.down: Dienst nicht erreichbar, state.asked: Abrufe */
async function start(open, state = { down: false, asked: 0 }) {
  const p = await open(PHONE);
  await p.route("https://flights.test/ausblick", r => {
    state.asked++;
    return state.down ? r.fulfill({ status: 503, headers: CORS, body: "{}" }) : reply(r, DATA);
  });
  return p;
}

test("Menü ⋯ und Fußzeile öffnen die Ansicht; Reiter Neu, Bald, Bekannte Fehler, FAQ", async ({ open }) => {
  const p = await start(open);
  await p.goto(URL);

  // im Menü ⋯ oben und in der Fußzeile der Startseite
  await p.locator(".top-more .tbtn").click();
  await p.locator(".top-pop .top-info").click();
  await p.locator(".modal", { hasText: "Neues & Ausblick" }).locator(".x").click();
  await p.locator(".foot .foot-info").click();
  const m = p.locator(".modal", { hasText: "Neues & Ausblick" });
  await m.waitFor();
  await m.locator(".inf-rel", { hasText: "Version 0.40.0" }).waitFor();
  if (!(await m.locator(".inf-rel li").innerText()).includes("Reiseübersicht")) fail("Neu: Punkt fehlt");
  log("Menü ⋯ und Fußzeile öffnen „Neues & Ausblick“, Reiter Neu zeigt Version 0.40.0");

  // Bald: Anzahl am Reiter, Status, Text zum Aufklappen
  const bald = m.locator("[data-tab='bald']");
  if ((await bald.locator(".inf-n").innerText()) !== "2") fail("Anzahl am Reiter Bald");
  await bald.click();
  const e1 = m.locator(".inf-e", { hasText: "Feiertage im Kalender" });
  if (!(await e1.locator(".inf-st").innerText()).includes("in Arbeit")) fail("Status in Arbeit");
  await e1.locator("summary").click();
  if (!(await e1.locator("p").isVisible())) fail("Text nicht aufgeklappt");
  if (await m.locator(".inf-e", { hasText: "Sparplan" }).locator(".inf-st").count()) fail("„geplant“ braucht kein Schild");
  log("Bald: 2 Einträge, „in Arbeit“ mit Schild, „geplant“ ohne, Beschreibung klappt auf");

  await m.locator("[data-tab='fehler']").click();
  if (!(await m.locator(".inf-e .inf-st").innerText()).includes("im nächsten Update")) fail("Fehler: Status auf-test");
  await m.locator("[data-tab='faq']").click();
  await m.locator(".inf-faq summary", { hasText: "Kann ich hier buchen?" }).click();
  if (!(await m.locator(".inf-faq p").first().isVisible())) fail("FAQ-Antwort");
  log("Bekannte Fehler mit „im nächsten Update“, FAQ aus den Daten");
});

test("Link ?info=bald auf Englisch: Texte der gewählten Sprache, fehlende auf Deutsch", async ({ open }) => {
  const p = await start(open);
  await p.addInitScript(() => localStorage.setItem("rk-lang", "en"));
  await p.goto(URL + "?info=bald");
  const me = p.locator(".modal", { hasText: "What's new & next" });
  await me.locator(".inf-e", { hasText: "Public holidays in the calendar" }).waitFor();
  if (!(await me.locator(".inf-e", { hasText: "Sparplan je Reise" }).count())) fail("ohne Englisch: Deutsch als Rückfall");
  if (p.url().includes("info")) fail("?info bleibt in der Adresse");
  log("Link ?info=bald öffnet den Reiter direkt, englische Texte, fehlende auf Deutsch");
});

test("Such-Dienst nicht erreichbar: Hinweis, mitgelieferte Fragen bleiben", async ({ open }) => {
  const state = { down: true, asked: 0 };
  const p = await start(open, state);
  await p.goto(URL + "?info");
  const md = p.locator(".modal", { hasText: "Neues & Ausblick" });
  await md.locator(".inf-empty", { hasText: "nicht erreichbar" }).waitFor();
  await md.locator("[data-tab='faq']").click();
  if ((await md.locator(".inf-faq details").count()) < 5) fail("mitgelieferte Fragen fehlen");
  if (!(await md.locator(".inf-faq summary").first().innerText()).includes("Split&Fly")) fail("erste Frage");
  log(`Ohne Daten: Hinweis, FAQ aus der App (${await md.locator(".inf-faq details").count()} Fragen); Abrufe: ${state.asked}`);
});
