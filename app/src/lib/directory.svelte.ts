/*
 * Gespeicherte Personen und Gruppen. Lokal im Browser, bei Anmeldung zusätzlich im Konto
 * (profiles/{uid}), damit sie auf allen Geräten da sind. Nur man selbst sieht sie.
 */
import { uid, type Directory, type Group, type Person, type Traveler } from "./model";
import { cloud } from "./cloud/cloud.svelte";
import { configured } from "./cloud/config";

const KEY = "rk2-dir";

function load(): Directory {
  try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d?.people && d?.groups) return d; } catch {}
  return { people: [], groups: [] };
}

export const dir = $state<Directory>(load());

let fromCloud = "";
/** Konto, dessen Stand schon empfangen wurde; vorher wird nichts hochgeladen */
const sync = $state({ loaded: "" });
let timer: ReturnType<typeof setTimeout> | undefined;
let stop: (() => void) | null = null;

/** zwei Stände zusammenführen: alles aus beiden, bei gleicher ID gewinnt a */
function merge(a: Directory, b: Directory): Directory {
  const people = [...a.people, ...b.people.filter(p => !a.people.some(x => x.id === p.id))];
  const groups = [...a.groups, ...b.groups.filter(g => !a.groups.some(x => x.id === g.id))];
  return { people, groups };
}

$effect.root(() => {
  // lokal speichern und ins Konto schreiben
  $effect(() => {
    const json = JSON.stringify(dir);
    try { localStorage.setItem(KEY, json); } catch {}
    const u = cloud.user;
    if (!u || sync.loaded !== u.uid || json === fromCloud) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const f = await import("./cloud/firebase");
      fromCloud = json;
      try { await f.saveProfile(u.uid, json); } catch (e) { console.warn(e); fromCloud = ""; }
    }, 500);
  });
  // bei Anmeldung das Profil aus dem Konto beobachten
  $effect(() => {
    const u = cloud.user;
    stop?.(); stop = null;
    sync.loaded = "";
    if (!u || !configured) return;
    let first = true;
    void import("./cloud/firebase").then(f => {
      stop = f.watchProfile(u.uid, (data, pending) => {
        if (pending) return;
        const remote: Directory = data ? JSON.parse(data) : { people: [], groups: [] };
        // beim ersten Mal lokale Einträge mitnehmen, danach gilt der Stand aus dem Konto
        const next = first ? merge(remote, $state.snapshot(dir)) : remote;
        first = false;
        fromCloud = data || "";
        if (JSON.stringify(next) !== JSON.stringify($state.snapshot(dir))) { dir.people = next.people; dir.groups = next.groups; }
        sync.loaded = u.uid;
      }, e => console.warn(e));
    });
  });
});

export const fullName = (p: Person) => `${p.first} ${p.last}`.trim();

export function addPerson(first: string, last: string, age?: number): Person {
  const p: Person = { id: uid(), first: first.trim(), last: last.trim(), ...(age ? { age } : {}) };
  dir.people.push(p);
  return p;
}

export function removePerson(id: string) {
  dir.people = dir.people.filter(p => p.id !== id);
  dir.groups.forEach(g => (g.memberIds = g.memberIds.filter(m => m !== id)));
}

export function addGroup(name: string, memberIds: string[] = []): Group {
  const g: Group = { id: uid(), name: name.trim(), memberIds };
  dir.groups.push(g);
  return g;
}

export function removeGroup(id: string) { dir.groups = dir.groups.filter(g => g.id !== id); }

export function toggleMember(g: Group, personId: string) {
  g.memberIds = g.memberIds.includes(personId) ? g.memberIds.filter(x => x !== personId) : [...g.memberIds, personId];
}

const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8", "#3F8FB0", "#B0563A"];

/** Reisende aus Personen machen (Nachname = Familie) */
export function travelersFrom(ids: string[], existing: Traveler[] = []): Traveler[] {
  const have = new Set(existing.map(t => t.personId).filter(Boolean));
  return ids.filter(id => !have.has(id)).map(id => dir.people.find(p => p.id === id)).filter((p): p is Person => !!p)
    .map((p, i) => ({ id: uid(), personId: p.id, name: p.first, household: p.last, age: p.age ?? 30, color: COLORS[(existing.length + i) % COLORS.length] }));
}

/** Aktuelle Reisende als Personen und Gruppe speichern */
export function saveAsGroup(name: string, travelers: Traveler[]): Group {
  const ids = travelers.map(t => {
    if (t.personId && dir.people.some(p => p.id === t.personId)) return t.personId;
    const same = dir.people.find(p => p.first === t.name.trim() && p.last === t.household.trim());
    const p = same || addPerson(t.name, t.household, t.age);
    t.personId = p.id;
    return p.id;
  });
  return addGroup(name, [...new Set(ids)]);
}
