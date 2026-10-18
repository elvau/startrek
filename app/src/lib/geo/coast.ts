/*
 * Entfernung zum Meer (#441) aus der Küstenlinie von Natural Earth (public/coast/, erzeugt mit scripts/coast.mjs).
 * Punkte auf 0,01° gerundet, je 1°-Zelle; geladen wird je 10°-Block nur, was gebraucht wird. Genauigkeit etwa 1 km.
 */
import { kmBetween } from "./places";

export type CoastCells = Record<string, number[]>;
const base = () => (import.meta.env?.BASE_URL as string | undefined) || "/";
const blocks: Record<string, Promise<CoastCells>> = {};

const cellOf = (lat: number, lon: number) => [Math.floor(lat), Math.floor(lon)];
const blockOf = (la: number, lo: number) => `${Math.floor(la / 10) * 10}_${Math.floor(lo / 10) * 10}`;

/** die 3 × 3 Zellen um einen Punkt (Ränder: Nachbarblöcke werden mitgeladen) */
function around(p: { lat: number; lon: number }): [number, number][] {
  const [la, lo] = cellOf(p.lat, p.lon), out: [number, number][] = [];
  for (let a = -1; a <= 1; a++) for (let o = -1; o <= 1; o++) out.push([la + a, ((lo + o + 180 + 360) % 360) - 180]);
  return out;
}

/** Küstenpunkte rund um die Punkte laden (je Block einmal pro Sitzung); fehlt ein Block, gibt es dort keine Küste */
export async function loadCoast(ps: { lat: number; lon: number }[], fetchFn: typeof fetch = fetch): Promise<CoastCells> {
  const need = new Set(ps.flatMap(p => around(p).map(([a, o]) => blockOf(a, o))));
  const out: CoastCells = {};
  await Promise.all([...need].map(b => {
    blocks[b] ??= fetchFn(`${base()}coast/${b}.json`).then(r => (r.ok ? r.json() : null)).then(j => (j?.cells || {}) as CoastCells).catch(() => ({}));
    return blocks[b].then(c => Object.assign(out, c));
  }));
  return out;
}

/** Entfernung zur nächsten Küste in km; null, wenn in den Zellen rundum keine liegt (dann mehr als etwa 50 km) */
export function coastKm(p: { lat: number; lon: number }, cells: CoastCells): number | null {
  let best: number | null = null;
  for (const [a, o] of around(p)) {
    const c = cells[`${a}_${o}`];
    if (!c) continue;
    for (let i = 0; i < c.length; i += 2) {
      const km = kmBetween(p, { lat: c[i] / 100, lon: c[i + 1] / 100 });
      if (best == null || km < best) best = km;
    }
  }
  return best;
}
