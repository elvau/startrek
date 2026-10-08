/* Lädt der Browser die Seite neu (iPhone-Safari verwirft Tabs bei knappem Speicher), geht es in derselben Reise an
   derselben Stelle weiter statt auf der Startseite. sessionStorage: gilt nur für diesen Tab, ein neuer Besuch beginnt auf der Startseite. */
const KEY = "rk-view";

export interface ResumeView { id: string; y: number }

/** Offene Reise und Scrollstand merken; null = Startseite */
export function saveView(v: ResumeView | null, store: Pick<Storage, "setItem" | "removeItem"> | undefined = tryStore()): void {
  try {
    if (!store) return;
    if (v) store.setItem(KEY, JSON.stringify({ id: v.id, y: Math.max(0, Math.round(v.y)) }));
    else store.removeItem(KEY);
  } catch {}
}

export function readView(store: Pick<Storage, "getItem"> | undefined = tryStore()): ResumeView | null {
  try {
    const v = JSON.parse(store?.getItem(KEY) || "null");
    return v && typeof v.id === "string" && typeof v.y === "number" && isFinite(v.y) ? { id: v.id, y: Math.max(0, v.y) } : null;
  } catch { return null; }
}

function tryStore(): Storage | undefined {
  try { return typeof sessionStorage === "undefined" ? undefined : sessionStorage; } catch { return undefined; }
}
