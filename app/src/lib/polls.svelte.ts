/*
 * Abstimmen in der App (#432): wer man ist und wo die Stimme liegt. Geteilte Reise: je Konto ein eigenes Dokument
 * (cloudVotes), Person aus „Wer bist du?“ (#435); Reise nur auf dem Gerät: in der Reise, Person über „Ich bin …“.
 */
import { app } from "./store.svelte";
import { cloud, cloudTrip, cloudVotes, isCloud, saveMyVotes } from "./cloud/cloud.svelte";
import { travelerOf } from "./claims";
import { nextVote, voters, type Poll } from "./together";

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

/** meine Stimme in einer Abstimmung */
export function myVote(p: Poll): Record<string, number> | undefined {
  if (sharedVoting()) return cloudVotes.byUid[cloud.user!.uid]?.[p.id];
  const me = myVoter();
  return me ? (p.votes[me] as Record<string, number> | undefined) : undefined;
}

/** abstimmen (neue Arten): geteilte Reise ins eigene Dokument, sonst in die Reise */
export async function cast(p: Poll, option: string, act: "for" | "veto" | "more" | "less") {
  const next = nextVote(p, myVote(p), option, act);
  if (sharedVoting()) {
    // nur Abstimmungen, die es noch gibt (gelöschte fallen beim nächsten Abstimmen weg)
    const ids = new Set((app.trip.polls || []).map(x => x.id));
    const all = Object.fromEntries(Object.entries(cloudVotes.byUid[cloud.user!.uid] || {}).filter(([k]) => ids.has(k)));
    if (Object.keys(next).length) all[p.id] = next; else delete all[p.id];
    await saveMyVotes(app.trip.id, all);
    return;
  }
  const me = myVoter();
  if (!me) return;
  if (Object.keys(next).length) p.votes[me] = next; else delete p.votes[me];
}

/** „Wer bist du?“ von Hand öffnen (z. B. zum Abstimmen) */
export const whoAsk = $state({ open: false });
