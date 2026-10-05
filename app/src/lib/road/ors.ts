/*
 * Strecken mit dem Auto über OpenRouteService (Such-Dienst /road/route, #201): je Etappe Kilometer, Fahrzeit und der Verlauf
 * (ausgedünnt, für die Länder auf der Strecke). Ohne Schlüssel oder bei Fehlern schätzt die App selbst (road/trip.ts).
 * Ohne Svelte, läuft auch im Worker.
 */
export const ORS_URL = "https://api.openrouteservice.org/v2/directions/driving-car/geojson";
/** höchstens so viele Punkte je Anfrage (ORS: 50 Wegpunkte) */
export const MAX_POINTS = 25;
/** Verlauf: etwa alle so vielen Kilometer ein Punkt */
export const SAMPLE_KM = 15;

export type LL = [number, number];
export interface RoadLeg { km: number; min: number; path: LL[] }
export interface RoadResult { legs: RoadLeg[]; configured: boolean; source?: "ors"; error?: string }

/** Anfrage prüfen: 2 bis MAX_POINTS Punkte [lat, lon], auf drei Stellen gerundet (etwa 100 m) */
export function parseRouteQuery(body: unknown): LL[] | string {
  const pts = (body as { points?: unknown })?.points;
  if (!Array.isArray(pts) || pts.length < 2 || pts.length > MAX_POINTS) return `2 bis ${MAX_POINTS} Punkte`;
  const out: LL[] = [];
  for (const p of pts) {
    if (!Array.isArray(p) || p.length !== 2) return "Punkt als [lat, lon]";
    const [lat, lon] = p.map(Number);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return "Koordinaten ungültig";
    out.push([Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000]);
  }
  return out;
}

const R = 6371;
export function km(a: LL, b: LL): number {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Verlauf ausdünnen: Anfang, etwa alle SAMPLE_KM ein Punkt, Ende */
export function thin(path: LL[], every = SAMPLE_KM): LL[] {
  if (path.length <= 2) return path;
  const out: LL[] = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += km(path[i - 1], path[i]);
    if (acc >= every) { out.push(path[i]); acc = 0; }
  }
  const last = path.at(-1)!;
  if (out.at(-1) !== last) out.push(last);
  return out;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Antwort von ORS (GeoJSON) in Etappen: segments je Wegpunkt-Paar, way_points als Indizes in den Verlauf */
export function fromOrs(data: any): RoadLeg[] {
  const f = data?.features?.[0];
  const coords: [number, number][] = f?.geometry?.coordinates || [];
  const segs: any[] = f?.properties?.segments || [];
  const wp: number[] = f?.properties?.way_points || [];
  if (!segs.length || wp.length !== segs.length + 1) return [];
  return segs.map((s, i) => ({
    km: Math.round((s.distance || 0) / 100) / 10,
    min: Math.round((s.duration || 0) / 60),
    path: thin(coords.slice(wp[i], wp[i + 1] + 1).map(([lon, lat]) => [Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000] as LL))
  }));
}

export async function routeOrs(points: LL[], key: string, f: typeof fetch = fetch): Promise<RoadLeg[]> {
  const res = await f(ORS_URL, {
    method: "POST",
    headers: { authorization: key, "content-type": "application/json", accept: "application/geo+json, application/json" },
    body: JSON.stringify({ coordinates: points.map(([lat, lon]) => [lon, lat]), instructions: false, radiuses: points.map(() => 5000) })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`ORS ${res.status}${(data as any)?.error?.message ? `: ${(data as any).error.message}` : ""}`);
  const legs = fromOrs(data);
  if (!legs.length) throw new Error("ORS: keine Strecke");
  return legs;
}
