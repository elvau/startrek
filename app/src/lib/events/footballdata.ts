/*
 * football-data.org (kostenloser Schlüssel): Spielpläne der großen europäischen Ligen und der Champions League.
 * Ablauf: Mannschaften der Ligen (lange zwischengespeichert) → passende Mannschaften → ihre nächsten Spiele.
 * Das Stadion ist das der Heimmannschaft; die Uhrzeit wird in die Ortszeit des Landes umgerechnet.
 */
import type { EventHit, EventQuery } from "./types";

export const FD_URL = "https://api.football-data.org/v4";

/** Ligen mit Land (für Ortszeit und Land des Stadions); die Champions League zuletzt, ihre Mannschaften kommen aus den Ligen */
export const FD_COMPS: { code: string; cc?: string }[] = [
  { code: "PL", cc: "GB" }, { code: "BL1", cc: "DE" }, { code: "PD", cc: "ES" }, { code: "SA", cc: "IT" }, { code: "FL1", cc: "FR" }, { code: "CL" }
];
const TZ: Record<string, string> = { GB: "Europe/London", DE: "Europe/Berlin", ES: "Europe/Madrid", IT: "Europe/Rome", FR: "Europe/Paris", NL: "Europe/Amsterdam", PT: "Europe/Lisbon" };

export interface FdTeam { id: number; name: string; shortName?: string; tla?: string; venue?: string; address?: string; cc?: string }

/** Zwischenspeicher, vom Such-Dienst gestellt (Cloudflare); ohne ihn wird jedes Mal gefragt */
export type Cached = <T>(key: string, ttlSec: number, load: () => Promise<T>) => Promise<T>;
const noCache: Cached = (_k, _t, load) => load();

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ");
const words = (q: string) => norm(q).split(/\s+/).filter(w => w.length >= 3 && !["fc", "vs", "gegen", "the", "und", "and"].includes(w));

/** Ortszeit eines UTC-Zeitpunkts, z. B. 2027-05-15T20:00 */
export function localTime(utc: string, cc?: string): string {
  const tz = (cc && TZ[cc]) || "Europe/Paris";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(utc)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Mannschaften, deren Name alle Wörter eines Teils der Suche enthält (z. B. „Arsenal“ in „Arsenal FC“) */
export function matchTeams(teams: FdTeam[], q: string): FdTeam[] {
  const ws = words(q);
  const hay = (t: FdTeam) => norm(`${t.name} ${t.shortName || ""} ${t.tla || ""}`);
  return teams.filter(t => ws.some(w => hay(t).split(/\s+/).some(x => x.startsWith(w))))
    .sort((a, b) => ws.filter(w => hay(b).includes(w)).length - ws.filter(w => hay(a).includes(w)).length);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function get(path: string, key: string, f: typeof fetch): Promise<any> {
  const res = await f(`${FD_URL}${path}`, { headers: { "X-Auth-Token": key } });
  if (res.status === 429) throw new Error("football-data.org: zu viele Anfragen, bitte gleich noch einmal");
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  return res.json();
}

export async function fdTeams(key: string, f: typeof fetch, cached: Cached): Promise<FdTeam[]> {
  return cached("fd:teams", 7 * 86400, async () => {
    const byId = new Map<number, FdTeam>();
    for (const c of FD_COMPS) {
      const data = await get(`/competitions/${c.code}/teams`, key, f).catch(() => null);
      for (const t of data?.teams || []) {
        if (byId.has(t.id)) continue;
        byId.set(t.id, { id: t.id, name: t.name, shortName: t.shortName, tla: t.tla, venue: t.venue || undefined, address: t.address || undefined, cc: c.cc });
      }
    }
    if (!byId.size) throw new Error("football-data.org: keine Mannschaften");
    return [...byId.values()];
  });
}

export function fromMatches(data: any, teams: Map<number, FdTeam>, q: EventQuery): EventHit[] {
  return (data?.matches || []).filter((m: any) => m.utcDate && (!q.from || m.utcDate.slice(0, 10) >= q.from) && (!q.to || m.utcDate.slice(0, 10) <= q.to))
    .map((m: any) => {
      const home = teams.get(m.homeTeam?.id);
      return {
        id: `fd:${m.id}`, source: "footballdata", sourceName: "football-data.org",
        name: `${m.homeTeam?.shortName || m.homeTeam?.name} – ${m.awayTeam?.shortName || m.awayTeam?.name}`,
        start: localTime(m.utcDate, home?.cc),
        ...(home?.venue ? { venue: home.venue } : {}), ...(home?.address ? { address: home.address } : {}), ...(home?.cc ? { cc: home.cc } : {}),
        ...(m.competition?.name ? { category: m.competition.name } : {})
      } as EventHit;
    });
}

export async function searchFootballData(q: EventQuery, key: string, f: typeof fetch = fetch, cached: Cached = noCache): Promise<EventHit[]> {
  const teams = await fdTeams(key, f, cached);
  const hits = matchTeams(teams, q.q).slice(0, 2);
  if (!hits.length) return [];
  const byId = new Map(teams.map(t => [t.id, t]));
  const lists = await Promise.all(hits.map(t => cached(`fd:m:${t.id}`, 6 * 3600, () => get(`/teams/${t.id}/matches?status=SCHEDULED&limit=20`, key, f)).then(d => fromMatches(d, byId, q))));
  let all = lists.flat();
  // zwei Mannschaften gesucht („Arsenal Bayern“): nur ihre gemeinsamen Spiele, falls es welche gibt
  if (hits.length === 2) {
    const both = all.filter(e => lists[0].some(x => x.id === e.id) && lists[1].some(x => x.id === e.id));
    if (both.length) all = both;
  }
  const seen = new Set<string>();
  return all.filter(e => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort((a, b) => a.start.localeCompare(b.start));
}
