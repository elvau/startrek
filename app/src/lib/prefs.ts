/*
 * Vorlieben: eigene (im Konto) und je Gruppe. Eine Reise nimmt die eigenen Vorlieben und darüber die der kleinsten
 * gespeicherten Gruppe, in der alle ihre gespeicherten Personen stecken. Gesperrte Länder werden zusammengelegt.
 */
import type { Directory, Group, Prefs, Trip } from "./model";
import type { FlightOffer } from "./flights/types";

/** b überschreibt a Punkt für Punkt; gesperrte Länder aus beiden */
export function mergePrefs(a: Prefs = {}, b: Prefs = {}): Prefs {
  const out: Prefs = { ...a };
  for (const [k, v] of Object.entries(b)) if (v != null && !(Array.isArray(v) && !v.length && k !== "avoid")) (out as Record<string, unknown>)[k] = v;
  const avoid = [...new Set([...(a.avoid || []), ...(b.avoid || [])])];
  if (avoid.length) out.avoid = avoid; else delete out.avoid;
  return out;
}

/** Gruppe der Reise: die kleinste, in der alle gespeicherten Personen der Reise sind */
export function groupFor(trip: Trip, dir: Directory): Group | null {
  const ids = [...new Set(trip.travelers.map(t => t.personId).filter((x): x is string => !!x))];
  if (!ids.length) return null;
  return dir.groups.filter(g => ids.every(id => g.memberIds.includes(id))).sort((a, b) => a.memberIds.length - b.memberIds.length)[0] || null;
}

export const prefsFor = (trip: Trip | null, dir: Directory): Prefs => mergePrefs(dir.prefs, trip ? groupFor(trip, dir)?.prefs : undefined);

/** Wohnort der Person „Ich“ (für die KI auf der Startseite) */
export const myHome = (dir: Directory) => (dir.me ? dir.people.find(p => p.id === dir.me)?.home : undefined);

/** Flug berührt ein gesperrtes Land (Ziel oder Umstieg)? cc: Land zu einem Flughafen-Code */
export function touchesAvoided(o: FlightOffer, avoid: string[] | undefined, cc: (code: string) => string | undefined): boolean {
  if (!avoid?.length) return false;
  const codes = [...o.out.route, ...(o.back?.route || []), o.out.to, o.out.from];
  return codes.some(c => { const k = cc(c); return !!k && avoid.includes(k); });
}

/** Vorlieben für die KI: nur was sie braucht, ohne Namen */
export function agentPrefs(p: Prefs): Prefs | undefined {
  const keys: (keyof Prefs)[] = ["avoid", "maxStops", "bags", "maxHours", "stayType", "minStars", "board", "styles", "budget", "note", "holidays", "months", "nightsMin", "nightsMax"];
  const out = Object.fromEntries(keys.filter(k => p[k] != null && !(Array.isArray(p[k]) && !(p[k] as unknown[]).length)).map(k => [k, p[k]])) as Prefs;
  if (out.note) out.note = out.note.slice(0, 300);
  return Object.keys(out).length ? out : undefined;
}
