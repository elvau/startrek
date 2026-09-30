/*
 * Admin-Ansicht: Nutzung der kostenlosen Kontingente. Die Zahlen kommen vom Such-Dienst (/admin/usage),
 * die Grenzen stehen hier (Stand September 2026, bei den Anbietern nachprüfen, wenn es knapp wird).
 */

export interface Series { kind: string; name: string; detail: string; byDay: number[] }
export interface UsageReport {
  at: string;
  days: string[];
  worker?: { requests: number[]; errors: number[]; subrequests: number[] };
  r2?: { bytes: number; objects: number; classA: number; classB: number };
  series?: Series[];
  errors: Record<string, string>;
  config: Record<string, string | number | boolean>;
}

export type Per = "day" | "month" | "min";
export type Level = "ok" | "warn" | "high";

export interface Row {
  id: string;
  /** Übersetzungsschlüssel oder fester Name (Anbieter) */
  label: string;
  /** Wert für den Vergleich mit der Grenze: heute, bei Monatsgrenzen der Monat */
  value: number;
  /** Verlauf der letzten 7 Tage (nur Tageswerte) */
  week?: number[];
  limit?: number;
  per?: Per;
  bytes?: boolean;
  /** zweite Zeile, z. B. Treffer im Zwischenspeicher */
  note?: { key: string; n: number };
  share: number | null;
  level: Level;
}

export const GB = 1024 ** 3;

/** kostenlose Grenzen von Cloudflare */
export const CF_LIMITS = { workersPerDay: 100_000, r2Bytes: 10 * GB, r2ClassA: 1_000_000, r2ClassB: 10_000_000 };

/** Anbieter nach Host; Grenzen nur, wo der kostenlose Tarif eine feste Zahl nennt */
const PROVIDERS: Record<string, { name: string; limit?: number; per?: Per }> = {
  "generativelanguage.googleapis.com": { name: "Gemini" },
  "app.ticketmaster.com": { name: "Ticketmaster", limit: 5000, per: "day" },
  "api.football-data.org": { name: "football-data.org", limit: 10, per: "min" },
  "api.github.com": { name: "GitHub (Fehlerberichte)" },
  "mcp.kiwi.com": { name: "Kiwi.com" },
  "api.travelpayouts.com": { name: "Travelpayouts" },
  "mcp.trivago.com": { name: "trivago" },
  "api.viator.com": { name: "Viator" }
};

export const ROUTES = ["flights", "stays", "events", "activities", "agent", "bug"] as const;

export function level(share: number | null): Level {
  if (share == null) return "ok";
  return share >= 0.9 ? "high" : share >= 0.7 ? "warn" : "ok";
}

const today = (a: number[]) => a[a.length - 1] || 0;

function row(r: Omit<Row, "share" | "level">): Row {
  // Grenzen pro Minute lassen sich aus Tageszahlen nicht ablesen
  const share = r.limit && r.per !== "min" ? r.value / r.limit : null;
  return { ...r, share, level: level(share) };
}

export function cloudflareRows(rep: UsageReport): Row[] {
  const rows: Row[] = [];
  if (rep.worker) {
    const errors = today(rep.worker.errors);
    rows.push(row({ id: "workers", label: "adm.workers", value: today(rep.worker.requests), week: rep.worker.requests, limit: CF_LIMITS.workersPerDay, per: "day", ...(errors ? { note: { key: "adm.errors", n: errors } } : {}) }));
  }
  if (rep.r2) {
    rows.push(row({ id: "r2size", label: "adm.r2size", value: rep.r2.bytes, limit: CF_LIMITS.r2Bytes, bytes: true }));
    rows.push(row({ id: "r2a", label: "adm.r2a", value: rep.r2.classA, limit: CF_LIMITS.r2ClassA, per: "month" }));
    rows.push(row({ id: "r2b", label: "adm.r2b", value: rep.r2.classB, limit: CF_LIMITS.r2ClassB, per: "month" }));
  }
  return rows;
}

/** Anbieter: je Host eine Zeile, Gemini je Modell */
export function providerRows(rep: UsageReport, geminiPerDay = 0): Row[] {
  return (rep.series || []).filter(s => s.kind === "api").map(s => {
    const p = PROVIDERS[s.name];
    const gemini = s.name === "generativelanguage.googleapis.com";
    const name = (p?.name || s.name) + (s.detail ? ` · ${s.detail}` : "");
    const limit = gemini && geminiPerDay ? geminiPerDay : p?.limit;
    return row({ id: `api:${s.name}:${s.detail}`, label: name, value: today(s.byDay), week: s.byDay, limit, per: limit ? (gemini ? "day" : p?.per) : undefined });
  });
}

/** Funktionen der App: Aufrufe, bei Flug- und Unterkunftssuche mit Treffern im Zwischenspeicher */
export function routeRows(rep: UsageReport): Row[] {
  const list = (rep.series || []).filter(s => s.kind === "route");
  return ROUTES.map(r => {
    const all = list.filter(s => s.name === r);
    if (!all.length) return null;
    const week = rep.days.map((_, i) => all.reduce((sum, s) => sum + s.byDay[i], 0));
    const hits = today(all.find(s => s.detail === "hit")?.byDay || []);
    return row({ id: `route:${r}`, label: `adm.r.${r}`, value: today(week), week, ...(hits ? { note: { key: "adm.cached", n: hits } } : {}) });
  }).filter((x): x is Row => !!x);
}

/** Links für das, was der Such-Dienst nicht sieht (Firebase, Gemini-Grenzen) */
export function consoleLinks(projectId?: string) {
  const fb = projectId ? `https://console.firebase.google.com/project/${projectId}` : "https://console.firebase.google.com";
  return [
    { label: "adm.m.firestore", href: `${fb}/usage/details` },
    { label: "adm.m.hosting", href: `${fb}/hosting` },
    { label: "adm.m.gemini", href: "https://aistudio.google.com/usage" },
    { label: "adm.m.cf", href: "https://dash.cloudflare.com/?to=/:account/workers-and-pages" }
  ];
}

export function fmtBytes(n: number, locale: string): string {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString(locale, { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
}
