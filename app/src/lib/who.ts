/*
 * Wer fährt mit (neue Reise): Solo, Partner, Familie oder Gruppe. Familie und Gruppe starten auf einem von drei Wegen:
 * aus gespeicherten Gruppen, mit einer neuen Gruppe (wird gespeichert) oder mit Platzhalter-Tieren. Nichts ist vorausgewählt.
 */
import type { Directory } from "./model";
import type { FamilyRow } from "./placeholders";

export type WhoMode = "solo" | "partner" | "family" | "group";
export type WhoSrc = "" | "saved" | "new" | "animals";

/** neue Person, die erst beim Anlegen der Reise gespeichert wird */
export interface Draft { key: string; first: string; last: string; age?: number }

export interface Who {
  mode: WhoMode;
  /** Weg bei Familie und Gruppe; leer = noch nicht gewählt */
  src: WhoSrc;
  solo: string;
  /** solo als man selbst (Person „Das bin ich“ oder Name des Kontos), sobald bekannt; sonst als Tier */
  soloMe?: boolean;
  partner: string;
  fams: FamilyRow[];
  group: { adults: number; kids: number };
  /** Tier im Namen der Gruppenreise */
  mascot: string;
  /** aus gespeicherten Gruppen: gewählte Gruppen und Personen */
  groups: string[];
  picked: string[];
  /** neue Gruppe: Name, vorhandene Personen, neue Personen */
  ng: { name: string; ids: string[]; drafts: Draft[] };
}

export const needsSrc = (w: Who) => w.mode === "family" || w.mode === "group";

/** Gruppe an- oder abwählen: ihre Mitglieder kommen dazu bzw. gehen, außer sie sind in einer anderen gewählten Gruppe */
export function toggleSavedGroup(w: Who, d: Directory, id: string) {
  const g = d.groups.find(x => x.id === id);
  if (!g) return;
  if (w.groups.includes(id)) {
    w.groups = w.groups.filter(x => x !== id);
    const keep = new Set(d.groups.filter(x => w.groups.includes(x.id)).flatMap(x => x.memberIds));
    w.picked = w.picked.filter(p => !g.memberIds.includes(p) || keep.has(p));
  } else {
    w.groups = [...w.groups, id];
    w.picked = [...new Set([...w.picked, ...g.memberIds])];
  }
}

export const togglePicked = (w: Who, id: string) => (w.picked = w.picked.includes(id) ? w.picked.filter(x => x !== id) : [...w.picked, id]);

/** Personen in die neue Gruppe (ziehen oder antippen) und wieder heraus */
export const addToNew = (w: Who, id: string) => { if (!w.ng.ids.includes(id)) w.ng.ids = [...w.ng.ids, id]; };
export const dropFromNew = (w: Who, id: string) => (w.ng.ids = w.ng.ids.filter(x => x !== id));

/** Personen in der Reise (ohne Platzhalter) */
export function whoCount(w: Who): number {
  if (w.mode === "solo") return 1;
  if (w.mode === "partner") return 2;
  if (w.src === "saved") return w.picked.length;
  if (w.src === "new") return w.ng.ids.length + w.ng.drafts.length;
  if (w.src === "animals") return w.mode === "family" ? w.fams.reduce((a, r) => a + r.adults + r.kids + (r.infants || 0), 0) : w.group.adults + w.group.kids;
  return 0;
}

/** was noch fehlt, bevor die Reise angelegt werden kann (Übersetzungsschlüssel), sonst "" */
export function whoMissing(w: Who): string {
  if (!needsSrc(w)) return "";
  if (!w.src) return "who.needSrc";
  if (w.src === "new" && !w.ng.name.trim()) return "who.needName";
  if (!whoCount(w)) return "who.needPeople";
  return "";
}

/** Name der gewählten Gruppe(n) für den Knopf, z. B. „Familie Müller“ oder „Familie Müller & Kegelclub“ */
export function whoGroupName(w: Who, d: Directory): string {
  if (w.src === "new") return w.ng.name.trim();
  if (w.src !== "saved") return "";
  const names = d.groups.filter(g => w.groups.includes(g.id)).map(g => g.name);
  return names.length > 2 ? `${names.slice(0, 2).join(" & ")} …` : names.join(" & ");
}
