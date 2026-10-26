/*
 * Gruppenchat einer geteilten Reise: Text, Emojis und Bilder, keine Videos und Sprachnachrichten.
 * Je Nachricht ein Dokument trips/{id}/chat/{msgId}. Bilder verkleinert als JPEG (data:-Adresse; beim Verkleinern gehen
 * auch Ortsangaben aus dem Foto verloren) in trips/{id}/chatImg/{msgId}, erst beim Anzeigen geladen: Der Chat selbst bleibt klein.
 */

export interface ChatMsg {
  id: string;
  /** Konto */
  u: string;
  /** Vorname beim Schreiben */
  n: string;
  t: string;
  /** hat ein Bild (liegt in chatImg unter derselben Kennung) */
  img?: boolean;
  /** Zeitpunkt (ms); fehlt, solange der Server ihn noch nicht bestätigt hat */
  at?: number;
}

export const MAX_TEXT = 1000;
/** Bild höchstens so viele Zeichen (data:-Adresse), passt mit Luft in ein Firestore-Dokument */
export const MAX_IMG = 340_000;
/** längere Seite eines Bildes in Pixeln */
export const IMG_EDGE = 1280;
/** so viele Nachrichten lädt der Chat (die neuesten) */
export const CHAT_LIMIT = 150;

export const QUICK_EMOJI = ["👍", "😂", "❤️", "🎉", "😍", "🙈", "🍻", "✈️", "🏖️", "🎳", "😅", "🙏"];

/** Text zum Senden: ohne Steuerzeichen (Zeilenumbrüche bleiben), höchstens drei Leerzeilen am Stück, gekürzt */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, MAX_TEXT);
}

/** nur echte Bilder in der erlaubten Größe (wie die Firestore-Regeln) */
export const validImg = (s: unknown): s is string =>
  typeof s === "string" && s.length < MAX_IMG && /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/.test(s);

/** Datei ist ein Bild (keine Videos, kein Ton) */
export const isImageFile = (f: { type: string }) => /^image\/(jpeg|png|webp|gif|heic|heif|avif|bmp)$/i.test(f.type);

/** Zielgröße beim Verkleinern: längere Seite höchstens edge, nie vergrößern */
export function fitSize(w: number, h: number, edge = IMG_EDGE): { w: number; h: number } {
  const k = Math.min(1, edge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Nachricht aus Firestore lesen; Unbrauchbares fällt weg */
export function parseMsg(id: string, d: Record<string, unknown>): ChatMsg | null {
  if (typeof d.u !== "string" || typeof d.t !== "string") return null;
  const at = d.at as { toMillis?: () => number } | null | undefined;
  const m: ChatMsg = { id, u: d.u, n: typeof d.n === "string" ? d.n : "", t: d.t };
  if (d.img === true) m.img = true;
  if (at && typeof at.toMillis === "function") m.at = at.toMillis();
  return m.t || m.img ? m : null;
}

/** älteste zuerst; noch nicht bestätigte (ohne Zeit) ans Ende */
export const byTime = (a: ChatMsg, b: ChatMsg) => (a.at ?? Infinity) - (b.at ?? Infinity) || a.id.localeCompare(b.id);

/** Tag (JJJJ-MM-TT, Ortszeit) einer Nachricht */
export const dayOf = (at: number | undefined) => {
  const d = at == null ? new Date() : new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export interface ChatRow { m: ChatMsg; day?: string; mine: boolean; /** Name zeigen (erste Nachricht einer Folge von jemand anderem) */ head: boolean }
/** Zeilen für die Anzeige: Datumstrenner beim ersten Eintrag eines Tages, Name nur beim Wechsel der Person */
export function chatRows(msgs: ChatMsg[], me: string): ChatRow[] {
  const out: ChatRow[] = [];
  let lastDay = "", lastU = "";
  for (const m of msgs) {
    const day = dayOf(m.at);
    const newDay = day !== lastDay;
    out.push({ m, mine: m.u === me, head: m.u !== me && (newDay || m.u !== lastU), ...(newDay ? { day } : {}) });
    lastDay = day; lastU = m.u;
  }
  return out;
}

/** ungelesen: fremde Nachrichten nach dem zuletzt gelesenen Zeitpunkt */
export const unreadCount = (msgs: ChatMsg[], lastRead: number, me: string) => msgs.filter(m => m.u !== me && (m.at ?? 0) > lastRead).length;

/** darf löschen: eigene Nachricht oder Besitzer der Reise */
export const canDelete = (m: ChatMsg, me: string, owner: boolean) => m.u === me || owner;

/** Text in Stücke mit erkannten Links (nur http/https), zum sicheren Anzeigen ohne HTML */
export function linkParts(t: string): { s: string; href?: string }[] {
  const out: { s: string; href?: string }[] = [];
  let last = 0;
  for (const m of t.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    const i = m.index!;
    if (i > last) out.push({ s: t.slice(last, i) });
    out.push({ s: url, href: url });
    last = i + url.length;
  }
  if (last < t.length) out.push({ s: t.slice(last) });
  return out;
}
