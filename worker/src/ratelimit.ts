/*
 * Mengenbegrenzung pro IP für die Suchen (Flüge, Unterkünfte, Events, Touren): schützt die kostenlosen Kontingente
 * vor Skripten. Zähler im Zwischenspeicher des Rechenzentrums (eine IP landet praktisch immer im selben), feste
 * Zeitfenster; ein paar Anfragen zu viel bei gleichzeitigen Aufrufen sind egal.
 */

/** Ausschnitt aus der Cache-API, in Tests ersetzbar */
export interface Store {
  match(k: Request): Promise<Response | undefined>;
  put(k: Request, r: Response): Promise<void>;
}

export interface Window { limit: number; sec: number }

export interface LimitEnv {
  /** Suchen pro IP und Minute (Standard 60) */
  SEARCH_PER_MIN?: string;
  /** Suchen pro IP und Stunde (Standard 600) */
  SEARCH_PER_HOUR?: string;
}

export const searchWindows = (env: LimitEnv): Window[] => [
  { limit: Number(env.SEARCH_PER_MIN) || 60, sec: 60 },
  { limit: Number(env.SEARCH_PER_HOUR) || 600, sec: 3600 }
];

/** Schlüssel einer IP: IPv6 nach dem /64-Netz (sonst bekäme jede Adresse im eigenen Netz ein neues Limit) */
export function ipKey(ip: string | null): string | null {
  if (!ip) return null;
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return full.slice(0, 4).map(x => x.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** weitere Grenzen pro IP (KI-Planer, Fehlermeldungen, Schlüssel, Klicks): eigener Zähler je Art */
export const IP_LIMITS: Record<string, Window[]> = {
  agent: [{ limit: 15, sec: 3600 }, { limit: 40, sec: 86400 }],
  bug: [{ limit: 10, sec: 3600 }],
  mcpkey: [{ limit: 10, sec: 3600 }],
  click: [{ limit: 120, sec: 60 }]
};

/** zählt die Anfrage mit; ok: false und Wartezeit in Sekunden, wenn ein Fenster voll ist (dann wird nicht gezählt) */
export async function checkLimit(store: Store, ip: string | null, windows: Window[], now = Date.now()): Promise<{ ok: boolean; retryAfter: number }> {
  if (!ip) return { ok: true, retryAfter: 0 };
  const slots = windows.map(w => {
    const n = Math.floor(now / 1000 / w.sec);
    return { w, key: new Request(`https://ratelimit.splitandfly/${w.sec}/${encodeURIComponent(ip)}/${n}`), end: (n + 1) * w.sec };
  });
  const counts = await Promise.all(slots.map(async s => Number(await (await store.match(s.key))?.text()) || 0));
  const full = slots.find((s, i) => counts[i] >= s.w.limit);
  if (full) return { ok: false, retryAfter: Math.max(1, Math.ceil(full.end - now / 1000)) };
  await Promise.all(slots.map((s, i) => store.put(s.key, new Response(String(counts[i] + 1), { headers: { "cache-control": `max-age=${s.w.sec}` } }))));
  return { ok: true, retryAfter: 0 };
}
