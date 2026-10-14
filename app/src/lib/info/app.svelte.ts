/*
 * „Neues & Ausblick“ in der App: Fenster-Zustand, Link …/?info und Laden der Daten.
 * Erst über den Such-Dienst (/ausblick, keine Besucher-IP an GitHub); auf der Testumgebung (liegt ohnehin bei GitHub)
 * notfalls direkt vom Branch „ausblick“. Ohne Daten bleiben die mitgelieferten Fragen.
 */
import { FLIGHTS_URL } from "../flights/app";
import { AUSBLICK_RAW, parseAusblick, type Ausblick } from "./ausblick";

export type InfoTab = "neu" | "bald" | "fehler" | "faq";
export const infoDialog = $state<{ open: boolean; tab: InfoTab }>({ open: false, tab: "neu" });

export function openInfo(tab: InfoTab = "neu") { infoDialog.tab = tab; infoDialog.open = true; }

/** …/?info (oder ?info=bald) öffnet das Fenster; der Parameter verschwindet aus der Adresse */
export function applyInfoLink() {
  const u = new URL(location.href);
  if (!u.searchParams.has("info")) return;
  const tab = u.searchParams.get("info") as InfoTab;
  u.searchParams.delete("info");
  history.replaceState(null, "", u);
  openInfo(["neu", "bald", "fehler", "faq"].includes(tab) ? tab : "neu");
}

async function get(url: string): Promise<Ausblick | null> {
  const r = await fetch(url);
  return r.ok ? parseAusblick(await r.json()) : null;
}

let cache: Promise<Ausblick | null> | undefined;
/** einmal je Sitzung; null, wenn nichts erreichbar ist */
export function loadAusblick(): Promise<Ausblick | null> {
  return (cache ??= (async () => {
    const viaWorker = FLIGHTS_URL ? await get(`${FLIGHTS_URL}/ausblick`).catch(() => null) : null;
    if (viaWorker) return viaWorker;
    if (location.hostname.endsWith("github.io")) return get(AUSBLICK_RAW).catch(() => null);
    return null;
  })().then(d => { if (!d) cache = undefined; return d; }));
}
