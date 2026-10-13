/*
 * MapLibre laden (alle Karten): Seit Version 6 sucht die Bibliothek ihren Worker neben der gebündelten Datei
 * (assets/maplibre-gl-worker.mjs); den legt Vite dort nicht ab → „Worker failed to load“, nur der Hintergrund des
 * Stils ohne Kacheln (#304). Darum die Worker-Datei als eigene Datei einbinden und ihre Adresse setzen.
 */
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";

export async function loadMapLibre(): Promise<typeof import("maplibre-gl")> {
  const m = await import("maplibre-gl");
  m.setWorkerUrl(new URL(workerUrl, location.href).href);
  return m;
}
