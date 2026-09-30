/*
 * Nutzung der kostenlosen Kontingente für die Admin-Ansicht (/admin/usage).
 * Der Such-Dienst zählt anonym in Workers Analytics Engine mit: je Aufruf Route und Zwischenspeicher-Treffer,
 * je ausgehender Anfrage Anbieter (Host) und bei Gemini das Modell. Keine Nutzerkennung, keine Suchinhalte.
 * Die Zahlen von Cloudflare selbst (Worker-Aufrufe fürs ganze Konto, R2) kommen aus der GraphQL-API.
 * Zum Lesen braucht der Dienst CF_ACCOUNT_ID (Variable) und CF_API_TOKEN (Secret, nur „Account Analytics: Read“).
 */

export interface UsageEnv {
  /** Analytics-Engine-Datensatz „splitandfly_usage“; fehlt er, wird nichts gezählt */
  USAGE?: AnalyticsEngineDataset;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
  /** Nutzer-IDs aus Firebase (Authentication → Benutzer-UID), kommagetrennt */
  ADMIN_UIDS?: string;
}

export const DATASET = "splitandfly_usage";
const CF_API = "https://api.cloudflare.com/client/v4";

/** Host und bei Gemini das Modell aus der Adresse (…/models/gemini-3.8-flash:generateContent) */
export function describe(input: RequestInfo | URL): { host: string; detail: string } {
  let u: URL;
  try { u = new URL(input instanceof Request ? input.url : String(input)); } catch { return { host: "?", detail: "" }; }
  const model = u.pathname.match(/\/models\/([^/:]+):/)?.[1];
  return { host: u.host, detail: model ? decodeURIComponent(model) : "" };
}

/** fetch, das jede ausgehende Anfrage zählt */
export function meter(env: UsageEnv, f: typeof fetch = fetch): typeof fetch {
  if (!env.USAGE) return f;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const { host, detail } = describe(input);
    try { env.USAGE!.writeDataPoint({ blobs: ["api", host, detail], doubles: [1], indexes: ["api"] }); } catch { /* Zählen darf nie stören */ }
    return f(input, init);
  }) as typeof fetch;
}

/** eingehender Aufruf einer Route, mit Zwischenspeicher-Treffer */
export function noteRoute(env: UsageEnv, route: string, cacheHit = false) {
  try { env.USAGE?.writeDataPoint({ blobs: ["route", route, cacheHit ? "hit" : ""], doubles: [1], indexes: ["route"] }); } catch { /* egal */ }
}

export const isAdmin = (env: UsageEnv, uid: string) =>
  (env.ADMIN_UIDS || "").split(",").map(s => s.trim()).filter(Boolean).includes(uid);

/** die letzten n Tage (UTC), ältester zuerst */
export function lastDays(n: number, now = Date.now()): string[] {
  return Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * 86400_000).toISOString().slice(0, 10));
}

export interface Series { kind: string; name: string; detail: string; byDay: number[] }
export interface UsageReport {
  at: string;
  days: string[];
  /** alle Worker des Kontos (Grenze gilt fürs Konto) */
  worker?: { requests: number[]; errors: number[]; subrequests: number[] };
  /** R2 im laufenden Monat */
  r2?: { bytes: number; objects: number; classA: number; classB: number };
  /** eigene Zählung: Routen und Anbieter */
  series?: Series[];
  errors: Record<string, string>;
  config: Record<string, string | number | boolean>;
}

type Cfg = Record<string, string | number | boolean>;

/** Lesevorgänge in R2 (Klasse B), alles andere zählt als Klasse A */
const CLASS_B = new Set(["GetObject", "HeadObject", "HeadBucket", "UsageSummary", "GetBucketEncryption", "GetBucketLocation", "GetBucketCors", "GetBucketLifecycleConfiguration"]);

async function graphql<T>(env: UsageEnv, f: typeof fetch, query: string, variables: object): Promise<T> {
  const res = await f(`${CF_API}/graphql`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.CF_API_TOKEN}` }, body: JSON.stringify({ query, variables })
  });
  const data = await res.json().catch(() => ({})) as { data?: T; errors?: { message: string }[] | null };
  if (data.errors?.length) throw new Error(data.errors.map(e => e.message).join("; "));
  if (!res.ok || !data.data) throw new Error(`Cloudflare antwortet ${res.status}`);
  return data.data;
}

type Accounts<T> = { viewer: { accounts: T[] } };

async function workerStats(env: UsageEnv, f: typeof fetch, days: string[]) {
  const q = `query($a: String!, $from: Date!, $to: Date!) { viewer { accounts(filter: { accountTag: $a }) {
    workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $from, date_leq: $to }) { sum { requests errors subrequests } dimensions { date } }
  } } }`;
  const d = await graphql<Accounts<{ workersInvocationsAdaptive: { sum: { requests: number; errors: number; subrequests: number }; dimensions: { date: string } }[] }>>(
    env, f, q, { a: env.CF_ACCOUNT_ID, from: days[0], to: days[days.length - 1] });
  const out = { requests: days.map(() => 0), errors: days.map(() => 0), subrequests: days.map(() => 0) };
  for (const row of d.viewer.accounts[0]?.workersInvocationsAdaptive || []) {
    const i = days.indexOf(row.dimensions.date);
    if (i < 0) continue;
    out.requests[i] += row.sum.requests || 0;
    out.errors[i] += row.sum.errors || 0;
    out.subrequests[i] += row.sum.subrequests || 0;
  }
  return out;
}

async function r2Stats(env: UsageEnv, f: typeof fetch, now: number) {
  const d0 = new Date(now);
  const month = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1)).toISOString();
  const q = `query($a: String!, $from: Time!, $to: Time!) { viewer { accounts(filter: { accountTag: $a }) {
    r2StorageAdaptiveGroups(limit: 1, filter: { datetime_geq: $from, datetime_leq: $to }, orderBy: [datetime_DESC]) { max { payloadSize metadataSize objectCount } }
    r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $from, datetime_leq: $to }) { sum { requests } dimensions { actionType } }
  } } }`;
  const d = await graphql<Accounts<{
    r2StorageAdaptiveGroups: { max: { payloadSize: number; metadataSize: number; objectCount: number } }[];
    r2OperationsAdaptiveGroups: { sum: { requests: number }; dimensions: { actionType: string } }[];
  }>>(env, f, q, { a: env.CF_ACCOUNT_ID, from: month, to: new Date(now).toISOString() });
  const acc = d.viewer.accounts[0];
  const st = acc?.r2StorageAdaptiveGroups[0]?.max;
  let classA = 0, classB = 0;
  for (const row of acc?.r2OperationsAdaptiveGroups || []) {
    if (CLASS_B.has(row.dimensions.actionType)) classB += row.sum.requests || 0; else classA += row.sum.requests || 0;
  }
  return { bytes: (st?.payloadSize || 0) + (st?.metadataSize || 0), objects: st?.objectCount || 0, classA, classB };
}

async function ownStats(env: UsageEnv, f: typeof fetch, days: string[]): Promise<Series[]> {
  // Stichproben: _sample_interval rechnet auf die echte Anzahl hoch
  const sql = `SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS day, blob1 AS kind, blob2 AS name, blob3 AS detail, SUM(_sample_interval * double1) AS n
    FROM ${DATASET} WHERE timestamp > NOW() - INTERVAL '${days.length}' DAY GROUP BY day, kind, name, detail FORMAT JSON`;
  const res = await f(`${CF_API}/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
    method: "POST", headers: { authorization: `Bearer ${env.CF_API_TOKEN}` }, body: sql
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Analytics Engine antwortet ${res.status}: ${text.slice(0, 200)}`);
  const rows = (JSON.parse(text) as { data?: { day: string; kind: string; name: string; detail: string; n: number | string }[] }).data || [];
  const map = new Map<string, Series>();
  for (const r of rows) {
    const i = days.indexOf(String(r.day).slice(0, 10));
    if (i < 0) continue;
    const k = `${r.kind}|${r.name}|${r.detail}`;
    if (!map.has(k)) map.set(k, { kind: r.kind, name: r.name, detail: r.detail, byDay: days.map(() => 0) });
    map.get(k)!.byDay[i] += Math.round(Number(r.n) || 0);
  }
  return [...map.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.detail.localeCompare(b.detail));
}

/** Bericht für die Admin-Ansicht; fällt eine Quelle aus, steht der Grund in errors */
export async function usageReport(env: UsageEnv, config: Cfg, f: typeof fetch = fetch, now = Date.now()): Promise<UsageReport> {
  const days = lastDays(7, now);
  const report: UsageReport = { at: new Date(now).toISOString(), days, errors: {}, config };
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) {
    report.errors.setup = "CF_ACCOUNT_ID oder CF_API_TOKEN fehlt";
    return report;
  }
  const run = async <T>(key: string, load: () => Promise<T>) => {
    try { return await load(); } catch (e) { report.errors[key] = (e as Error).message; return undefined; }
  };
  const [worker, r2, series] = await Promise.all([
    run("worker", () => workerStats(env, f, days)),
    run("r2", () => r2Stats(env, f, now)),
    env.USAGE ? run("own", () => ownStats(env, f, days)) : Promise.resolve(undefined)
  ]);
  if (!env.USAGE) report.errors.own = "Analytics Engine (USAGE) ist nicht verbunden";
  Object.assign(report, { worker, r2, series });
  return report;
}
