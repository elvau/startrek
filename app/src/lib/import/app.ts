/* Reise per KI importieren (#457) in der App: Anfrage aus Dateien, Text und Link bauen, an den Such-Dienst schicken */
import { i18n, t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { idToken } from "../cloud/cloud.svelte";
import { noteError } from "../bugs/log";
import { agentError } from "../agent/app";
import { IMPORT_TEXT_MAX, type ImportedOffer, type ImportFile } from "./ai";
import type { Prepared } from "./files";

export interface ImportInput { prepared: Prepared[]; text?: string; url?: string }

/** Anfrage an den Such-Dienst: Dateien für die KI, gelesene Texte (Word, Excel, CSV) mit Dateinamen zum eigenen Text */
export function importBody(i: ImportInput, lang = i18n.lang) {
  const files: ImportFile[] = i.prepared.flatMap(p => (p.kind === "file" ? [p.file] : []));
  const texts = [i.text?.trim() || "", ...i.prepared.flatMap(p => (p.kind === "text" && p.text.trim() ? [`${p.name}:\n${p.text.trim()}`] : []))].filter(Boolean);
  return { files, lang, ...(texts.length ? { text: texts.join("\n\n").slice(0, IMPORT_TEXT_MAX) } : {}), ...(i.url?.trim() ? { url: i.url.trim() } : {}) };
}

/** Fehler mit Hinweis, ob ein Screenshot weiterhilft */
export class ImportError extends Error { constructor(msg: string, readonly needScreenshot = false, readonly overloaded = false) { super(msg); } }

/** until: aus dem Angebotsspeicher (#462), gültig bis */
export async function askImport(i: ImportInput, signal?: AbortSignal): Promise<{ offer: ImportedOffer; until?: string }> {
  if (!FLIGHTS_URL) throw new ImportError(t("search.notReady"));
  const token = await idToken();
  if (!token) throw new ImportError(t("imp.login"));
  const res = await fetch(`${FLIGHTS_URL}/import`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(importBody(i)), signal
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.offer) return { offer: data.offer as ImportedOffer, ...(data.cached && data.until ? { until: String(data.until) } : {}) };
  noteError(`Import ${res.status}: ${data.error || "ohne Meldung"}`);
  if (res.status === 422) throw new ImportError(t(data.needScreenshot && !data.unreadable ? "imp.needShot" : "imp.unreadable"), !!data.needScreenshot);
  // Eingabe passt nicht (Format, Größe): Meldung des Dienstes auf Deutsch, sonst allgemein
  if (res.status === 400 || res.status === 413) throw new ImportError(i18n.lang === "de" && data.error ? data.error : t("imp.unreadable"));
  const overloaded = res.status === 503 && data.overloaded === true;
  throw new ImportError(agentError(res.status, data.error, data.overloaded === true), false, overloaded);
}
