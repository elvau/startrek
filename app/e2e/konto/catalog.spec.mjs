/*
 * Reisekatalog (#646): Kachel auf der Startseite, Liste nach Entfernung ab dem Land des Betrachters (hier Schweiz über die
 * Zeitzone, nicht ab Deutschland), Karte mit Zielland und Ziel zuerst, darunter Startpunkte und „~xy € ab …“, Filter, Detail
 * mit Kosten, „Als neue Reise übernehmen“ legt die Reise an. Veröffentlichte Reisen liest der Katalog aus dem Emulator
 * (hier keine); Ortsdaten liegen neben der App und werden gereicht.
 */
import { test, fail, log, until, reply, URL, PHONE } from "../lib/konto.mjs";

test("Liste ab dem Land des Betrachters, Filter, Detail, übernehmen mit Preisprüfung", async ({ open }) => {
  const p = await open({ ...PHONE, locale: "de-CH", timezoneId: "Europe/Zurich", data: true });
  const ctx = p.context();
  // Such-Dienst für die Preisprüfung nach dem Übernehmen (#652): je ein Treffer für Unterkunft und Flug
  const src = [{ id: "t", name: "Test", configured: true, ok: true, count: 1 }];
  const searched = [];
  await ctx.route("https://flights.test/stays/search", r => { searched.push("stay"); return reply(r, { offers: [{ id: "s1", source: "t", sourceName: "Testbett", name: "Finca Sol", total: 2400, currency: "EUR", url: "https://example.com/s" }], sources: src }); });
  await ctx.route("https://flights.test/flights/search", r => { searched.push("flight:" + JSON.parse(r.request().postData() || "{}").from); return reply(r, { offers: [{ price: 1600, currency: "EUR", sourceName: "Testflug", url: "https://example.com/f",
    out: { from: "ZRH", to: "PMI", dep: "2027-06-05T08:00", arr: "2027-06-05T10:00", carriers: ["TA"], stops: 0, minutes: 120, route: ["ZRH", "PMI"] },
    back: { from: "PMI", to: "ZRH", dep: "2027-06-10T18:00", arr: "2027-06-10T20:00", carriers: ["TA"], stops: 0, minutes: 120, route: ["PMI", "ZRH"] } }], sources: src }); });
  await ctx.route("https://flights.test/activities/search", r => reply(r, { activities: [], sources: src }));
  await ctx.route("https://flights.test/{health,rates,click}", r => reply(r, {}));
  await p.goto(URL);
  await p.locator(".start .home-catalog").click();
  await p.locator(".kat-card").first().waitFor();

  // ohne Wohnort: Land aus der Zeitzone (Schweiz), nicht Deutschland
  await until(async () => ((await p.locator(".kat-from").textContent()) || "").includes("🇨🇭"), "Startort Schweiz");
  const first = await p.locator(".kat-card").first().innerText();
  if (!first.includes("Gardasee")) fail("ab der Schweiz sollte der Gardasee vorne stehen: " + first);
  const bands = await p.locator(".kat-band h2").allInnerTexts();
  if (!bands[0]?.startsWith("Mit Auto oder Bahn")) fail("Bänder: " + bands.join(" | "));
  if (!first.includes("~") || !first.includes("Anreise")) fail("Preis mit Anreise fehlt: " + first);
  log(`Liste ab ${(await p.locator(".kat-from").innerText()).split("·")[0].trim()}: ${await p.locator(".kat-card").count()} Reisen, zuerst Gardasee; Bänder ${bands.map(b => b.split(" ").slice(0, 3).join(" ")).join(", ")}`);

  // Filter „Wer reist: Familie“
  await p.locator(".kat-chips .kat-chip", { hasText: "Wer reist" }).click();
  await p.locator(".kat-opts .kat-chip", { hasText: "Familie" }).click();
  await until(async () => (await p.locator(".kat-card").count()) === 3, "drei Familienreisen");
  await p.locator(".kat-reset").click();
  log("Filter Familie: 3 Reisen, zurückgesetzt");

  // Karte: Ziel zuerst (im Bild), darunter mögliche Startpunkte, Preis „ab …“ (Dani, 02.11.)
  const mallorca = p.locator(".kat-card", { hasText: "Gruppenreise Mallorca" });
  if (!(await mallorca.locator(".kat-dest").innerText()).includes("Mallorca")) fail("Ziel nicht im Bild");
  if (!(await mallorca.locator(".kat-pic svg.kmap .km-st").count())) fail("Karte mit Ziel fehlt");
  const start = await mallorca.locator(".kat-start").innerText();
  if (!start.includes("Zürich") || !(await mallorca.locator(".kat-start use[href='#i-plane']").count())) fail("Startpunkte: " + start);
  const from = ((await mallorca.locator(".kat-price small").innerText()).match(/ab (.+)$/) || [])[1];
  if (!from || !start.includes(from)) fail("Preis ohne Startpunkt: " + (await mallorca.locator(".kat-price small").innerText()));

  // Detail: Bild mit Ziel, Startpunkte, Kosten nach Bereichen, Touren
  await mallorca.click();
  await p.locator(".kat-box").waitFor();
  if (!(await p.locator(".kat-pic.big .kat-dest").innerText()).includes("Mallorca")) fail("Detail: Ziel fehlt");
  const rows = await p.locator(".kat-rows li b").allInnerTexts();
  if (rows[0] !== "Anreise (geschätzt)" || !rows.includes("Unterkunft")) fail("Kostenzeilen: " + rows.join(", "));
  if (!(await p.locator(".kat-tours li").count())) fail("Touren fehlen");
  if ((await p.evaluate(() => document.documentElement.scrollWidth)) > 390) fail("Detail breiter als das Handy");
  log(`Mallorca: Karte mit Ziel, ${start.replace(/\s+/g, " ").trim()}, Kosten ${rows.join(", ")}`);

  // übernehmen (#647): Reisebeginn, nur einzelne Touren; Anreise ab dem Startort, keine Zeile „ab Deutschland“
  await p.locator(".kat-take .btn").click();
  await p.locator(".kat-form").waitFor();
  await p.locator(".kat-when input").fill("2027-06-05");
  await p.locator(".kat-modes label", { hasText: "Einzelne" }).click();
  await p.locator(".kat-form .kat-tours input").first().uncheck();
  await p.locator(".kat-form .kat-take .btn").click();
  const current = () => p.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "null"));
  await until(async () => (await current())?.place === "Mallorca", "Reise Mallorca angelegt", 15000);
  const saved = await current();
  if (saved.travelers.length !== 8) fail("Gruppe falsch: " + saved.travelers.length);
  if (saved.from !== "2027-06-05" || saved.to !== "2027-06-10") fail("Zeitraum: " + saved.from + "–" + saved.to);
  const fl = saved.items.filter(i => i.cat === "flights");
  if (fl.length !== 1 || !fl[0].name.startsWith("Hin- und Rückflug ab ") || fl[0].name.includes("Deutschland")) fail("Anreise: " + fl.map(i => i.name).join(", "));
  if (saved.items.some(i => i.cat === "attractions" && !i.auto)) fail("abgewählte Tour übernommen");
  const stay = saved.items.find(i => i.cat === "stay" && !i.auto);
  if (stay?.from !== "2027-06-05" || stay?.to !== "2027-06-10") fail("Unterkunft ohne Zeitraum");
  // Preise prüfen (#652): startet von selbst, Unterkunft und Flug mit Angebot, Richtwert bleibt als Option
  const pc = p.locator(".pc");
  await pc.waitFor({ timeout: 15000 });
  await until(async () => (await pc.locator(".pc-sum").count()) > 0, "Preisprüfung fertig", 20000);
  const pcRows = await pc.locator(".pc-rows li").allInnerTexts();
  if ((await pc.locator(".pc-ok").count()) < 2) fail("Preisprüfung: " + pcRows.join(" | ") + " / gesucht: " + searched.join(", "));
  if (!(await pc.locator(".pc-sum").innerText()).includes("→")) fail("Summe der Prüfung fehlt");
  // Flug ab dem Startort des Postens (Bern), nicht ab Standard-Flughäfen
  if (!searched.includes("flight:BRN")) fail("Flug nicht ab Bern gesucht: " + searched.join(", "));
  if (process.env.SHOTS) await pc.screenshot({ path: `${process.env.SHOTS}/preise.png` });
  await until(async () => (await current())?.catalog?.check?.rows?.length > 0, "Prüfung gespeichert");
  const checked = await current();
  const st = checked.items.find(i => i.cat === "stay" && !i.auto);
  if (st.options.length !== 2 || st.options.find(o => o.id === st.chosen)?.label !== "Finca Sol" || !st.options.some(o => o.estimate)) fail("Unterkunft nach der Prüfung: " + JSON.stringify(st.options.map(o => o.label)));
  log(`Preise geprüft: ${pcRows.map(x => x.replace(/\s+/g, " ")).join(" | ")}; gesucht ${searched.join(", ")}`);
  log(`Übernommen: „${saved.name}“, ${saved.travelers.length} Personen, ${saved.from} bis ${saved.to}, ${fl[0].name}, ${saved.items.filter(i => !i.auto).length} Posten, ohne abgewählte Tour`);
});
