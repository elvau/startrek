<script lang="ts">
  /*
   * Familienvorschläge (#571): Wer eine Person übernommen hat, kann die eigene Familie aus dem Konto vorschlagen
   * (bleibt, neu, nicht dabei). Wer bearbeiten darf, übernimmt oder lehnt ab; erst dann ändert sich die Reise.
   */
  import { t } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { cloud, cloudSelf, cloudTrip, hasAccount, saveMySelf } from "../cloud/cloud.svelte";
  import { dir } from "../directory.svelte";
  import { travelerOf } from "../claims";
  import { acceptFamily, declineFamily, famChanges, famDiff, familyFromDir, famProposals, type FamDiff } from "../self";

  const ct = $derived(cloudTrip(app.trip.id));
  const claims = $derived(ct?.claims || {});
  const selfs = $derived(cloudSelf.trip === app.trip.id ? cloudSelf.byUid : {});
  const myUid = $derived(ct && cloud.user ? cloud.user.uid : "");
  const me = $derived(myUid ? travelerOf(app.trip, myUid, claims) : undefined);
  const proposals = $derived(access.readonly ? [] : famProposals(app.trip, selfs, claims));
  const day = $derived(app.trip.from || new Date().toISOString().slice(0, 10));
  const fam = $derived(me && hasAccount() ? familyFromDir(dir, day) : []);
  const mineDiff = $derived(me && fam.length ? famDiff(app.trip, me, fam) : null);
  const myF = $derived(myUid ? selfs[myUid]?.f : undefined);
  const waiting = $derived(!!(me && myF && app.trip.famDone?.[myUid] !== myF.at && famChanges(famDiff(app.trip, me, myF.m))));
  let busy = $state(false);

  const ages = (n: string, age?: number | null) => (age != null ? `${n} (${age})` : n);
  function parts(d: FamDiff): string[] {
    return [
      d.keep.length ? t("self.famKeep", { list: d.keep.map(k => ages(k.t.name, k.m.age ?? k.t.age)).join(", ") }) : "",
      d.add.length ? t("self.famAdd", { list: d.add.map(m => ages(m.n, m.age)).join(", ") }) : "",
      d.drop.length ? t("self.famDrop", { list: d.drop.map(x => x.name).join(", ") }) : ""
    ].filter(Boolean);
  }
  async function propose() {
    busy = true;
    try { await saveMySelf(app.trip.id, { f: { m: fam, at: new Date().toISOString() } }); } finally { busy = false; }
  }
</script>

{#each proposals as p (p.uid)}
  <div class="sf sf-prop">
    <b>{t("self.famFrom", { name: p.me.name })}</b>
    <span class="muted small">{parts(p.diff).join(" · ")}</span>
    <span class="fu-acts">
      <button class="btn sm primary sf-accept" onclick={() => acceptFamily(app.trip, p)}>{t("self.famAccept")}</button>
      <button class="btn sm sf-decline" onclick={() => declineFamily(app.trip, p)}>{t("self.famDecline")}</button>
    </span>
  </div>
{/each}
{#if me && waiting}
  <p class="sf small muted sf-wait">⏳ {t("self.famWait")}</p>
{:else if me && mineDiff && famChanges(mineDiff)}
  <div class="sf">
    <span class="small">{t("self.famHint")} <span class="muted">{parts(mineDiff).join(" · ")}</span></span>
    <button class="btn sm sf-propose" disabled={busy} onclick={propose}>{t("self.famPropose")}</button>
  </div>
{/if}

<style>
  .sf { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 12px; margin: 0 0 8px; }
  .sf-prop { border-style: solid; border-color: var(--warn); background: var(--warn-soft); }
  .sf .btn { align-self: flex-start; }
  p.sf { margin: 0 0 8px; }
</style>
