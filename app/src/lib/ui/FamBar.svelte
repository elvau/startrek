<script lang="ts">
  /*
   * Familie stimmt mit (#585), oben in „Gemeinsam planen“: „Ich stimme ab und trage ein: selbst / wie Anna“ für die
   * ganze Reise; nach dem Verknüpfen einmal der Hinweis, dass die Familie schon für einen abgestimmt hat.
   */
  import { t } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { saveMySelf } from "../cloud/cloud.svelte";
  import { dropMyVote, myFam, myVote, pollStand, takeFamilyVotes } from "../polls.svelte";
  import { likeable, undecided } from "../famvote";
  import { availStand, mergedAvail } from "../self";

  const trip = $derived(app.trip);
  const f = $derived(myFam());
  const like = $derived(f ? likeable(trip, f.me.id, f.acct) : []);
  const nameOf = (id: string) => trip.travelers.find(x => x.id === id)?.name || "?";
  // wer bisher für mich zählt (Abstimmungen, sonst Termine)
  const dStand = $derived(f && trip.avail ? availStand(trip, f.selfs, f.claims) : {});
  const from = $derived.by(() => {
    if (!f) return "";
    for (const p of trip.polls || []) { const s = pollStand(p)[f.me.id]; if (s) return s; }
    return dStand[f.me.id] || "";
  });
  const ask = $derived(!!f && undecided(f.acct[f.me.id]) && !!from);
  let busy = $state(false);
  async function run(fn: () => Promise<unknown>) { busy = true; try { await fn(); } finally { busy = false; } }
  /** übernehmen: Stimmen und Termine der Familie als eigene, danach selbst */
  const take = () => run(async () => {
    await takeFamilyVotes();
    const a = f && dStand[f.me.id] ? mergedAvail(trip, f.selfs, f.claims)[f.me.id] : undefined;
    await saveMySelf(trip.id, { ...(a ? { a } : {}), d: true });
  });
  /** „wie …“: eigene Angaben verwerfen (nach Rückfrage), dann folgen; „selbst“: entschieden */
  function setLike(v: string) {
    if (!f) return;
    if (!v) { void run(() => saveMySelf(trip.id, { l: undefined, d: true })); return; }
    const ownPolls = (trip.polls || []).filter(p => Object.keys(myVote(p) || {}).length);
    const ownDays = !!f.cfg.a;
    if ((ownPolls.length || ownDays) && !confirm(t("fam.dropQ", { name: nameOf(v) }))) return;
    void run(async () => {
      for (const p of ownPolls) await dropMyVote(p);
      await saveMySelf(trip.id, { l: v, d: undefined, ...(ownDays ? { a: undefined } : {}) });
    });
  }
</script>

{#if f && ask}
  <div class="fb-ask" role="status">
    <p>{t("fam.claimed", { name: nameOf(from) })}</p>
    <p class="fb-acts">
      <button class="btn sm primary fb-keep" disabled={busy} onclick={() => run(() => saveMySelf(trip.id, { l: from }))}>{t("fam.keep", { name: nameOf(from) })}</button>
      <button class="btn sm fb-take" disabled={busy} onclick={take}>{t("fam.take")}</button>
      <button class="btn sm fb-fresh" disabled={busy} onclick={() => run(() => saveMySelf(trip.id, { d: true }))}>{t("fam.fresh")}</button>
    </p>
  </div>
{/if}
{#if f && like.length}
  <label class="f fb-like small">{t("fam.mode")}
    <select value={f.cfg.l && like.some(x => x.id === f.cfg.l) ? f.cfg.l : ""} disabled={busy} onchange={e => setLike(e.currentTarget.value)}>
      <option value="">{t("fam.self")}</option>
      {#each like as x (x.id)}<option value={x.id}>{t("fam.like", { name: x.name })}</option>{/each}
    </select>
  </label>
{/if}

<style>
  .fb-ask { display: grid; gap: 6px; padding: 10px 12px; border-radius: 10px; background: var(--warn-soft); }
  .fb-ask p { margin: 0; }
  .fb-acts { display: flex; flex-wrap: wrap; gap: 6px; }
  .fb-like { max-width: 320px; }
</style>
