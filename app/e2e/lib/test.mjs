/*
 * Gemeinsame Grundlage der Ende-zu-Ende-Tests: test mit eigenen Fixtures, dazu die Hilfen, die jede Datei braucht.
 *   open     Seite in eigenem Browser-Kontext öffnen (Handy oder Desktop, Startzustand, Ortsdaten)
 *   errors   Fehler auf den Seiten des Tests; bleibt einer stehen, scheitert der Test
 * Tests mit Konto oder Daten im Emulator nehmen test aus ./konto.mjs (leerer Emulator je Test).
 */
import { test as base, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { URL } from "./env.mjs";

export { expect, URL };
export * from "./nav.mjs";

export const DESKTOP = { viewport: { width: 1280, height: 900 } };
export const PHONE = { viewport: { width: 390, height: 844 } };
/** wie PHONE, zusätzlich mit Berührung und Handy-Darstellung des Browsers */
export const TOUCH = { ...PHONE, isMobile: true, hasTouch: true };

/** Daten, die in der echten Seite neben der App liegen (public/ im Repo), nicht im Build der App */
const PUBLIC = fileURLToPath(new globalThis.URL("../../../public/", import.meta.url));
export const publicFile = name => PUBLIC + name;
/** Ortsdaten, die fast jede Suche braucht (open({ data: true })) */
export const PLACE_DATA = ["world.json", "packs.json", "airports.json"];
/**
 * Dateien aus public/ für eine Seite oder einen Browser-Kontext reichen. list: Dateinamen ("visa.json") oder Ordner
 * mit Schrägstrich ("places/": jede .json darin); was fehlt, antwortet mit 404 wie die echte Seite.
 */
export async function publicData(target, list = PLACE_DATA) {
  for (const f of list) {
    const dir = f.endsWith("/");
    await target.route(dir ? `**/${f}*.json` : `**/${f}`, r => {
      const path = publicFile(dir ? f + r.request().url().split("/").pop() : f);
      return existsSync(path) ? r.fulfill({ path }) : r.fulfill({ status: 404, body: "" });
    });
  }
}

/*
 * Die App scrollt weich (html{scroll-behavior:smooth}). Playwright scrollt vor jedem Klick zum Ziel; läuft das als
 * Animation, kann die Seite sich zwischen Drücken und Loslassen noch bewegen und der Klick geht verloren (unter Last
 * gesehen). In den Tests deshalb sofort scrollen; Sprünge, die die App selbst weich ausführt, bleiben weich.
 */
function instantScroll() {
  addEventListener("DOMContentLoaded", () => {
    const s = document.createElement("style");
    s.textContent = "html{scroll-behavior:auto!important}";
    (document.head || document.documentElement)?.append(s);
  });
}

export const test = base.extend({
  // Startzeitpunkt für E2E_ZEIT (lap)
  zeit: [async ({}, use, info) => { laps.set(info.testId, Date.now()); await use(); laps.delete(info.testId); }, { auto: true }],

  errors: async ({}, use) => {
    const errors = [];
    await use(errors);
    expect(errors, "Fehler auf der Seite").toEqual([]);
  },

  /**
   * open({ name, init, data, ignore, ...Kontext }) → Seite
   *   name    steht vor Fehlern der Seite (mehrere Personen in einem Test)
   *   init    Funktion oder [Funktion, Wert], läuft vor jedem Laden (z. B. Reise in localStorage legen)
   *   data    Daten aus public/ reichen: true für die Ortsdaten (PLACE_DATA) oder eine eigene Liste (publicData)
   *   ignore  Fehler der Seite, die zum Test gehören (RegExp)
   * Alles Weitere geht an den Browser-Kontext (viewport, locale, timezoneId, userAgent …); ohne Angabe Desktop.
   */
  open: async ({ browser, errors }, use) => {
    const made = [];
    await use(async ({ name = "", init, data = false, ignore, ...opts } = {}) => {
      const ctx = await browser.newContext(opts);
      made.push(ctx);
      await ctx.addInitScript(instantScroll);
      if (init) await ctx.addInitScript(...[].concat(init));
      if (data) await publicData(ctx, data === true ? PLACE_DATA : data);
      const p = await ctx.newPage();
      p.on("pageerror", e => { if (!ignore?.test(e.message)) errors.push(name ? `${name}: ${e.message}` : e.message); });
      return p;
    });
    await Promise.all(made.map(c => c.close()));
  }
});

/** Zwischenstand: steht in der Ausgabe und als Schritt im Bericht (zeigt, wie weit ein gescheiterter Test kam) */
export function log(...a) {
  const text = a.join(" ");
  console.log("•", lap() + text);
  void test.step(text, () => {});
}
// E2E_ZEIT=1: vor jedem Zwischenstand die Sekunden seit dem vorigen (zeigt, welcher Schritt eines Tests lange dauert)
const laps = new Map();
function lap() {
  if (!process.env.E2E_ZEIT) return "";
  const id = test.info().testId, now = Date.now(), last = laps.get(id) ?? now;
  laps.set(id, now);
  return `(+${((now - last) / 1000).toFixed(1)} s) `;
}

export const fail = m => { throw new Error(m); };

/** warten, bis fn wahr liefert (alle 150 ms); was: Text für die Fehlermeldung */
export function until(fn, what, ms = 15000) {
  return test.step("warten: " + what, async () => {
    const end = Date.now() + ms;
    for (;;) {
      if (await fn()) return;
      if (Date.now() > end) fail("Zeit abgelaufen: " + what);
      await new Promise(r => setTimeout(r, 150));
    }
  }, { box: true });
}

/**
 * wie until, aber ohne Fehler, wenn es nicht eintritt (liefert dann false): für Stellen, an denen die Prüfung danach
 * den genauen Stand meldet
 */
export async function soon(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await fn()) return true;
    if (Date.now() > end) return false;
    await new Promise(r => setTimeout(r, 150));
  }
}

/** zwei Bilder abwarten: was die Seite gerade bekommen hat, steht danach in der Anzeige */
export const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/**
 * Reisen als Startzustand: für open({ init: seedTrips([TRIP]) }); legt sie nur an, solange der Browser noch keine hat.
 * current: Kennung der zuletzt offenen Reise (ohne Angabe die erste, false: keine); extra: weitere Einträge für localStorage.
 */
export const seedTrips = (trips, { current, extra = {} } = {}) => [({ trips, current, extra }) => {
  if (localStorage.getItem("rk2-index")) return;
  for (const t of trips) localStorage.setItem("rk2-t:" + t.id, JSON.stringify(t));
  localStorage.setItem("rk2-index", JSON.stringify(trips.map(t => ({ id: t.id, name: t.name, place: t.place, from: t.from, to: t.to, people: t.travelers?.length }))));
  if (current) localStorage.setItem("rk2-current", current);
  for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
}, { trips, current: current === false ? "" : current ?? trips[0]?.id, extra }];

/** Such-Dienst nachstellen: Antwort mit den Kopfzeilen, die der Browser für die fremde Adresse verlangt */
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };
export const reply = (route, body, status = 200) => route.request().method() === "OPTIONS"
  ? route.fulfill({ status: 204, headers: CORS })
  : route.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
