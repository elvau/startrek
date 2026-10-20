/*
 * Teilen-Menü am Handy (#457): Der Service Worker legt geteilte Dateien und Texte kurz im Speicher „saf-share“ ab und
 * öffnet die App mit ?share=1. Hier werden sie abgeholt (und gleich gelöscht), der Import öffnet sich damit.
 */
export interface Shared { files: File[]; text: string; url: string }

export const shareIn = $state<{ v: Shared | null }>({ v: null });

/** beim Start: geteilte Inhalte abholen, Suchteil aus der Adresse nehmen */
export async function takeShared(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  if (q.get("share") !== "1") return false;
  q.delete("share");
  history.replaceState(null, "", location.pathname + (q.size ? `?${q}` : "") + location.hash);
  if (typeof caches === "undefined") return false;
  try {
    const c = await caches.open("saf-share");
    const base = import.meta.env.BASE_URL as string;
    const meta = await (await c.match(`${base}share/meta`))?.json().catch(() => null) as { n?: number; text?: string; url?: string } | null;
    const files: File[] = [];
    for (let i = 0; i < Math.min(6, meta?.n || 0); i++) {
      const r = await c.match(`${base}share/${i}`);
      if (r) files.push(new File([await r.blob()], decodeURIComponent(r.headers.get("x-name") || "Datei"), { type: r.headers.get("content-type") || "" }));
    }
    await caches.delete("saf-share");
    // Links kommen je nach App im Feld url oder im Text
    const text = meta?.text || "", url = meta?.url || text.match(/https?:\/\/\S+/)?.[0] || "";
    if (!files.length && !text && !url) return false;
    shareIn.v = { files, text: url && text.trim() === url ? "" : text, url };
    return true;
  } catch { return false; }
}
