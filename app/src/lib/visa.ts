/*
 * Einreise je Staatsangehörigkeit (public/visa.json aus Passport Index Data, MIT): visumfrei (Tage), elektronische
 * Reisegenehmigung, e-Visum, Visum bei Ankunft, Visum vorab, keine Einreise. Nur ein Überblick: maßgeblich bleiben
 * die offiziellen Stellen (Auswärtiges Amt, Botschaft des Ziellands).
 */
export interface VisaData { asOf?: string; cc: string[]; m: Record<string, string> }
export type EntryKind = "home" | "free" | "eta" | "evisa" | "arrival" | "visa" | "none" | "unknown";
export interface Entry { kind: EntryKind; days?: number }

const KIND: Record<string, EntryKind> = { "": "home", f: "free", t: "eta", e: "evisa", a: "arrival", r: "visa", x: "none" };

/** Einreise für einen Pass (ISO-2) in ein Land (ISO-2) */
export function entryFor(d: VisaData | null, passport: string, dest: string): Entry {
  if (passport === dest) return { kind: "home" };
  const row = d?.m[passport]?.split(","), i = d?.cc.indexOf(dest) ?? -1;
  if (!row || i < 0) return { kind: "unknown" };
  const v = row[i];
  if (/^\d+$/.test(v)) return { kind: "free", days: +v };
  return { kind: KIND[v] ?? "unknown" };
}

/** schwierig = vorab etwas zu tun (Reisegenehmigung, Visum) oder keine Einreise */
export const needsAction = (e: Entry) => e.kind === "eta" || e.kind === "evisa" || e.kind === "visa" || e.kind === "none";

const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
let cache: Promise<VisaData | null> | undefined;
export function loadVisa(fetchFn: typeof fetch = fetch): Promise<VisaData | null> {
  return (cache ??= fetchFn(base() + "visa.json").then(r => (r.ok ? r.json() : null)).catch(() => null));
}

/** Pässe einer Person: Staatsangehörigkeit (leer = deutsch) und ggf. zweiter Pass */
export const natsOf = (p: { nat?: string; nat2?: string }) => [...new Set([p.nat || "DE", ...(p.nat2 ? [p.nat2] : [])])];

/** je Art, wie günstig: Heimat, visumfrei (mehr Tage besser), bei Ankunft, Reisegenehmigung, e-Visum, Visum, keine */
const RANK: Record<EntryKind, number> = { home: 0, free: 1, arrival: 2, eta: 3, evisa: 4, visa: 5, none: 6, unknown: 7 };

/** Einreise mit dem günstigsten Pass; multi = Person hat mehrere Pässe (Hinweis, welcher gilt) */
export function bestEntry(d: VisaData | null, nats: string[], dest: string): Entry & { nat: string; multi?: boolean } {
  let best: Entry & { nat: string } = { kind: "unknown", nat: nats[0] };
  for (const nat of nats) {
    const e = d ? entryFor(d, nat, dest) : nat === dest ? { kind: "home" as const } : { kind: "unknown" as const };
    if (RANK[e.kind] < RANK[best.kind] || (e.kind === "free" && best.kind === "free" && (e.days || 0) > (best.days || 0))) best = { ...e, nat };
  }
  return nats.length > 1 ? { ...best, multi: true } : best;
}
