/*
 * Zeitraum in einem Kalender wählen (wie bei Airbnb): erster Tipp = von, zweiter = bis.
 * Tippt man beim zweiten Mal vor den Anfang, beginnt der Zeitraum dort neu. Reine Logik, ohne Oberfläche.
 */

export interface Span { from: string; to: string }

/** nächster Stand nach einem Tipp auf `day`; `done`, sobald von und bis stehen */
export function pickDay(cur: Span, day: string, picking: "from" | "to", sameDay = false): Span & { picking: "from" | "to"; done: boolean } {
  if (picking === "from" || !cur.from || day < cur.from || (day === cur.from && !sameDay))
    return { from: day, to: "", picking: "to", done: false };
  return { from: cur.from, to: day, picking: "from", done: true };
}

const utc = (d: string) => new Date(d + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Tage eines Monats (JJJJ-MM) in Wochen, Montag zuerst; null füllt den Anfang */
export function monthGrid(ym: string): (string | null)[] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: (string | null)[] = Array((first.getUTCDay() + 6) % 7).fill(null);
  for (let d = 1; d <= len; d++) out.push(iso(new Date(Date.UTC(y, m - 1, d))));
  return out;
}

/** Monat verschieben (JJJJ-MM) */
export function addMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
}

/** Tage zwischen zwei Daten (JJJJ-MM-TT) */
export const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 86400000);
