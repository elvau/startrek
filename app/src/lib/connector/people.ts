/*
 * Familien, Gruppen und Vorlieben aus dem Konto für den KI-Konnektor (#595), ohne Svelte (auch für den Such-Dienst).
 * Der Assistent sieht keine Namen von Personen: Familien heißen F1, F2 … (Reihenfolge der gespeicherten Personen, die eigene
 * zuerst), dazu Erwachsene, Kinderalter und Wohnort ohne PLZ. Gruppen mit ihrem Namen. Angaben „Nur für dich“ gibt es hier nicht.
 * Beim Anlegen einer Reise macht der Such-Dienst daraus die echten Reisenden, wie „Aus Gruppe hinzufügen“ in der App.
 */
import { uid, type Directory, type Person, type Prefs, type Traveler } from "../model";
import { personAge } from "../people";

export interface FamilyView { id: string; you?: boolean; adults: number; childAges: number[]; unknownAges?: number; home?: string }
export interface GroupView { name: string; families: string[]; adults: number; childAges: number[]; unknownAges?: number; prefs?: Partial<Prefs> }
export interface TravelersView { families: FamilyView[]; groups: GroupView[]; prefs?: Partial<Prefs>; ageDay: string }

const MAX_FAMILIES = 30;
const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8", "#3F8FB0", "#B0563A"];

/** Vorlieben ohne Postleitzahl (bleibt im Konto) */
function cleanPrefs(p?: Prefs): Partial<Prefs> | undefined {
  if (!p) return undefined;
  const { plz: _plz, plzCc: _cc, ...rest } = p;
  return Object.keys(rest).length ? rest : undefined;
}

/** Familien nach Nachname, die eigene zuerst; Kennungen F1, F2 … */
function families(d: Directory): { id: string; key: string; people: Person[] }[] {
  const byKey = new Map<string, Person[]>();
  for (const p of d.people) {
    const k = (p.last || "").trim() || "—";
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(p);
  }
  const mine = d.me ? d.people.find(p => p.id === d.me) : undefined;
  const keys = [...byKey.keys()];
  if (mine) { const k = (mine.last || "").trim() || "—"; keys.splice(keys.indexOf(k), 1); keys.unshift(k); }
  return keys.slice(0, MAX_FAMILIES).map((key, i) => ({ id: `F${i + 1}`, key, people: byKey.get(key)! }));
}

/** Erwachsene (ab 18, unbekanntes Alter zählt mit) und Kinderalter einer Liste von Personen */
function counts(people: Person[], day: string) {
  const ages = people.map(p => personAge(p, day));
  const unknown = ages.filter(a => a == null).length;
  return {
    adults: ages.filter(a => a != null && a >= 18).length + unknown,
    childAges: ages.filter((a): a is number => a != null && a < 18).sort((a, b) => b - a),
    ...(unknown ? { unknownAges: unknown } : {})
  };
}

export function travelersView(d: Directory, day: string): TravelersView {
  const fams = families(d);
  const mine = d.me ? d.people.find(p => p.id === d.me) : undefined;
  const famOf = (id: string) => fams.find(f => f.people.some(p => p.id === id))?.id;
  return {
    ageDay: day,
    families: fams.map(f => {
      const home = f.people.find(p => p.home?.ort)?.home;
      return {
        id: f.id, ...(mine && f.people.includes(mine) ? { you: true } : {}),
        ...counts(f.people, day),
        ...(home ? { home: [home.ort, home.cc && home.cc !== "DE" ? home.cc : ""].filter(Boolean).join(", ") } : {})
      };
    }),
    // Gruppe mit ihren eigenen Mitgliedern gezählt: oft nur ein Teil einer Familie (sonst passt create_trip nicht zur Anzeige)
    groups: d.groups.filter(g => g.name.trim()).slice(0, 30).map(g => ({
      name: g.name.trim().slice(0, 60),
      families: [...new Set(g.memberIds.map(famOf).filter((x): x is string => !!x))],
      ...counts(g.memberIds.map(id => d.people.find(p => p.id === id)).filter((p): p is Person => !!p), day),
      ...(cleanPrefs(g.prefs) ? { prefs: cleanPrefs(g.prefs) } : {})
    })),
    ...(cleanPrefs(d.prefs) ? { prefs: cleanPrefs(d.prefs) } : {})
  };
}

/**
 * Reisende für eine neue Reise aus Familien (F1 …) bzw. einer Gruppe (Name); Alter zum Stichtag (Reisebeginn).
 * Fehler mit Hinweis für den Assistenten, wenn etwas nicht passt.
 */
export function travelersFor(d: Directory, sel: { families?: unknown; group?: unknown }, day: string): Traveler[] {
  const fams = families(d);
  let people: Person[] = [];
  let group = "";
  if (typeof sel.group === "string" && sel.group.trim()) {
    const g = d.groups.find(x => x.name.trim().toLowerCase() === (sel.group as string).trim().toLowerCase());
    if (!g) throw new Error(`Unknown group "${sel.group}": use a name from get_my_travelers`);
    people = g.memberIds.map(id => d.people.find(p => p.id === id)).filter((p): p is Person => !!p);
    group = g.name.trim().slice(0, 60);
  }
  if (Array.isArray(sel.families)) {
    for (const id of sel.families) {
      const f = fams.find(x => x.id === id);
      if (!f) throw new Error(`Unknown family "${String(id)}": use ids from get_my_travelers`);
      people.push(...f.people.filter(p => !people.includes(p)));
    }
  }
  if (!people.length) throw new Error("No travelers in these families or this group");
  return people.slice(0, 30).map((p, i) => {
    const age = personAge(p, day);
    // Herkunft aus der Gruppe (#567) für „Wer entscheidet mit?“
    const inGroup = group && d.groups.some(g => g.name.trim().slice(0, 60) === group && g.memberIds.includes(p.id));
    return { id: uid(), personId: p.id, name: p.first, household: p.last, ...(age != null ? { age } : {}), color: COLORS[i % COLORS.length], ...(inGroup ? { group } : {}) };
  });
}
