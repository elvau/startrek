/*
 * Familien, Gruppen und Vorlieben aus dem Konto für den KI-Konnektor (#595), ohne Svelte (auch für den Such-Dienst).
 * Familien heißen F1, F2 … (Reihenfolge der gespeicherten Personen, die eigene zuerst), mit Familienname, Vornamen,
 * Alter (nie das Geburtsdatum) und Wohnort mit PLZ für die Zuordnung, wer von wo losfährt (Dani, 30.10.). Gruppen mit
 * ihrem Namen. Angaben „Nur für dich“ gibt es hier nicht.
 * Beim Anlegen einer Reise macht der Such-Dienst daraus die echten Reisenden, wie „Aus Gruppe hinzufügen“ in der App.
 * Personen und Gruppen anlegen und ändern (savePeople, saveGroup) erst nach Rückfrage im Chat; löschen nur in der App.
 */
import { uid, type Directory, type Group, type Person, type Prefs, type Traveler } from "../model";
import { personAge } from "../people";

export interface MemberView { id: string; first: string; age?: number }
export interface FamilyView { id: string; name: string; you?: boolean; members: MemberView[]; adults: number; childAges: number[]; unknownAges?: number; home?: string }
export interface GroupView { name: string; members: string[]; families: string[]; partOf?: string[]; adults: number; childAges: number[]; unknownAges?: number; prefs?: Partial<Prefs> }
export interface TravelersView { families: FamilyView[]; groups: GroupView[]; prefs?: Partial<Prefs>; ageDay: string }

/** Wohnort als Text: „47906 Kempen“, im Ausland mit Land („Wien, AT“) */
export const homeText = (h: { plz?: string; ort: string; cc?: string }) =>
  [[h.plz, h.ort].filter(Boolean).join(" "), h.cc && h.cc !== "DE" ? h.cc : ""].filter(Boolean).join(", ");

const MAX_FAMILIES = 30;
const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8", "#3F8FB0", "#B0563A"];

/** Vorlieben ohne Postleitzahl (die gehört zum Wohnort der Personen) */
function cleanPrefs(p?: Prefs): Partial<Prefs> | undefined {
  if (!p) return undefined;
  const { plz: _plz, plzCc: _cc, ...rest } = p;
  return Object.keys(rest).length ? rest : undefined;
}

/** Familien nach Nachname, die eigene zuerst; Kennungen F1, F2 … */
export function families(d: Directory): { id: string; key: string; people: Person[] }[] {
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
  const famOf = (id: string) => fams.find(f => f.people.some(p => p.id === id));
  return {
    ageDay: day,
    families: fams.map(f => {
      const home = f.people.find(p => p.home?.ort)?.home;
      return {
        id: f.id, name: f.key, ...(mine && f.people.includes(mine) ? { you: true } : {}),
        members: f.people.map(p => { const age = personAge(p, day); return { id: p.id, first: p.first, ...(age != null ? { age } : {}) }; }),
        ...counts(f.people, day),
        ...(home ? { home: homeText(home) } : {})
      };
    }),
    // Gruppe mit ihren eigenen Mitgliedern gezählt: oft nur ein Teil einer Familie (z. B. nur die Erwachsenen), partOf nennt diese Familien
    groups: d.groups.filter(g => g.name.trim()).slice(0, 30).map(g => {
      const members = g.memberIds.map(id => d.people.find(p => p.id === id)).filter((p): p is Person => !!p);
      const fs = [...new Set(members.map(p => famOf(p.id)).filter(f => !!f))];
      const part = fs.filter(f => f!.people.some(p => !members.includes(p))).map(f => f!.id);
      return {
        name: g.name.trim().slice(0, 60), members: members.map(p => p.id), families: fs.map(f => f!.id),
        ...(part.length ? { partOf: part } : {}),
        ...counts(members, day),
        ...(cleanPrefs(g.prefs) ? { prefs: cleanPrefs(g.prefs) } : {})
      };
    }),
    ...(cleanPrefs(d.prefs) ? { prefs: cleanPrefs(d.prefs) } : {})
  };
}

/**
 * Reisende für eine neue Reise aus Familien (F1 …), einer Gruppe (Name) bzw. einzelnen Personen (Kennung); Alter zum
 * Stichtag (Reisebeginn). Fehler mit Hinweis für den Assistenten, wenn etwas nicht passt.
 */
export function travelersFor(d: Directory, sel: { families?: unknown; group?: unknown; people?: unknown }, day: string, start = 0): Traveler[] {
  const fams = families(d);
  let people: Person[] = [];
  let group = "";
  if (typeof sel.group === "string" && sel.group.trim()) {
    const g = findGroup(d, sel.group) || fail(`Unknown group "${sel.group}": use a name from get_my_travelers`);
    people = g.memberIds.map(id => d.people.find(p => p.id === id)).filter((p): p is Person => !!p);
    group = g.name.trim().slice(0, 60);
  }
  if (Array.isArray(sel.families)) {
    for (const id of sel.families) {
      const f = fams.find(x => x.id === id) || fail(`Unknown family "${String(id)}": use ids from get_my_travelers`);
      people.push(...f.people.filter(p => !people.includes(p)));
    }
  }
  if (Array.isArray(sel.people)) {
    for (const id of sel.people) {
      const p = d.people.find(x => x.id === id) || fail(`Unknown person "${String(id)}": use member ids from get_my_travelers`);
      if (!people.includes(p)) people.push(p);
    }
  }
  if (!people.length) fail("No travelers in these families or this group");
  return people.slice(0, 30).map((p, i) => {
    const age = personAge(p, day);
    // Herkunft aus der Gruppe (#567) für „Wer entscheidet mit?“
    const inGroup = group && d.groups.some(g => g.name.trim().slice(0, 60) === group && g.memberIds.includes(p.id));
    return { id: uid(), personId: p.id, name: p.first, household: p.last, ...(age != null ? { age } : {}), color: COLORS[(start + i) % COLORS.length], ...(inGroup ? { group } : {}) };
  });
}

export const travelerColor = (i: number) => COLORS[i % COLORS.length];

const fail = (m: string): never => { throw new Error(m); };
const findGroup = (d: Directory, name: string): Group | undefined => d.groups.find(x => x.name.trim().toLowerCase() === name.trim().toLowerCase());
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/* ---------- Personen und Gruppen im Konto ändern (nach Rückfrage im Chat) ---------- */

/** Name prüfen: höchstens 40 Zeichen, keine Steuerzeichen */
export function cleanName(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 40) : "";
}

export interface PersonInput { id?: string; first?: string; last?: string; age?: number; home?: Person["home"] }

/**
 * Personen anlegen bzw. ändern: mit Kennung ändern (nur angegebene Felder), ohne Kennung neu (Vor- und Nachname nötig;
 * gibt es den Namen schon, wird diese Person geändert statt doppelt angelegt). Familien umbenennen: alle Personen mit dem
 * Nachnamen. Alter aus einem Geburtsdatum ändert nur die App (Hinweis in notes).
 */
export function savePeople(d: Directory, list: PersonInput[], renames: { from: string; to: string }[] = [], day = new Date().toISOString().slice(0, 10)): { saved: Person[]; notes: string[] } {
  const saved: Person[] = [], notes: string[] = [];
  for (const r of renames) {
    const to = cleanName(r.to);
    const hit = d.people.filter(p => same(p.last, r.from));
    if (!to || !hit.length) fail(`Unknown family "${r.from}": use a family name from get_my_travelers`);
    for (const p of hit) { p.last = to; if (!saved.includes(p)) saved.push(p); }
  }
  if (d.people.length + list.filter(x => !x.id).length > 200) fail("Too many saved people");
  for (const x of list) {
    let p = x.id ? d.people.find(q => q.id === x.id) : undefined;
    if (x.id && !p) fail(`Unknown person "${x.id}": use member ids from get_my_travelers`);
    const first = cleanName(x.first), last = cleanName(x.last);
    if (!p) {
      if (!first || !last) fail("New people need first and last name");
      p = d.people.find(q => same(q.first, first) && same(q.last, last));
      if (!p) { p = { id: uid(), first, last }; d.people.push(p); }
    }
    if (first) p.first = first;
    if (last) p.last = last;
    if (x.age != null) {
      if (p.birth && personAge(p, day) !== x.age) notes.push(`${p.first} ${p.last}: age comes from the birth date saved in the app, change it there`);
      else if (!p.birth) p.age = x.age;
    }
    if (x.home) p.home = x.home;
    if (!saved.includes(p)) saved.push(p);
  }
  return { saved, notes };
}

/**
 * Gruppe anlegen bzw. ändern: Name (vorhandene Gruppe, sonst neu), neuer Name, Mitglieder ersetzen (members) oder
 * ergänzen/entfernen; Mitglieder als Personen- (Kennung) oder Familienkennung (F1: alle der Familie).
 */
export function saveGroup(d: Directory, o: { name: string; newName?: string; members?: unknown[]; add?: unknown[]; remove?: unknown[] }): { group: Group; created: boolean } {
  const name = cleanName(o.name);
  if (!name) fail("name is required");
  const fams = families(d);
  const ids = (v: unknown[] | undefined) => (v || []).flatMap(r => {
    const f = fams.find(x => x.id === r);
    if (f) return f.people.map(p => p.id);
    return d.people.some(p => p.id === r) ? [r as string] : fail(`Unknown person or family "${String(r)}": use ids from get_my_travelers or save_people`);
  });
  let g = findGroup(d, name);
  const created = !g;
  if (!g) {
    if (!o.members?.length && !o.add?.length) fail("A new group needs members");
    if (d.groups.length >= 50) fail("Too many saved groups");
    g = { id: uid(), name, memberIds: [] };
    d.groups.push(g);
  }
  if (o.members) g.memberIds = [...new Set(ids(o.members))];
  g.memberIds = [...new Set([...g.memberIds, ...ids(o.add)])];
  const out = new Set(ids(o.remove));
  g.memberIds = g.memberIds.filter(id => !out.has(id));
  const nn = cleanName(o.newName);
  if (nn) {
    if (d.groups.some(x => x !== g && same(x.name, nn))) fail(`A group "${nn}" already exists`);
    g.name = nn;
  }
  return { group: g, created };
}
