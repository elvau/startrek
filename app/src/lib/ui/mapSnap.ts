/*
 * Kartenbild unter dem Mini-Bild der Route: eine unsichtbare Karte (OpenFreeMap) rendert den Ausschnitt einmal, das Bild
 * bleibt im Speicher und (klein, als JPEG) im Browser. Mehrere Bilder nacheinander mit derselben Karte.
 */
import type { Map as MlMap } from "maplibre-gl";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const KEY = "rk2-mapsnap:";
const KEEP = 16;
export interface View { center: [number, number]; zoom: number }

const mem = new Map<string, string>();
let map: Promise<MlMap | null> | undefined;
let queue: Promise<unknown> = Promise.resolve();

const keyOf = (v: View, w: number, h: number) => `${w}x${h}@${v.center.map(n => n.toFixed(4)).join(",")}z${v.zoom.toFixed(3)}`;

function stored(k: string): string | undefined {
  try { return localStorage.getItem(KEY + k) || undefined; } catch { return undefined; }
}
function store(k: string, url: string) {
  try {
    const keys = Object.keys(localStorage).filter(x => x.startsWith(KEY));
    for (const old of keys.slice(0, Math.max(0, keys.length - KEEP + 1))) localStorage.removeItem(old);
    if (url.length < 250_000) localStorage.setItem(KEY + k, url);
  } catch { /* voll oder gesperrt: nur im Speicher */ }
}

function getMap(): Promise<MlMap | null> {
  return (map ??= (async () => {
    try {
      const m = await import("maplibre-gl");
      const box = document.createElement("div");
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = "position:fixed;left:-10000px;top:0;width:300px;height:150px;pointer-events:none;";
      document.body.append(box);
      const mp = new m.Map({ container: box, style: STYLE, center: [10, 45], zoom: 3, interactive: false, attributionControl: false,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1), fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true } });
      await new Promise<void>((ok, fail) => { mp.once("load", () => ok()); mp.once("error", e => fail(e)); setTimeout(() => fail(new Error("timeout")), 20000); });
      return mp;
    } catch { map = undefined; return null; }
  })());
}

/** Kartenbild für den Ausschnitt (data:-URL), null wenn die Karte nicht lädt */
export function cachedSnap(v: View, w: number, h: number): string | undefined {
  const k = keyOf(v, w, h);
  const hit = mem.get(k) ?? stored(k);
  if (hit) mem.set(k, hit);
  return hit;
}

export function mapSnap(v: View, w: number, h: number): Promise<string | null> {
  const hit = cachedSnap(v, w, h);
  if (hit) return Promise.resolve(hit);
  const k = keyOf(v, w, h);
  const job = queue.then(async () => {
    if (mem.has(k)) return mem.get(k)!;
    const mp = await getMap();
    if (!mp) return null;
    const box = mp.getContainer();
    box.style.width = `${w}px`; box.style.height = `${h}px`;
    mp.resize();
    let bad = false;
    const onErr = () => { bad = true; };
    mp.on("error", onErr);
    mp.jumpTo({ center: v.center, zoom: v.zoom });
    await new Promise<void>(ok => { mp.once("idle", () => ok()); setTimeout(ok, 15000); });
    mp.off("error", onErr);
    const url = mp.getCanvas().toDataURL("image/jpeg", 0.82);
    mem.set(k, url);
    if (!bad) store(k, url);
    return url;
  });
  queue = job.catch(() => null);
  return job.catch(() => null);
}
