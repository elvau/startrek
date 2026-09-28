const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const d = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00" : iso);

export function nights(from?: string, to?: string): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((d(to).getTime() - d(from).getTime()) / 86400000));
}

/** "18. bis 29. Juli" oder "28. Juli bis 3. August" */
export function range(from?: string, to?: string): string {
  if (!from || !to) return "Reisedaten offen";
  const a = d(from), b = d(to);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}. bis ${b.getDate()}. ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()}. ${MONTHS[a.getMonth()]} bis ${b.getDate()}. ${MONTHS[b.getMonth()]}`;
}

/** "Sa 18.07." */
export const dayShort = (iso: string) => { const x = d(iso); return `${DAYS[x.getDay()]} ${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.`; };
export const time = (iso: string) => iso.slice(11, 16);
export const dateDE = (iso: string) => { const x = d(iso); return `${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.`; };

/** Dauer zwischen zwei lokalen Zeiten, "2 h 15 min" */
export function duration(a: string, b: string): string {
  const m = Math.round((d(b).getTime() - d(a).getTime()) / 60000);
  if (!(m > 0)) return "";
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

/** "Juli 2027" */
export const monthYear = (iso: string) => { const x = d(iso); return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };

/** Name aus Ziel und Zeitraum, z. B. "Mosel · Juli 2027 · 4 Tage"; ohne Ziel und Daten null */
export function autoName(t: { place?: string; from?: string; to?: string }): string | null {
  const place = t.place?.trim();
  if (!place && !t.from) return null;
  const n = nights(t.from, t.to);
  return [place || "Reise", t.from ? monthYear(t.from) : "", n ? `${n + 1} Tage` : ""].filter(Boolean).join(" · ");
}
