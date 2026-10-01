/*
 * Gruppen und einfacher Modus, gegen die Firebase-Emulatoren.
 * Start: npm run test:cloud (läuft nach e2e/cloud.mjs)
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const URL = "http://127.0.0.1:4174/";
const log = (...a) => console.log("•", ...a);
const fail = m => { throw new Error(m); };

const server = spawn("npx", ["vite", "preview", "--outDir", "dist-emu", "--port", "4174", "--strictPort", "--host", "127.0.0.1"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const errors = [];
async function page(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-DE" });
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(`${name}: ${e.message}`));
  p.on("dialog", d => d.accept(d.type() === "prompt" ? "Kegeltruppe" : undefined));
  return p;
}
async function until(fn, what, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return; await new Promise(r => setTimeout(r, 250)); }
  fail("Zeitüberschreitung: " + what);
}
const total = p => p.locator(".tk-top b").textContent();
const menu = async p => { await p.evaluate(() => scrollTo(0, 0)); await p.locator(".top .tm-btn").first().click(); };

try {
  const a = await page("Anna");
  await a.goto(URL);
  await a.locator(".start .home-new").click();
  if (!(await a.locator(".modal .who-b.on").textContent()).includes("Solo")) fail("Solo nicht vorausgewählt");
  await a.locator(".modal .newtrip .btn.primary").click();
  const solo = await a.locator(".person:not(.add) b").allTextContents();
  if (solo.length !== 1 || solo[0].includes(" ")) fail("Start nicht mit einem Tier: " + solo);
  log("Erster Start: 1-Personen-Reise als", solo[0]);

  // Gruppen und Personen anlegen
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".top .grp-btn").click();
  const d = a.locator(".modal");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("input").fill("Familie Klein");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("button").click();
  const addP = async (f, l) => {
    const form = d.locator("form", { hasText: "Vorname" });
    await form.locator("input").nth(0).fill(f);
    await form.locator("input").nth(1).fill(l);
    await form.locator("button").click();
  };
  // Pflichtfelder
  await d.locator("form", { hasText: "Vorname" }).locator("input").nth(0).fill("Ohne");
  await d.locator("form", { hasText: "Vorname" }).locator("button").click();
  if (!(await d.locator(".err", { hasText: "Pflicht" }).count())) fail("Nachname nicht als Pflicht erkannt");
  await addP("Dani", "Klein");
  await addP("Monika", "Klein");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("input").fill("Kegeln");
  await d.locator("form", { hasText: "Neue Gruppe" }).locator("button").click();
  await d.locator(".grp.open .chip", { hasText: "Monika Klein" }).click();
  await addP("Uwe", "Schmitz");
  const groups = await d.locator(".grp-h").allTextContents();
  if (!groups.some(g => g.includes("Familie Klein") && g.includes("2 Personen")) || !groups.some(g => g.includes("Kegeln") && g.includes("2 Personen"))) fail("Gruppen falsch: " + groups);
  log("Gruppen angelegt, Monika ist in beiden:", groups.map(g => g.replace(/\s+/g, " ")).join(" | "));
  await a.keyboard.press("Escape");

  // Neue Reise für die Kegelgruppe, einfacher Modus
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".top .tm-plus").click();
  if (await a.locator(".newtrip label", { hasText: "Wohin" }).count()) fail("Wohin noch im Dialog");
  if (!(await a.locator(".newtrip .who-b.on").textContent()).includes("Solo")) fail("Solo nicht vorausgewählt");
  // Gruppe: erst der Weg (nichts vorausgewählt), dann die gespeicherte Gruppe antippen
  await a.locator(".newtrip .who-b", { hasText: "Gruppe" }).click();
  if (await a.locator(".newtrip .src-b.on").count()) fail("Weg vorausgewählt");
  if (!(await a.locator(".newtrip .btn.primary").isDisabled())) fail("Anlegen ohne Weg möglich");
  await a.locator(".newtrip .src-b", { hasText: "Aus meinen Gruppen" }).click();
  await a.locator(".newtrip .sg-h", { hasText: "Kegeln" }).click();
  await a.locator(".newtrip .btn.primary", { hasText: "Reise mit Kegeln anlegen (2 Personen)" }).click();
  await until(async () => (await a.locator(".hero h1").textContent()).startsWith("Neue Reise"), "neue Reise offen");
  // Ort und Zeitraum oben in der Reise: der Name bildet sich daraus
  await a.locator(".top-edit").click();
  await a.locator(".trip-ed label", { hasText: "Ort" }).locator("input").fill("Mosel");
  await a.locator(".trip-ed label", { hasText: "Von" }).locator("input").fill("2027-05-06");
  await a.locator(".trip-ed label", { hasText: "Bis" }).locator("input").fill("2027-05-09");
  await a.locator(".trip-ed .btn", { hasText: "Fertig" }).click();
  await until(async () => (await a.locator(".hero h1").textContent()).includes("Mosel"), "Ort eingetragen");
  const tname = await a.locator(".top .tm-name").first().textContent();
  if (tname !== "Mosel · Mai 2027 · 4 Tage") fail("Name: " + tname);
  await menu(a);
  const listed = await a.locator(".tm-trip").allInnerTexts();
  if (listed.length !== 1) fail("leere Reise nicht weggeräumt: " + listed.join(" | "));
  await a.keyboard.press("Escape");
  log("Name aus Ziel und Zeitraum:", tname, "· leere Startreise weggeräumt");

  // Umbenennen direkt an der Überschrift: eigener Name steht groß, Ort wandert in die Zeile darunter
  await a.locator(".hero h1.h1-name").click();
  await a.keyboard.press("ControlOrMeta+a");
  await a.keyboard.type("Kegeltour 2027");
  await a.keyboard.press("Enter");
  await until(async () => (await a.locator(".hero h1").textContent()).startsWith("Kegeltour 2027"), "eigener Name");
  if ((await a.locator(".top .tm-name").first().textContent()) !== "Kegeltour 2027") fail("Name oben nicht übernommen");
  if (!(await a.locator(".hero .meta").textContent()).startsWith("Mosel")) fail("Ort nicht unter dem Namen");
  log("Umbenannt direkt in der Überschrift: „Kegeltour 2027“, darunter Mosel");
  const names = (await a.locator(".person:not(.add) b").allTextContents()).join(", ");
  if (names !== "Monika Klein, Uwe Schmitz") fail("Reisende: " + names);
  if ((await a.locator(".simple-card").count()) !== 5) fail("nicht alle Bereiche einfach");
  log("Neue Reise für „Kegeln“:", names, "· alle Bereiche einfach");

  const amount = async (cat, v) => { const i = a.locator(`#${cat} .simple-in input`); await i.scrollIntoViewIfNeeded(); await i.fill(v); };
  await amount("flights", "600");
  await amount("stay", "900");
  await until(async () => (await total(a)) === "1.500 €", "Summe 1.500 €");
  const pp = await a.locator("#stay .simple-out b").textContent();
  if (pp !== "450 €") fail("Unterkunft pro Person: " + pp);
  log("Einfach: 600 € + 900 € = 1.500 €, Unterkunft 450 € pro Person");

  // Dani dazu, Uwe nicht dabei
  await a.locator("#trav .card").scrollIntoViewIfNeeded();
  await a.locator(".trav-acts .linkbtn", { hasText: "Aus Gruppe hinzufügen" }).click();
  await a.locator(".pick .chip", { hasText: "Familie Klein" }).click();
  await a.locator(".person", { hasText: "Uwe" }).locator(".dabei").click();
  await until(async () => (await a.locator("#stay .simple-out b").textContent()) === "450 €", "zwei Aktive");
  const hh = await a.evaluate(() => [...document.querySelectorAll(".share .sh-head")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  if (hh.length !== 1 || !hh[0].startsWith("Klein") || !hh[0].includes("1.500 €")) fail("pro Familie: " + hh);
  log("Dani dazu, Uwe nicht dabei: 2 Aktive, Familie Klein zahlt 1.500 €");

  // Flüge auf detailliert und zurück, ohne dass sich die Summe ändert
  await a.locator("#flights .mode button", { hasText: "Detailliert" }).click();
  await a.locator("#flights .card.edit").waitFor();
  if ((await total(a)) !== "1.500 €") fail("Summe nach Umschalten: " + await total(a));
  const ppIn = await a.locator("#flights .card.edit input[inputmode=decimal]").evaluateAll(xs => xs.map(x => x.value));
  if (!ppIn.some(v => v.startsWith("300"))) fail("Preis pro Person nicht 300: " + ppIn);
  log("Detailliert: neuer Posten offen, 600 € als 300 € pro Person");
  await a.locator("#flights .mode button", { hasText: "Einfach" }).click();
  await a.locator("#flights .simple-hidden").waitFor();
  if ((await total(a)) !== "1.500 €") fail("Summe nach Zurückschalten: " + await total(a));
  const fl = await a.locator(".aside .cat", { hasText: "Flüge" }).first().textContent();
  if (!fl.includes("Gesamtbetrag gleich verteilt")) fail("Übersicht Flüge: " + fl);
  await a.locator("#flights .mode button", { hasText: "Detailliert" }).click();
  await a.locator("#flights .card[data-item]").waitFor();
  if ((await a.locator("#flights .card[data-item]").count()) !== 1) fail("Posten doppelt nach Wiederherstellen");
  if (await a.locator("#flights .card.edit").count()) fail("beim Wiederherstellen sollte die Liste kommen, kein Editor");
  await a.locator("#flights .mode button", { hasText: "Einfach" }).click();
  await a.locator("#flights .simple-hidden").waitFor();
  log("Flüge detailliert und zurück: Betrag wird Posten und umgekehrt, Summe bleibt 1.500 €");

  // Schnell mit Platzhaltern: zwei Tierfamilien (zufällige Tiere)
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".top .tm-plus").click();
  await a.locator(".newtrip .who-b", { hasText: "Familie" }).click();
  if (await a.locator(".newtrip .qf").count()) fail("Tiere vorausgewählt");
  await a.locator(".newtrip .src-b", { hasText: "Mit Platzhalter-Tieren" }).click();
  const qf = a.locator(".newtrip .qf");
  await qf.locator(".linkbtn").click();
  // erste Familie: 2 Erwachsene, 3 Kinder; zweite: 2 Erwachsene, 2 Kinder, 1 Kleinkind
  for (let k = 0; k < 3; k++) await qf.locator(".qf-row").nth(0).locator('[aria-label="Kinder mehr"]').click();
  for (let k = 0; k < 2; k++) await qf.locator(".qf-row").nth(1).locator('[aria-label="Kinder mehr"]').click();
  await qf.locator(".qf-row").nth(1).locator('[aria-label="Kleink. mehr"]').click();
  const fams = await qf.locator(".qf-row select").evaluateAll(xs => xs.map(x => x.value));
  const [A, B] = fams;
  if (fams.length !== 2 || A === B) fail("Familien: " + fams);
  await a.locator(".newtrip .btn", { hasText: "Reise anlegen" }).click();
  await until(async () => (await a.locator(".person:not(.add) b").count()) === 10, "Familien-Reise offen");
  const ph = await a.locator(".person:not(.add) b").allTextContents();
  if (ph.length !== 10 || ph[0] !== `${A} Erw. 1` || ph[9] !== `${B} Kleinkind 1`) fail("Platzhalter: " + ph);
  const kids = await a.locator(".person", { hasText: `${A} Kind 1` }).locator("span").allTextContents();
  if (!kids.some(x => x.includes("Kind"))) fail("Kind nicht als Kind: " + kids);
  const baby = await a.locator(".person", { hasText: `${B} Kleinkind 1` }).locator("span").allTextContents();
  if (!baby.some(x => x.includes("Kleinkind"))) fail("Kleinkind nicht als Kleinkind: " + baby);
  await amount("stay", "1000");
  await until(async () => (await a.locator("#stay .simple-out b").textContent()) === "100 €", "100 € pro Person");
  const hh2 = await a.evaluate(() => [...document.querySelectorAll(".share .sh-head")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  if (hh2.length !== 2 || !hh2.every(x => x.includes("500 €"))) fail("pro Familie: " + hh2);
  await a.locator("#trav .card").scrollIntoViewIfNeeded();
  await a.locator(".trav-acts .linkbtn", { hasText: "Als Gruppe speichern" }).click();
  await a.locator(".trav-note", { hasText: "Platzhalter werden nicht gespeichert" }).waitFor();
  // Platzhalter durch gespeicherte Person ersetzen
  await a.locator(".person", { hasText: `${A} Erw. 1` }).locator(".repl").click();
  const cand = await a.locator(".repl-pick .chip").allTextContents();
  if (!cand.some(c => c.includes("Dani Klein"))) fail("Kandidaten: " + cand);
  await a.locator(".repl-pick .chip", { hasText: "Dani Klein" }).click();
  const after = await a.locator(".person:not(.add) b").allTextContents();
  if (after.length !== 10 || after[0] !== "Dani Klein" || after.includes(`${A} Erw. 1`)) fail("nach Ersetzen: " + after);
  const hh3 = await a.evaluate(() => [...document.querySelectorAll(".share .sh-head")].map(x => x.textContent.replace(/\s+/g, " ").trim()));
  if (!hh3.some(x => x.startsWith("Klein") && x.includes("100 €"))) fail("Klein nach Ersetzen: " + hh3);
  // × an der Person: schnell entfernen (mit Rückfrage), ohne „Personen bearbeiten“
  await a.locator(".person", { hasText: `${B} Kleinkind 1` }).locator(".p-x").click();
  await until(async () => (await a.locator(".person:not(.add) b").count()) === 9, "Kleinkind entfernt");
  if ((await a.locator(".person:not(.add) b").allTextContents()).includes(`${B} Kleinkind 1`)) fail("Kleinkind noch da");
  log("× entfernt einen Platzhalter direkt");
  log(`„${A} Erw. 1“ durch die gespeicherte`, " Dani Klein ersetzt, Familie Klein zahlt 100 €");
  log(`Platzhalter: Familie ${A} (2+3) und ${B} (2+2+1 Kleinkind)`, " 1.000 € → 100 € pro Person, je Familie 500 €, nicht als Gruppe gespeichert");

  // Anmelden: Gruppen landen im Konto und sind auf einem zweiten Gerät da
  await a.evaluate(() => scrollTo(0, 0));
  await a.locator(".top .acct .tm-btn", { hasText: "Anmelden" }).click();
  await a.locator(".login .test input").fill("Anna");
  await a.locator(".login .test button").click();
  await a.locator(".top .acct-btn").waitFor();
  await new Promise(r => setTimeout(r, 2000));
  const b = await page("Anna2");
  await b.goto(URL);
  await b.locator(".start .linkbtn", { hasText: "Konto anlegen" }).click();
  await b.locator(".login .test input").fill("Anna");
  await b.locator(".login .test button").click();
  await b.locator(".top .acct-btn").waitFor();
  await b.locator(".top .grp-btn").click();
  await until(async () => (await b.locator(".modal .grp-h").count()) === 2, "Gruppen auf zweitem Gerät");
  log("Gruppen sind nach der Anmeldung auf dem zweiten Gerät da");

  // Details einer Person: Geburtsdatum, Wohnort, Buchungsdaten (nur im Konto)
  const bd = b.locator(".modal");
  await bd.locator('.pmore[aria-label="Details zu Uwe"]').click();
  const det = bd.locator(".pdet");
  await det.locator("label", { hasText: "Geburtsdatum" }).locator("input").fill("1975-03-10");
  await det.locator("label", { hasText: "Wohnort" }).locator("input").fill("41236");
  await until(async () => (await det.locator("label", { hasText: "Wohnort" }).locator("input").inputValue()) === "41236 Mönchengladbach", "Wohnort erkannt");
  await det.locator(".pdocs .linkbtn", { hasText: "Buchungsdaten anzeigen" }).click();
  await det.locator("label", { hasText: "Reisepass-Nr." }).locator("input").fill("C01X00T47");
  await det.locator("label", { hasText: "Personalausweis-Nr." }).locator("input").fill("L01X00T47");
  await det.locator("label", { hasText: "Vornamen laut Ausweis" }).locator("input").fill("Uwe Heinrich");
  await det.locator(".pdocs", { hasText: "Im Konto gespeichert" }).waitFor();
  const sum = await bd.locator('.pmore[aria-label="Details zu Uwe"]').textContent();
  if (!sum.includes("Mönchengladbach") || !sum.includes("🔒")) fail("Übersicht der Person: " + sum);
  // im Konto (Emulator, als Verwalter gelesen), aber nicht im Browser-Speicher
  const docsIn = async () => {
    const r = await fetch("http://127.0.0.1:8080/v1/projects/demo-reisekasse/databases/(default)/documents/travelDocs", { headers: { Authorization: "Bearer owner" } });
    return JSON.stringify(await r.json());
  };
  await until(async () => (await docsIn()).includes("C01X00T47"), "Buchungsdaten im Konto");
  const stored = await b.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  if (stored.includes("C01X00T47") || stored.includes("L01X00T47") || stored.includes("Heinrich")) fail("Buchungsdaten im localStorage");
  if (!stored.includes("1975-03-10") || !stored.includes("41236")) fail("Geburtsdatum/Wohnort nicht bei der Person");
  const idb = await b.evaluate(async () => {
    const out = [];
    for (const info of await indexedDB.databases()) {
      const db = await new Promise((res, rej) => { const r = indexedDB.open(info.name); r.onsuccess = () => res(r.result); r.onerror = rej; });
      for (const st of db.objectStoreNames) {
        const all = await new Promise(res => { const r = db.transaction(st).objectStore(st).getAll(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); });
        out.push(JSON.stringify(all));
      }
      db.close();
    }
    return out.join("");
  });
  if (idb.includes("C01X00T47")) fail("Buchungsdaten im Firestore-Zwischenspeicher des Browsers");
  log("Uwe: Geburtsdatum und Wohnort bei der Person, Buchungsdaten nur im Konto (nicht im Browser-Speicher)");

  // nach dem Neuladen wieder da, erst auf Wunsch geladen
  await b.reload();
  await b.locator(".top .grp-btn").click();
  await until(async () => (await b.locator(".modal .grp-h").count()) === 2, "Gruppen nach Neuladen");
  await b.locator('.modal .pmore[aria-label="Details zu Uwe"]').click();
  await b.locator(".modal .pdocs .linkbtn", { hasText: "Buchungsdaten anzeigen" }).click();
  await until(async () => (await b.locator(".modal .pdet label", { hasText: "Reisepass-Nr." }).locator("input").inputValue().catch(() => "")) === "C01X00T47", "Buchungsdaten geladen");
  await b.locator(".modal .pdocs .linkbtn", { hasText: "Buchungsdaten dieser Person löschen" }).click();
  await until(async () => !(await docsIn()).includes("C01X00T47"), "Buchungsdaten gelöscht");
  log("Buchungsdaten nach Neuladen aus dem Konto geladen und wieder gelöscht");
  await b.keyboard.press("Escape");

  // Reise mit Uwe: Alter zum Reisebeginn aus dem Geburtsdatum, Wohnort für die Familie Schmitz
  await b.locator(".start .home-new").click();
  await b.locator(".newtrip .who-b", { hasText: "Gruppe" }).click();
  await b.locator(".newtrip .src-b", { hasText: "Aus meinen Gruppen" }).click();
  await b.locator(".newtrip .sg-h", { hasText: "Kegeln" }).click();
  await b.locator(".newtrip .btn.primary", { hasText: "Reise mit Kegeln anlegen" }).click();
  await until(async () => (await b.locator(".hero h1").textContent()).startsWith("Neue Reise"), "Reise mit Uwe offen");
  await b.locator(".top-edit").click();
  await b.locator(".trip-ed label", { hasText: "Von" }).locator("input").fill("2027-03-01");
  await b.locator(".trip-ed label", { hasText: "Bis" }).locator("input").fill("2027-03-05");
  await b.locator(".trip-ed .btn", { hasText: "Fertig" }).click();
  const tripData = () => b.evaluate(() => JSON.parse(localStorage.getItem("rk2-t:" + localStorage.getItem("rk2-current")) || "{}"));
  await until(async () => { const t = await tripData(); return t.travelers?.find(x => x.name === "Uwe")?.age === 51 && t.households?.Schmitz?.geo?.ort === "Mönchengladbach"; }, "Alter 51 und Wohnort in der Reise");
  if (JSON.stringify(await tripData()).includes("1975-03-10")) fail("Geburtsdatum in der Reise");
  log("Reise ab 1. März 2027: Uwe ist 51, Familie Schmitz fährt ab Mönchengladbach (Geburtsdatum selbst nicht in der Reise)");

  // Startseite: Reise direkt löschen (Konto-Reise, eigene)
  await b.evaluate(() => scrollTo(0, 0));
  await b.locator(".top .brand-btn").click();
  await until(async () => (await b.locator(".ht-wrap").count()) > 0, "Reisen auf der Startseite");
  const n0 = await b.locator(".ht-wrap").count();
  const victim = await b.locator(".ht-wrap .home-trip b").first().textContent();
  await b.locator(".ht-wrap .ht-del").first().click();
  await until(async () => (await b.locator(".ht-wrap").count()) === n0 - 1, "Reise von der Startseite gelöscht");
  await new Promise(r => setTimeout(r, 1500));
  if ((await b.locator(".ht-wrap").count()) !== n0 - 1) fail("nach dem Löschen taucht eine Reise auf: " + await b.locator(".ht-wrap .home-trip b").allTextContents());
  log(`Startseite: „${victim.replace("☁ ", "")}“ mit 🗑 gelöscht (${n0} → ${n0 - 1} Reisen)`);

  if (errors.length) fail("Fehler im Browser: " + errors.join(" | "));
  // Neue Gruppe beim Anlegen: Uwe hineinziehen, Monika antippen, Lea neu (Nachname aus dem Gruppennamen)
  await b.locator(".start .home-new").click();
  await b.locator(".newtrip .who-b", { hasText: "Familie" }).click();
  await b.locator(".newtrip .src-b", { hasText: "Neue Gruppe anlegen" }).click();
  await b.locator(".newtrip .ng-name").fill("Familie Schmitz");
  await b.locator(".newtrip .ng-pool .chip", { hasText: "Uwe Schmitz" }).dragTo(b.locator(".newtrip .ng-zone"));
  await b.locator(".newtrip .ng-pool .chip", { hasText: "Monika Klein" }).click();
  const add = b.locator(".newtrip .ng-add");
  await add.locator("label", { hasText: "Vorname" }).locator("input").fill("Lea");
  await add.locator("label", { hasText: "Alter" }).locator("input").fill("8");
  await add.locator(".btn", { hasText: "Hinzufügen" }).click();
  const inGroup = await b.locator(".newtrip .ng-zone .ng-chip").allTextContents();
  if (inGroup.length !== 3 || !inGroup[0].includes("Uwe") || !inGroup[2].includes("Lea Schmitz")) fail("neue Gruppe: " + inGroup);
  await b.locator(".newtrip .btn.primary", { hasText: "Reise mit Familie Schmitz anlegen (3 Personen)" }).click();
  await until(async () => (await b.locator(".person:not(.add) b").count()) === 3, "Reise der neuen Gruppe offen");
  const saved = await b.evaluate(() => { const d = JSON.parse(localStorage.getItem("rk2-dir") || "{}"); const g = d.groups.find(x => x.name === "Familie Schmitz"); return g && g.memberIds.map(id => d.people.find(p => p.id === id)); });
  if (!saved || saved.length !== 3 || saved[2].first !== "Lea" || saved[2].last !== "Schmitz" || saved[2].age !== 8) fail("Gruppe nicht gespeichert: " + JSON.stringify(saved));
  log("Neue Gruppe beim Anlegen: Uwe gezogen, Monika angetippt, Lea neu; „Familie Schmitz“ gespeichert, Reise mit 3 Personen");

  console.log("\nAlle Schritte erfolgreich.");
} finally {
  await browser.close();
  server.kill();
}
