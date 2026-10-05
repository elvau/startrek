/*
 * Ungefährer Ort aus der Verbindung: Cloudflare hängt Land, Ort und Koordinaten an jede Anfrage (request.cf).
 * Die App schlägt damit ohne Wohnort Flughäfen in der Nähe vor. Kein fremder Dienst, nichts wird gespeichert;
 * Koordinaten nur auf eine Nachkommastelle (etwa 10 km).
 */
export interface Where { cc?: string; lat?: number; lon?: number; city?: string }

const round = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined;
};

export function whereFrom(cf: unknown): Where {
  const c = (cf || {}) as Record<string, unknown>;
  const cc = typeof c.country === "string" && /^[A-Z]{2}$/.test(c.country) && c.country !== "XX" && c.country !== "T1" ? c.country : undefined;
  const lat = round(c.latitude), lon = round(c.longitude);
  const city = typeof c.city === "string" ? c.city.slice(0, 60) : undefined;
  return { ...(cc ? { cc } : {}), ...(lat != null && lon != null && !(lat === 0 && lon === 0) ? { lat, lon } : {}), ...(city ? { city } : {}) };
}
