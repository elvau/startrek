/*
 * Abstimmen in der App (#432): wer man ist und wo die Stimme liegt. Geteilte Reise: je Konto ein eigenes Dokument
 * (cloudVotes), Person aus „Wer bist du?“ (#435); Reise nur auf dem Gerät: in der Reise, Person über „Ich bin …“.
 */
import { app, tripFor } from "./store.svelte";
import type { Trip } from "./model";
import { cloud, cloudSelf, cloudTrip, cloudVotes, isCloud, saveMyVotes } from "./cloud/cloud.svelte";
import { travelerOf } from "./claims";
import { mergedVotes, nextVote, VETO, voters, type Poll, type VetoWhy } from "./together";
import { vetoedIds, vetoNotes, type VetoNote } from "./without";
import { geo } from "./geo/geo.svelte";
import { stand } from "./famvote";
import { famAccounts } from "./self";

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

/** Reise, an der eine Möglichkeit durchgerechnet wird: bei Varianten (#432) die Variante selbst, sonst die offene Reise */
export function tripForOption(p: Poll, option: string): Trip {
  const id = p.kind === "variants" ? p.options.find(o => o.id === option)?.tripId : undefined;
  return (id && id !== app.trip.id && tripFor(id)) || app.trip;
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

/** Stimmen einer Abstimmung aus den Konten, ohne Familie */
function ownRemote(p: Poll): Record<string, Record<string, number>> {
  if (!sharedVoting() || cloudVotes.trip !== app.trip.id) return {};
  const out: Record<string, Record<string, number>> = {};
  for (const [uid, v] of Object.entries(cloudVotes.byUid)) if (v[p.id] && Object.keys(v[p.id]).length) out[keyOfUid(uid)] = v[p.id];
  return out;
}
/** Familie stimmt mit (#585): wessen Stimme für wen gilt (Ziel → Quelle), nur in geteilten Reisen */
export function pollStand(p: Poll): Record<string, string> {
  if (!sharedVoting() || cloudVotes.trip !== app.trip.id) return {};
  const trip = app.trip, claims = cloudTrip(trip.id)?.claims || {};
  const acct = famAccounts(trip, cloudSelf.trip === trip.id ? cloudSelf.byUid : {}, claims);
  const v = mergedVotes(p, ownRemote(p));
  return stand(trip, acct, id => !!v[id] && Object.keys(v[id]).length > 0, id => (acct[id] && cloudVotes.atByUid[acct[id].uid]) || 0);
}
/** Stimmen einer Abstimmung aus dem Konto, je Person (Reisende-Kennung bzw. „u:Konto“), mit Stimmen der Familie (#585) */
export function remoteVotes(p: Poll): Record<string, Record<string, number>> {
  const out = ownRemote(p), v = mergedVotes(p, out);
  for (const [t, s] of Object.entries(pollStand(p))) out[t] = v[s];
  return out;
}
/** alle Abstimmungen der Reise: Stimmen aus dem Konto je Abstimmung */
export function remoteAll(): Record<string, Record<string, Record<string, number>>> {
  return Object.fromEntries((app.trip.polls || []).map(p => [p.id, remoteVotes(p)]));
}

/** Grund und „mit Familie“ zu „Ohne mich“ (#439), je Person: aus der Reise und dem Konto; Familie wie ihre Quelle (#585) */
export function whyOf(p: Poll): Record<string, Record<string, VetoWhy>> {
  const out: Record<string, Record<string, VetoWhy>> = { ...(p.why || {}) };
  if (sharedVoting() && cloudVotes.trip === app.trip.id) {
    for (const [uid, w] of Object.entries(cloudVotes.whyByUid)) if (w[p.id] && Object.keys(w[p.id]).length) out[keyOfUid(uid)] = w[p.id];
    for (const [t, s] of Object.entries(pollStand(p))) { if (out[s]) out[t] = out[s]; else delete out[t]; }
  }
  return out;
}
/** mein Grund zu „Ohne mich“ bei einer Möglichkeit */
export function myWhy(p: Poll, option: string): VetoWhy | undefined {
  if (sharedVoting()) return cloudVotes.whyByUid[cloud.user!.uid]?.[p.id]?.[option];
  const me = myVoter();
  return me ? p.why?.[me]?.[option] : undefined;
}

/** wie meine Stimme zählt: eigene, sonst die der Familie (#585) */
export function myEffective(p: Poll): Record<string, number> | undefined {
  const own = myVote(p), me = myVoter();
  return own && Object.keys(own).length ? own : me ? remoteVotes(p)[me] : undefined;
}
/** von wem meine Stimme in einer Abstimmung kommt (Familie, #585) */
export function myProxy(p: Poll): string | undefined {
  const me = myVoter();
  return me ? pollStand(p)[me] : undefined;
}

/** meine eigene Stimme in einer Abstimmung */
export function myVote(p: Poll): Record<string, number> | undefined {
  if (sharedVoting()) return cloudVotes.byUid[cloud.user!.uid]?.[p.id];
  const me = myVoter();
  return me ? (p.votes[me] as Record<string, number> | undefined) : undefined;
}

/** abstimmen (neue Arten): geteilte Reise ins eigene Dokument, sonst in die Reise */
export async function cast(p: Poll, option: string, act: "for" | "veto" | "more" | "less", why?: VetoWhy) {
  // stimmt die Familie für mich (#585): von ihrer Stimme ausgehen
  const from = myProxy(p), who = myVoter();
  const next = nextVote(p, myEffective(p), option, act);
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
    const w = fix(from && who ? whyOf(p)[who] : whys[p.id]);
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

/** „wieder wie …“ (#585): eigene Stimme einer Abstimmung zurücknehmen, dann zählt wieder die Familie */
export async function dropMyVote(p: Poll) {
  if (!sharedVoting()) return;
  const all = { ...(cloudVotes.byUid[cloud.user!.uid] || {}) }, whys = { ...(cloudVotes.whyByUid[cloud.user!.uid] || {}) };
  delete all[p.id]; delete whys[p.id];
  await saveMyVotes(app.trip.id, all, whys);
}
/** Stimmen der Familie als eigene übernehmen (nach dem Verknüpfen, #585); nur Abstimmungen, in denen sie für mich zählen */
export async function takeFamilyVotes() {
  if (!sharedVoting()) return;
  const me = myVoter();
  if (!me) return;
  const all = { ...(cloudVotes.byUid[cloud.user!.uid] || {}) }, whys = { ...(cloudVotes.whyByUid[cloud.user!.uid] || {}) };
  let n = 0;
  for (const p of app.trip.polls || []) {
    if (!pollStand(p)[me]) continue;
    const v = remoteVotes(p)[me], w = whyOf(p)[me];
    if (v && Object.keys(v).length) { all[p.id] = { ...v }; n++; }
    if (w && Object.keys(w).length) whys[p.id] = { ...w };
  }
  if (n) await saveMyVotes(app.trip.id, all, whys);
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
  return vetoNotes(app.trip, p, n, s, geo, o => tripForOption(p, o));
}
/** gelesen bzw. beim Abstimmen: aktuellen Stand merken */
export function ackNotes(p: Poll) {
  const all = seenOf(app.trip.id);
  all[p.id] = vetoesNow(p);
  try { localStorage.setItem(SEEN(app.trip.id), JSON.stringify(all)); } catch { /* egal */ }
  seenVer.n++;
}

/* ---------- Familie stimmt mit (#585) ---------- */

/** Konten, eigene Person und eigene Einstellungen in der offenen geteilten Reise; ohne Konto-Person null */
export function myFam() {
  if (!sharedVoting()) return null;
  const trip = app.trip, claims = cloudTrip(trip.id)?.claims || {}, selfs = cloudSelf.trip === trip.id ? cloudSelf.byUid : {};
  const me = travelerOf(trip, cloud.user!.uid, claims);
  if (!me) return null;
  return { me, acct: famAccounts(trip, selfs, claims), cfg: selfs[cloud.user!.uid] || {}, selfs, claims };
}
