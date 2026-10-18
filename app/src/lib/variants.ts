/*
 * Varianten einer Reise als Vergleich (#428): Reisen mit derselben Vergleichs-Kennung gehören zusammen. Herausnehmen
 * löscht nur die Kennung an der Reise; bleibt nur eine Variante übrig, gilt der Vergleich als aufgelöst (beim Bündeln),
 * ohne dass die übrigen Reisen geändert werden müssen.
 */
import { uid, type Trip } from "./model";

/** kurzer Name einer Variante: eigener Name, sonst Ort bzw. Land, sonst Name der Reise */
export const variantLabel = (t: Pick<Trip, "cmp" | "place" | "country" | "name">) => t.cmp?.label || t.place || t.country || t.name;

/** Reise in einen Vergleich bringen (neu, falls sie noch in keinem ist); gibt die Kennung zurück */
export function ensureCompare(t: Trip, title = t.name): string {
  if (!t.cmp) t.cmp = { id: uid(), title: title.trim().slice(0, 120) || t.name };
  return t.cmp.id;
}

/** neue Variante: Kopie im selben Vergleich, Name der Variante ergibt sich aus Ort bzw. Land (bis man ihn ändert) */
export function asVariant(orig: Trip, copy: Trip) {
  ensureCompare(orig);
  copy.cmp = { id: orig.cmp!.id, title: orig.cmp!.title };
}

/** aus dem Vergleich nehmen: wieder eine normale Reise */
export function leaveCompare(t: Trip) { delete t.cmp; }

/**
 * Reise auf eine andere gezogen: Vergleich des Ziels, sonst ein neuer (Titel aus dem gemeinsamen Namensanfang, sonst
 * beide Namen); null, wenn die Reise schon in diesem Vergleich ist
 */
export function joinTarget(dst: Pick<Trip, "cmp" | "name">, src: Pick<Trip, "cmp" | "name">, id = uid()): { id: string; title: string } | null {
  if (dst.cmp && src.cmp?.id === dst.cmp.id) return null;
  if (dst.cmp) return { id: dst.cmp.id, title: dst.cmp.title };
  const a = dst.name.trim(), b = src.name.trim();
  return { id, title: (commonTitle([a, b]) || (a === b ? a : `${a} · ${b}`)).slice(0, 120) };
}

/** gemeinsamer Anfang der Namen als Titel („JGA Malle“, „JGA Hamburg“ → „JGA“); sonst leer */
export function commonTitle(names: string[]): string {
  const ws = names.map(n => n.trim().split(/\s+/));
  if (ws.length < 2) return names[0]?.trim() || "";
  const out: string[] = [];
  for (let i = 0; ws.every(w => i < w.length - 1 && w[i].toLowerCase() === ws[0][i].toLowerCase()); i++) out.push(ws[0][i]);
  return out.join(" ").replace(/[\s·:–-]+$/, "");
}

export interface Bundle<T> { cmp: string; title: string; list: T[] }
export const isBundle = <T>(x: T | Bundle<T>): x is Bundle<T> => !!x && typeof x === "object" && "cmp" in x && "list" in x && Array.isArray((x as Bundle<T>).list);

/**
 * Varianten bündeln: je Vergleich mit mindestens zwei Reisen ein Bündel an der Stelle der ersten; einzelne bleiben
 * normale Einträge (Vergleich aufgelöst)
 */
export function bundle<T extends { id: string; cmp?: { id: string; title: string } | null }>(rows: T[]): (T | Bundle<T>)[] {
  const by = new Map<string, T[]>();
  for (const r of rows) if (r.cmp?.id) by.set(r.cmp.id, [...(by.get(r.cmp.id) || []), r]);
  const out: (T | Bundle<T>)[] = [], done = new Set<string>();
  for (const r of rows) {
    const k = r.cmp?.id, list = k ? by.get(k)! : [];
    if (!k || list.length < 2) { out.push(r); continue; }
    if (done.has(k)) continue;
    done.add(k);
    out.push({ cmp: k, title: list[0].cmp!.title, list });
  }
  return out;
}

/** Varianten desselben Vergleichs (ohne die Reise selbst) */
export const siblings = <T extends { id: string; cmp?: { id: string } | null }>(t: { id: string; cmp?: { id: string } }, all: T[]) =>
  t.cmp ? all.filter(x => x.id !== t.id && x.cmp?.id === t.cmp!.id) : [];

/** gewählte Variante („Diese nehmen“, #430): die mit dem jüngsten Zeitpunkt; umentscheiden = andere neu wählen */
export function pickedOf<T extends { id: string; cmp?: { chosen?: string } | null }>(list: T[]): T | undefined {
  return list.filter(x => x.cmp?.chosen).sort((a, b) => b.cmp!.chosen!.localeCompare(a.cmp!.chosen!))[0];
}
