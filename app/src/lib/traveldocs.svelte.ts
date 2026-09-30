/*
 * Buchungsdaten der gespeicherten Personen (Ausweis, Reisepass). Liegen nur im Konto (travelDocs/{uid}):
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

/** leere Felder weglassen, Personen ohne Angaben und gelöschte Personen weglassen */
function clean(map: Record<string, TravelDoc>): Record<string, TravelDoc> {
  const out: Record<string, TravelDoc> = {};
  for (const [id, d] of Object.entries(map)) {
    if (!dir.people.some(p => p.id === id)) continue;
    const e = Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === "string" && v.trim())) as TravelDoc;
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
  } catch (e) {
    console.warn(e);
    docs.status = "error";
  }
}

/** Buchungsdaten einer Person zum Bearbeiten (legt einen leeren Eintrag an) */
export function docOf(personId: string): TravelDoc {
  return (docs.map[personId] ||= {});
}

export const hasDoc = (personId: string) => Object.values(docs.map[personId] || {}).some(v => typeof v === "string" && v.trim());

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
    docs.map = {};
    docs.status = "off";
  });
});

/** vor dem Schließen des Dialogs sofort speichern */
export const saveDocsNow = flush;
