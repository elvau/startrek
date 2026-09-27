/* Deutsche Postleitzahlen mit Koordinaten (aus der bisherigen App, public/plz.txt) */
export interface Place { lat: number; lon: number; ort: string }

let table: Map<string, Place> | null = null;
let loading: Promise<Map<string, Place>> | null = null;

export function loadPlz(): Promise<Map<string, Place>> {
  if (table) return Promise.resolve(table);
  loading ??= fetch(import.meta.env.BASE_URL + "plz.txt")
    .then(r => r.text())
    .then(t => {
      const m = new Map<string, Place>();
      t.split("|").forEach(x => {
        if (x.length > 15) m.set(x.slice(0, 5), { lat: (+x.slice(5, 10) + 47000) / 1000, lon: (+x.slice(10, 15) + 5000) / 1000, ort: x.slice(15) });
      });
      return (table = m);
    });
  return loading;
}

/** Vorschläge zu einer angefangenen PLZ oder einem Ortsnamen */
export function suggest(m: Map<string, Place>, q: string, max = 6): [string, Place][] {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const out: [string, Place][] = [];
  const byPlz = /^\d+$/.test(q);
  for (const [plz, p] of m) {
    if (byPlz ? plz.startsWith(q) : p.ort.toLowerCase().startsWith(q)) out.push([plz, p]);
    if (out.length >= max) break;
  }
  return out;
}
