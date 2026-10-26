/*
 * Angaben „Nur für dich“ der gespeicherten Personen (Geschlecht, Ablauf von Ausweis und Pass, Staatsangehörigkeiten, LGBTQ+).
 * Liegen nur im Konto (travelDocs/{uid}):
 * nicht im Browser-Speicher, nicht in Reisen, nicht beim KI-Planer, Such-Dienst oder in Fehlermeldungen.
 * Werden erst geladen, wenn man sie öffnet, und beim Abmelden aus dem Speicher der Seite entfernt.
 */
import type { TravelDoc } from "./model";
import { cloud } from "./cloud/cloud.svelte";
import { dir } from "./directory.svelte";

export const docs = $state<{ map: Record<string, TravelDoc>; status: "off" | "loading" | "ready" | "error"; saving: boolean }>(
  { map: {}, status: "off", saving: false }
);

let owner = "";
let saved = "";
let timer: ReturnType<typeof setTimeout> | undefined;

/** gespeicherte Felder; alles andere (frühere Ausweis- und Passnummern, Namen laut Ausweis) fällt nach dem nächsten Laden aus dem Konto weg */
const KEYS = new Set<string>(["gender", "idExpiry", "passExpiry", "nats", "lgbtq"]);

/** leere und unbekannte Felder weglassen, Personen ohne Angaben und gelöschte Personen weglassen */
function clean(map: Record<string, TravelDoc>): Record<string, TravelDoc> {
  const out: Record<string, TravelDoc> = {};
  for (const [id, d] of Object.entries(map)) {
    if (!dir.people.some(p => p.id === id)) continue;
    const e = Object.fromEntries(Object.entries(d).filter(([k, v]) => KEYS.has(k) && typeof v === "string" && v.trim())) as TravelDoc;
    if (Object.keys(e).length) out[id] = e;
  }
  return out;
}

export async function loadDocs() {
  const u = cloud.user;
  if (!u || (owner === u.uid && docs.status !== "error")) return;
  owner = u.uid;
  docs.status = "loading";
  try {
    const f = await import("./cloud/firebase");
    const data = await f.loadTravelDocs(u.uid);
    if (owner !== u.uid) return;
    docs.map = data ? JSON.parse(data) : {};
    // Stand im Konto; weicht der bereinigte Stand ab (z. B. Person inzwischen gelöscht), wird beim nächsten Mal gespeichert
    saved = data || "{}";
    docs.status = "ready";
    for (const [id, f] of pending) setFields(id, f);
    pending.clear();
  } catch (e) {
    console.warn(e);
    docs.status = "error";
  }
}

/** Buchungsdaten einer Person zum Bearbeiten (legt einen leeren Eintrag an) */
export function docOf(personId: string): TravelDoc {
  return (docs.map[personId] ||= {});
}

/** vor dem Laden gesetzte Felder (z. B. aus „Konto einrichten“), werden nach dem Laden übernommen */
const pending = new Map<string, Partial<TravelDoc>>();
function setFields(personId: string, f: Partial<TravelDoc>) {
  docOf(personId);
  // über den Zustand weiter: docOf gibt beim Anlegen das rohe Objekt zurück (Svelte 5)
  const cur = docs.map[personId] as Record<string, unknown>;
  for (const [k, v] of Object.entries(f)) { if (v) cur[k] = v; else delete cur[k]; }
}
/** Felder einer Person setzen (leer: entfernen); sind die Buchungsdaten noch nicht geladen, danach */
export function setDocFields(personId: string, f: Partial<TravelDoc>) {
  if (docs.status === "ready") setFields(personId, f);
  else { pending.set(personId, { ...pending.get(personId), ...f }); void loadDocs(); }
}

export const hasDoc = (personId: string) => Object.entries(docs.map[personId] || {}).some(([k, v]) => KEYS.has(k) && typeof v === "string" && v.trim());

export async function removeDoc(personId: string) {
  delete docs.map[personId];
  await flush();
}

/** alle Buchungsdaten aus dem Konto löschen */
export async function deleteAllDocs() {
  const u = cloud.user;
  if (!u) return;
  const f = await import("./cloud/firebase");
  await f.deleteTravelDocs(u.uid);
  docs.map = {};
  saved = "{}";
}

async function flush() {
  clearTimeout(timer);
  const u = cloud.user;
  if (!u || owner !== u.uid || docs.status !== "ready") return;
  const json = JSON.stringify(clean($state.snapshot(docs.map)));
  if (json === saved) return;
  docs.saving = true;
  try {
    const f = await import("./cloud/firebase");
    if (json === "{}") await f.deleteTravelDocs(u.uid);
    else await f.saveTravelDocs(u.uid, json);
    saved = json;
  } catch (e) { console.warn(e); }
  docs.saving = false;
}

$effect.root(() => {
  // Änderungen gesammelt ins Konto schreiben
  $effect(() => {
    if (docs.status !== "ready") return;
    JSON.stringify(docs.map);
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  });
  // abgemeldet oder anderes Konto: nichts im Speicher behalten
  $effect(() => {
    const id = cloud.user?.uid || "";
    if (id === owner) return;
    clearTimeout(timer);
    owner = "";
    saved = "";
    pending.clear();
    docs.map = {};
    docs.status = "off";
  });
});

/** vor dem Schließen des Dialogs sofort speichern */
export const saveDocsNow = flush;
