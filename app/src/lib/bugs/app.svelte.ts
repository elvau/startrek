/*
 * Fehlermeldungen in der App: letzte Fehler im Browser mitschneiden, Bild verkleinern,
 * Meldung mit Anmelde-Nachweis an den Such-Dienst schicken.
 */
import { i18n, t, type Key } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { idToken } from "../cloud/cloud.svelte";
import { app, calc, tripMode } from "../store.svelte";
import type { BugReport } from "./types";
import { recentErrors } from "./log";

export const bugDialog = $state({ open: false });


/** Ansicht ohne persönliche Daten: Startseite oder Reise, Modus, Personen, Zahl der Posten */
function view(): string {
  if (app.home) return "Startseite";
  return `Reise · ${tripMode()} · ${calc.T.active} Pers. · ${app.trip.items.length} Posten`;
}

export function collect(text: string): BugReport {
  return {
    text, page: location.href.split("#")[0], lang: i18n.lang, ua: navigator.userAgent,
    screen: `${innerWidth}×${innerHeight}`, version: __APP_VERSION__, errors: recentErrors(), view: view()
  };
}

/** Bild auf höchstens 1600 px verkleinern und als JPEG speichern (Handyfotos haben oft mehrere MB) */
export async function shrink(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error(t("bug.imgFailed")))), "image/jpeg", 0.82));
}

const ERR: Record<number, Key> = { 401: "bug.err.login", 413: "bug.err.big", 415: "bug.err.type", 429: "bug.err.limit", 503: "bug.err.setup" };

export async function sendBug(text: string, image?: Blob | null): Promise<{ number?: number }> {
  if (!FLIGHTS_URL) throw new Error(t("bug.err.setup"));
  const token = await idToken();
  if (!token) throw new Error(t("bug.err.login"));
  const f = new FormData();
  f.set("report", JSON.stringify(collect(text)));
  if (image) f.set("image", image, "bild.jpg");
  const res = await fetch(`${FLIGHTS_URL}/bug`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: f });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(ERR[res.status] ? t(ERR[res.status]) : i18n.lang === "de" && data.error ? data.error : t("search.status", { s: res.status }));
  return data;
}
