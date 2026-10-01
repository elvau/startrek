import { i18n, locale, t, tn } from "./i18n/index.svelte";

const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const d = (iso: string) => new Date(iso.length === 10 ? iso + "T12:00" : iso);

export function nights(from?: string, to?: string): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((d(to).getTime() - d(from).getTime()) / 86400000));
}

/** "18. bis 29. Juli" oder "28. Juli bis 3. August" */
export function range(from?: string, to?: string): string {
  if (!from || !to) return t("date.open");
  const a = d(from), b = d(to);
  // andere Sprachen: Zeitspanne wie im Land üblich („18–29 July“, „18–29 juillet“)
  if (i18n.lang !== "de") return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" }).formatRange(a, b);
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}. bis ${b.getDate()}. ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()}. ${MONTHS[a.getMonth()]} bis ${b.getDate()}. ${MONTHS[b.getMonth()]}`;
}

/** "Sa 18.07." */
export const dayShort = (iso: string) => {
  const x = d(iso);
  if (i18n.lang !== "de") return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "2-digit", month: "2-digit" }).format(x);
  return `${DAYS[x.getDay()]} ${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.`;
};
export const time = (iso: string) => iso.slice(11, 16);
/** Tag und Monat („18.07.“, englisch „18/07“) */
export const dateDE = (iso: string) => {
  const x = d(iso);
  if (i18n.lang !== "de") return new Intl.DateTimeFormat(locale(), { day: "2-digit", month: "2-digit" }).format(x);
  return `${String(x.getDate()).padStart(2, "0")}.${String(x.getMonth() + 1).padStart(2, "0")}.`;
};

/** Dauer zwischen zwei lokalen Zeiten, "2 h 15 min" (nur richtig in derselben Zeitzone) */
export function duration(a: string, b: string): string {
  return minutesText(Math.round((d(b).getTime() - d(a).getTime()) / 60000));
}
export const minutesText = (m: number) => (m > 0 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : "");
/** Flugdauer: aus der Suche (zeitzonenrichtig), sonst aus Abflug und Landung */
export const legDuration = (l: { dep: string; arr: string; minutes?: number }) => (l.minutes ? minutesText(l.minutes) : duration(l.dep, l.arr));

/** "Juli 2027" */
export const monthYear = (iso: string) => {
  const x = d(iso);
  if (i18n.lang !== "de") return new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" }).format(x);
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
};

/** Name aus Ziel und Zeitraum, z. B. "Mosel · Juli 2027 · 4 Tage"; ohne Ziel und Daten null */
export function autoName(x: { place?: string; from?: string; to?: string }): string | null {
  const place = x.place?.trim();
  if (!place && !x.from) return null;
  const n = nights(x.from, x.to);
  return [place || t("trip"), x.from ? monthYear(x.from) : "", n ? tn("n.days", n + 1) : ""].filter(Boolean).join(" · ");
}

/** Ortszeit „JJJJ-MM-TTTHH:MM“ um h Stunden verschieben (ohne Zeitzonen, über UTC gerechnet) */
export function shiftLocal(iso: string, h: number): string {
  const d = new Date(`${iso.slice(0, 16)}:00Z`);
  d.setUTCHours(d.getUTCHours() + h);
  return d.toISOString().slice(0, 16);
}
