/*
 * Familie stimmt mit (#585): eine Familie mit drei Erwachsenen. Anna stimmt ab, das zählt auch für die beiden anderen
 * (abwählbar). Oma verknüpft sich später: Hinweis „Anna hat bisher für dich abgestimmt“, „Weiter wie Anna“ folgt Annas
 * Änderungen; eigene Stimme geht vor, „wieder wie Anna“ nimmt sie zurück. Termin finden: Omas Zeile wie Annas.
 */
import { test, fail, log, until, URL, autoAsk, login } from "../lib/konto.mjs";

/** Person in eigenem Browser; Rückfragen der App bestätigt sie von selbst */
async function person(open, name) {
  const p = await open({ name });
  autoAsk(p);
  return p;
}
// Abfragen dürfen zwischendurch scheitern (die Liste baut sich beim Abgleich neu auf)
const settled = (fn, what, ms) => until(() => fn().catch(() => false), what, ms);

test("Anna stimmt für die Familie, Oma verknüpft sich und folgt ihr, eigene Stimme geht vor", async ({ open }) => {
  // Anna legt eine Reise für eine Familie mit drei Erwachsenen an, übernimmt sie ins Konto und teilt sie
  const anna = await person(open, "Anna");
  await anna.goto(URL + "?ziel=Rom&land=IT&name=Familie%20Rom&fam=3-0");
  await settled(async () => (await anna.locator(".hero-in").textContent()).includes("Rom"), "Reise offen");
  await anna.locator(".top .acct .tm-btn", { hasText: "Anmelden" }).click();
  await login(anna, "Anna");
  await anna.locator(".top .acct-btn").click();
  await anna.locator(".tm-act", { hasText: "Ins Konto übernehmen" }).click();
  await settled(async () => (await anna.locator(".top .tm-btn").textContent()).includes("☁"), "Reise im Konto");
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
  await settled(async () => (await apoll.locator("li", { hasText: "Pizza" }).innerText()).includes("3 Stimmen") && (await apoll.innerText()).includes("Alle haben abgestimmt."), "Annas Stimme zählt dreifach")
    .catch(async e => { console.log("ANNA:", (await apoll.innerText()).replace(/\s+/g, " ")); throw e; });
  if ((await apoll.locator(".ff-p").count()) !== 2) fail("„Zählt auch für“ nicht mit zwei Personen");
  // abwählen: die dritte Person fehlt dann
  const third = apoll.locator(".ff-p").nth(1);
  const thirdName = (await third.innerText()).replace("✓", "").trim();
  await third.click();
  await settled(async () => (await apoll.innerText()).includes(`Noch nicht abgestimmt: ${thirdName}`) && (await apoll.locator("li", { hasText: "Pizza" }).innerText()).includes("2 Stimmen"), "abgewählt fehlt");
  log(`Zählt auch für: Annas Stimme gilt für die Familie (3 Stimmen), ${thirdName} abgewählt fehlt`);

  // Termin finden: Anna trägt ein, die Zeile der anderen zeigt dasselbe (👪)
  await atg.locator(".tg-open").click();
  await atg.locator(".tg-start").click();
  await atg.locator(".tg-view button", { hasText: "Raster" }).click();
  const row = (side, re) => side.locator("#together .tg-row", { has: side.locator(".tg-name", { hasText: re }) });
  await row(anna, /^Anna/).locator(".tg-c").first().click();

  // Oma tritt bei und verknüpft sich mit der zweiten Person: Hinweis, Familie zählt weiter
  const oma = await person(open, "Oma");
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
  await settled(async () => (await otg.locator(".fb-ask").innerText()).includes("Anna hat bisher für dich abgestimmt") && (await opoll.locator(".pv-like").innerText()).includes("Zählt wie Anna"), "Hinweis bei Oma")
    .catch(async e => { console.log("OMA:", (await otg.innerText()).replace(/\s+/g, " ").slice(0, 900)); throw e; });
  await settled(async () => (await row(anna, /^Oma/).locator(".tg-c").first().innerText()) === "✓" && (await row(anna, /^Oma/).locator(".tg-name").innerText()).includes("👪"), "Omas Zeile wie Annas");
  await otg.locator(".fb-keep").click();
  await settled(async () => !(await otg.locator(".fb-ask").count()) && (await otg.locator(".fb-like select option:checked").innerText()) === "wie Anna", "Oma stimmt wie Anna");
  log("Oma verknüpft sich: Hinweis „Anna hat bisher für dich abgestimmt“, Zeile in Termin finden wie Annas, „Weiter wie Anna“");

  // Anna ändert ihre Stimme: Oma folgt
  await apoll.locator("li", { hasText: "Pasta" }).locator(".pv-for").click();
  await settled(async () => (await opoll.locator("li", { hasText: "Pasta" }).locator(".pv-for").getAttribute("aria-pressed")) === "true"
    && (await apoll.locator("li", { hasText: "Pasta" }).innerText()).includes("2 Stimmen"), "Oma folgt Anna");
  // Oma stimmt selbst: ihre Stimme gilt (auch für die dritte Person, die nur Anna abgewählt hat), „wieder wie Anna“ nimmt sie zurück
  if (await opoll.locator(".ff-p", { hasText: "Anna" }).count()) fail("Oma kann Anna abwählen");
  await opoll.locator("li", { hasText: "Pizza" }).locator(".pv-for").click();
  await settled(async () => (await apoll.locator("li", { hasText: "Pizza" }).innerText()).includes("2 Stimmen") && (await apoll.locator("li", { hasText: "Pasta" }).innerText()).includes("1 Stimme"), "Omas eigene Stimme bei Anna")
    .catch(async e => { console.log("ANNA:", (await apoll.innerText()).replace(/\s+/g, " ")); console.log("OMA:", (await opoll.innerText()).replace(/\s+/g, " ")); throw e; });
  await opoll.locator(".pv-again").click();
  await settled(async () => (await apoll.locator("li", { hasText: "Pasta" }).innerText()).includes("2 Stimmen") && (await opoll.locator(".pv-like").innerText()).includes("Zählt wie Anna")
    && (await apoll.innerText()).includes(`Noch nicht abgestimmt: ${thirdName}`), "wieder wie Anna");
  log("Wie Anna: Oma folgt Annas Änderung, eigene Stimme geht vor (zählt auch für die dritte Person), „wieder wie Anna“ nimmt sie zurück");
});
