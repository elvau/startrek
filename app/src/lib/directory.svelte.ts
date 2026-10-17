/*
 * Gespeicherte Personen und Gruppen. Lokal im Browser, bei Anmeldung zusätzlich im Konto
 * (profiles/{uid}), damit sie auf allen Geräten da sind. Nur man selbst sieht sie.
 */
import { uid, type Directory, type Group, type Household, type Person, type Traveler } from "./model";
import { cloud } from "./cloud/cloud.svelte";
import { configured } from "./cloud/config";
import { personAge } from "./people";
import { newerTerms, waitForServer } from "./terms";

const KEY = "rk2-dir";

function load(): Directory {
  try { const d = JSON.parse(localStorage.getItem(KEY) || "null"); if (d?.people && d?.groups) return d; } catch {}
  return { people: [], groups: [] };
}

/** Postleitzahl bleibt nur im Konto: nie in den Browser-Speicher */
export function localJson(json: string): string {
  try {
    const d = JSON.parse(json);
    if (d?.prefs && "plz" in d.prefs) { delete d.prefs.plz; return JSON.stringify(d); }
  } catch {}
  return json;
}

export const dir = $state<Directory>(load());

let fromCloud = "";
/** zuletzt ins Konto geschickte Stände: kommt einer davon zurück, ist es das Echo des eigenen Speicherns */
const sent: string[] = [];
/** Konto, dessen Stand schon empfangen wurde; vorher wird nichts hochgeladen */
const sync = $state({ loaded: "", halted: false });
let timer: ReturnType<typeof setTimeout> | undefined;
let stop: (() => void) | null = null;
/** laufendes Speichern ins Konto (beim Zurücksetzen abwarten) */
let saving: Promise<unknown> | null = null;

/** Stand des Kontos ist da (bzw. ohne Anmeldung sofort): erst dann entscheiden, ob der Assistent von selbst startet */
export const dirReady = () => !cloud.user ? cloud.ready : sync.loaded === cloud.user.uid;

/** Stand ohne Rücksicht auf die Reihenfolge der Felder (zwei Fenster dürfen sich nicht gegenseitig „Änderungen“ schicken) */
export function canonDir(json: string): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, sort((v as Record<string, unknown>)[k])])) : v;
  try { return JSON.stringify(sort(JSON.parse(json))); } catch { return json; }
}

/** Stand aus dem Konto lesen; fehlende oder kaputte Listen als leer (sonst „people is not iterable“) */
export function parseDir(data: string | null): Directory {
  let d: Partial<Directory> | null = null;
  try { d = data ? JSON.parse(data) : null; } catch {}
  if (!d || typeof d !== "object") return { people: [], groups: [] };
  return { ...d, people: Array.isArray(d.people) ? d.people : [], groups: Array.isArray(d.groups) ? d.groups : [] };
}

const remember = (json: string) => { sent.push(json); if (sent.length > 5) sent.shift(); };

/**
 * Was ins Konto geschrieben wird: der eigene Stand, außer im Konto liegt inzwischen ein anderer als zuletzt gesehen (base),
 * etwa weil ein zweites Gerät nach der Anmeldung gleichzeitig gespeichert hat. Dann beide zusammenführen, sonst gingen
 * dessen Personen und Gruppen verloren (#364). Gelöschtes kann dabei vom anderen Stand zurückkommen; besser als Verlust.
 */
export function toWrite(local: string, remote: string | null, base: string): string {
  if (remote === null || canonDir(remote) === canonDir(base) || canonDir(remote) === canonDir(local)) return local;
  try { return JSON.stringify(mergeDir(parseDir(local), parseDir(remote))); } catch { return local; }
}

/** zwei Stände zusammenführen: alles aus beiden, bei gleicher ID gewinnt a; „Ich“ und eigene Vorlieben aus a, sonst b; AGB: die neuere Zustimmung */
export function mergeDir(a: Directory, b: Directory): Directory {
  const people = [...a.people, ...b.people.filter(p => !a.people.some(x => x.id === p.id))];
  const groups = [...a.groups, ...b.groups.filter(g => !a.groups.some(x => x.id === g.id))];
  const me = a.me ?? b.me, prefs = a.prefs ?? b.prefs, setup = a.setup ?? b.setup, terms = newerTerms(a.terms, b.terms);
  return { people, groups, ...(me ? { me } : {}), ...(prefs ? { prefs } : {}), ...(setup ? { setup } : {}), ...(terms ? { terms } : {}) };
}

/** Stand aus dem Konto übernehmen (Personen, Gruppen, „Ich“, eigene Vorlieben) */
function apply(next: Directory) {
  dir.people = next.people; dir.groups = next.groups;
  if (next.me) dir.me = next.me; else delete dir.me;
  if (next.prefs) dir.prefs = next.prefs; else delete dir.prefs;
  if (next.setup) dir.setup = next.setup; else delete dir.setup;
  if (next.terms) dir.terms = next.terms; else delete dir.terms;
}

$effect.root(() => {
  // lokal speichern und ins Konto schreiben
  $effect(() => {
    const json = JSON.stringify(dir);
    if (sync.halted) return;
    try { localStorage.setItem(KEY, localJson(json)); } catch {}
    const u = cloud.user;
    if (!u || sync.loaded !== u.uid || json === fromCloud || canonDir(json) === canonDir(fromCloud)) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = undefined;
      const f = await import("./cloud/firebase");
      if (sync.halted) return;
      const base = fromCloud;
      fromCloud = json;
      remember(json);
      // ohne Verbindung wie bisher (wartet im Zwischenspeicher), sonst als Transaktion gegen das Überschreiben durch ein anderes Gerät
      const run = navigator.onLine === false ? f.saveProfile(u.uid, json).then(() => json)
        : f.saveProfileTx(u.uid, remote => toWrite(json, remote, base));
      saving = run;
      try {
        const out = await run;
        if (out !== json && !sync.halted) {
          // im Konto lag ein neuerer Stand: zusammengeführt übernehmen (Eingaben seit dem Speichern bleiben vorn)
          fromCloud = out; remember(out);
          const now = JSON.stringify($state.snapshot(dir));
          apply(now === json ? parseDir(out) : mergeDir(parseDir(now), parseDir(out)));
        }
      } catch (e) { console.warn(e); fromCloud = ""; } finally { saving = null; }
    }, 500);
  });
  // bei Anmeldung das Profil aus dem Konto beobachten
  $effect(() => {
    const u = cloud.user;
    stop?.(); stop = null;
    sync.loaded = "";
    if (!u || !configured || sync.halted) return;
    let first = true;
    void import("./cloud/firebase").then(f => {
      if (sync.halted) return;
      stop = f.watchProfile(u.uid, (data, pending, fromCache) => {
        if (pending) return;
        // Stand nur aus dem Zwischenspeicher ohne aktuelle AGB-Zustimmung: auf den Server warten (kein kurzes Aufblitzen des Zustimmungsfensters)
        if (first && waitForServer(data, fromCache)) return;
        // Echo des eigenen Speicherns oder noch ungespeicherte Eingaben: der Stand im Browser ist neuer, nichts überschreiben
        // (sonst sprangen Felder beim Tippen zurück, z. B. in den Vorlieben einer Gruppe)
        if (!first && (timer || (data && sent.includes(data)))) { sync.loaded = u.uid; return; }
        const remote = parseDir(data);
        // beim ersten Mal lokale Einträge mitnehmen, danach gilt der Stand aus dem Konto
        const next = first ? mergeDir(remote, $state.snapshot(dir)) : remote;
        first = false;
        fromCloud = data || "";
        if (canonDir(JSON.stringify(next)) !== canonDir(JSON.stringify($state.snapshot(dir)))) apply(next);
        sync.loaded = u.uid;
      }, e => console.warn(e));
    });
  });
});

/**
 * Vor dem Zurücksetzen des Kontos: Profil nicht mehr beobachten und nicht mehr speichern, auf ein laufendes Speichern
 * warten (#339). on = false: Zurücksetzen fehlgeschlagen, wieder wie vorher. Sonst legte das gelöschte Profil (leerer Stand aus dem Konto oder verzögertes Speichern) es gleich wieder an.
 */
export async function haltDirectory(on = true) {
  sync.halted = on;
  if (!on) return;
  clearTimeout(timer); timer = undefined;
  stop?.(); stop = null;
  try { await saving; } catch { /* schon gemeldet */ }
}

export const fullName = (p: Person) => `${p.first} ${p.last}`.trim();

export function addPerson(first: string, last: string, age?: number | null, more: Pick<Person, "birth" | "home"> = {}): Person {
  const p: Person = { id: uid(), first: first.trim(), last: last.trim(), ...(age ? { age } : {}), ...(more.birth ? { birth: more.birth } : {}), ...(more.home ? { home: more.home } : {}) };
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

/** Reisende aus Personen machen (Nachname = Familie); day: Stichtag für das Alter (Reisebeginn) */
export function travelersFrom(ids: string[], existing: Traveler[] = [], day?: string): Traveler[] {
  const have = new Set(existing.map(t => t.personId).filter(Boolean));
  return ids.filter(id => !have.has(id)).map(id => dir.people.find(p => p.id === id)).filter((p): p is Person => !!p)
    .map((p, i) => ({ id: uid(), personId: p.id, name: p.first, household: p.last, age: personAge(p, day) ?? undefined, color: COLORS[(existing.length + i) % COLORS.length] }));
}

/** Aktuelle Reisende als Personen und Gruppe speichern; Wohnorte der Familien werden zum Wohnort der Personen */
export function saveAsGroup(name: string, travelers: Traveler[], households: Record<string, Household> = {}): Group {
  const ids = travelers.map(t => {
    const h = households[t.household.trim() || "Ohne Haushalt"];
    const home = h?.geo && h.plz ? { plz: h.plz, ort: h.geo.ort, lat: h.geo.lat, lon: h.geo.lon } : undefined;
    const known = t.personId ? dir.people.find(p => p.id === t.personId) : undefined;
    if (known) { if (home && !known.home) known.home = home; return known.id; }
    const same = dir.people.find(p => p.first === t.name.trim() && p.last === t.household.trim());
    if (same && home && !same.home) same.home = home;
    const p = same || addPerson(t.name, t.household, t.age, { home });
    t.personId = p.id;
    return p.id;
  });
  return addGroup(name, [...new Set(ids)]);
}
