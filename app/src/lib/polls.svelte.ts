/*
 * Abstimmen in der App (#432): wer man ist und wo die Stimme liegt. Geteilte Reise: je Konto ein eigenes Dokument
 * (cloudVotes), Person aus „Wer bist du?“ (#435); Reise nur auf dem Gerät: in der Reise, Person über „Ich bin …“.
 */
import { app } from "./store.svelte";
import { cloud, cloudTrip, cloudVotes, isCloud, saveMyVotes } from "./cloud/cloud.svelte";
import { travelerOf } from "./claims";
import { mergedVotes, nextVote, VETO, voters, type Poll, type VetoWhy } from "./together";
import { vetoedIds, vetoNotes, type VetoNote } from "./without";
import { geo } from "./geo/geo.svelte";

/** Person auf diesem Gerät für Reisen ohne Konto (je Reise gemerkt) */
export const localMe = $state<Record<string, string>>({});
const KEY = (id: string) => `rk2-me:${id}`;
export function getLocalMe(tripId: string): string {
  if (localMe[tripId] != null) return localMe[tripId];
  let v = "";
  try { v = localStorage.getItem(KEY(tripId)) || ""; } catch { /* egal */ }
  return v;
}
export function setLocalMe(tripId: string, id: string) {
  localMe[tripId] = id;
  try { localStorage.setItem(KEY(tripId), id); } catch { /* egal */ }
}

/** geteilte Reise: Stimmen kommen aus dem Konto */
export const sharedVoting = () => isCloud(app.trip.id) && !!cloud.user;

/** Schlüssel einer Person in den Stimmen: Reisende-Kennung (über „Wer bist du?“), sonst Konto */
function keyOfUid(uid: string): string {
  const ct = cloudTrip(app.trip.id);
  return travelerOf(app.trip, uid, ct?.claims)?.id ?? `u:${uid}`;
}

/** wer ich beim Abstimmen bin (Reisende-Kennung); geteilte Reise ohne Zuordnung: null */
export function myVoter(): string | null {
  if (sharedVoting()) {
    const t = travelerOf(app.trip, cloud.user!.uid, cloudTrip(app.trip.id)?.claims);
    return t?.id ?? null;
  }
  const v = getLocalMe(app.trip.id), people = voters(app.trip);
  return people.some(x => x.id === v) ? v : people[0]?.id ?? null;
}

/** Stimmen einer Abstimmung aus dem Konto, je Person (Reisende-Kennung bzw. „u:Konto“) */
export function remoteVotes(p: Poll): Record<string, Record<string, number>> {
  if (!sharedVoting() || cloudVotes.trip !== app.trip.id) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [uid, v] of Object.entries(cloudVotes.byUid)) if (v[p.id] && Object.keys(v[p.id]).length) out[keyOfUid(uid)] = v[p.id];
  return out;
}
/** alle Abstimmungen der Reise: Stimmen aus dem Konto je Abstimmung */
export function remoteAll(): Record<string, Record<string, Record<string, number>>> {
  return Object.fromEntries((app.trip.polls || []).map(p => [p.id, remoteVotes(p)]));
}

/** Grund und „mit Familie“ zu „Ohne mich“ (#439), je Person: aus der Reise und dem Konto */
export function whyOf(p: Poll): Record<string, Record<string, VetoWhy>> {
  const out: Record<string, Record<string, VetoWhy>> = { ...(p.why || {}) };
  if (sharedVoting() && cloudVotes.trip === app.trip.id)
    for (const [uid, w] of Object.entries(cloudVotes.whyByUid)) if (w[p.id] && Object.keys(w[p.id]).length) out[keyOfUid(uid)] = w[p.id];
  return out;
}
/** mein Grund zu „Ohne mich“ bei einer Möglichkeit */
export function myWhy(p: Poll, option: string): VetoWhy | undefined {
  if (sharedVoting()) return cloudVotes.whyByUid[cloud.user!.uid]?.[p.id]?.[option];
  const me = myVoter();
  return me ? p.why?.[me]?.[option] : undefined;
}

/** meine Stimme in einer Abstimmung */
export function myVote(p: Poll): Record<string, number> | undefined {
  if (sharedVoting()) return cloudVotes.byUid[cloud.user!.uid]?.[p.id];
  const me = myVoter();
  return me ? (p.votes[me] as Record<string, number> | undefined) : undefined;
}

/** abstimmen (neue Arten): geteilte Reise ins eigene Dokument, sonst in die Reise */
export async function cast(p: Poll, option: string, act: "for" | "veto" | "more" | "less", why?: VetoWhy) {
  const next = nextVote(p, myVote(p), option, act);
  // Grund nur, solange „Ohne mich“ gilt
  const fix = (w: Record<string, VetoWhy> | undefined) => {
    const m = Object.fromEntries(Object.entries(w || {}).filter(([k]) => next[k] === VETO));
    if (next[option] === VETO && why) {
      const r = why.r?.trim().slice(0, 200);
      m[option] = { ...(r ? { r } : {}), ...(why.f ? { f: true } : {}) };
    }
    return m;
  };
  if (sharedVoting()) {
    // nur Abstimmungen, die es noch gibt (gelöschte fallen beim nächsten Abstimmen weg)
    const ids = new Set((app.trip.polls || []).map(x => x.id));
    const keep = <T>(m: Record<string, T> | undefined) => Object.fromEntries(Object.entries(m || {}).filter(([k]) => ids.has(k)));
    const all = keep(cloudVotes.byUid[cloud.user!.uid]), whys = keep(cloudVotes.whyByUid[cloud.user!.uid]);
    if (Object.keys(next).length) all[p.id] = next; else delete all[p.id];
    const w = fix(whys[p.id]);
    if (Object.keys(w).length) whys[p.id] = w; else delete whys[p.id];
    ackNotes(p);
    await saveMyVotes(app.trip.id, all, whys);
    return;
  }
  const me = myVoter();
  if (!me) return;
  ackNotes(p);
  if (Object.keys(next).length) p.votes[me] = next; else delete p.votes[me];
  const w = fix(p.why?.[me]);
  if (Object.keys(w).length) (p.why ||= {})[me] = w;
  else if (p.why) { delete p.why[me]; if (!Object.keys(p.why).length) delete p.why; }
}

/** „Wer bist du?“ von Hand öffnen (z. B. zum Abstimmen) */
export const whoAsk = $state({ open: false });

/* ---------- Info an alle, die schon abgestimmt haben (#439) ---------- */

/** zuletzt gesehen, wer je Möglichkeit nicht dabei wäre (auf dem Gerät, je Reise und Abstimmung) */
const SEEN = (trip: string) => `rk2-veto-seen:${trip}`;
const seenCache: Record<string, Record<string, Record<string, string[]>>> = {};
/** zählt beim Merken hoch (Lesen im $derived darf keinen Zustand schreiben, daher Ablage außerhalb) */
const seenVer = $state({ n: 0 });
function seenOf(trip: string): Record<string, Record<string, string[]>> {
  void seenVer.n;
  if (!seenCache[trip]) {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(SEEN(trip)) || "{}"); } catch { /* egal */ }
    seenCache[trip] = v;
  }
  return seenCache[trip];
}
/** wer je Möglichkeit gerade nicht dabei wäre */
export function vetoesNow(p: Poll): Record<string, string[]> {
  const v = mergedVotes(p, remoteVotes(p)), w = whyOf(p);
  return Object.fromEntries(p.options.map(o => [o.id, vetoedIds(app.trip, v, o.id, w)]));
}
/** Änderungen für mich: nur wenn ich in der Abstimmung schon abgestimmt habe; eigene „Ohne mich“ zählen nicht */
export function myNotes(p: Poll): VetoNote[] {
  const mine = myVote(p), me = myVoter();
  if (!mine || !Object.keys(mine).length) return [];
  const now = vetoesNow(p), seen = seenOf(app.trip.id)[p.id] || {};
  const not = (ids: string[]) => ids.filter(x => x !== me);
  const n = Object.fromEntries(Object.entries(now).map(([k, v]) => [k, not(v)]));
  const s = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, not(v)]));
  return vetoNotes(app.trip, p, n, s, geo);
}
/** gelesen bzw. beim Abstimmen: aktuellen Stand merken */
export function ackNotes(p: Poll) {
  const all = seenOf(app.trip.id);
  all[p.id] = vetoesNow(p);
  try { localStorage.setItem(SEEN(app.trip.id), JSON.stringify(all)); } catch { /* egal */ }
  seenVer.n++;
}
