<script lang="ts">
  /*
   * Wer entscheidet mit (#567): ein Kreis für „Termin finden“ und alle Abstimmungen, z. B. nur der Kegelclub, nicht die
   * Begleitung. Schnellwahl nach Herkunftsgruppe, einzelne Personen an- und abwählen. Wer nicht mitentscheidet, reist
   * und zahlt weiter mit, trägt aber keine Termine ein und stimmt nicht ab. Kinder entscheiden nie mit.
   */
  import { t } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { circles, grownUps, setDeciders, voters } from "../together";

  const trip = $derived(app.trip);
  const all = $derived(grownUps(trip));
  const inIds = $derived(new Set(voters(trip).map(x => x.id)));
  const groups = $derived(circles(trip));
  const label = (key: string) => key || t("dec.others");
  let open = $state(false);
  const same = (ids: string[]) => ids.length === inIds.size && ids.every(id => inIds.has(id));
  const summary = $derived(!trip.deciders?.length ? t("dec.all", { n: all.length })
    : groups.find(c => same(c.ids)) ? `${label(groups.find(c => same(c.ids))!.key)} · ${inIds.size}` : t("dec.some", { a: inIds.size, n: all.length }));
  function toggle(id: string) {
    const next = inIds.has(id) ? [...inIds].filter(x => x !== id) : [...inIds, id];
    if (next.length) setDeciders(trip, next);
  }
</script>

{#if all.length > 2}
  <div class="dec">
    <div class="dec-h">
      <span class="small"><b>{t("dec.title")}</b> <span class="muted dec-sum">{summary}</span></span>
      {#if !access.readonly}<button class="linkbtn small dec-edit" onclick={() => (open = !open)} aria-expanded={open}>{open ? t("done") : t("dec.change")}</button>{/if}
    </div>
    {#if open}
      <p class="muted small">{t("dec.lead")}</p>
      <div class="chips dec-quick">
        {#each groups as c (c.key)}
          <button class="chip" class:on={same(c.ids)} aria-pressed={same(c.ids)} onclick={() => setDeciders(trip, c.ids)}>{label(c.key)} · {c.ids.length}</button>
        {/each}
        <button class="chip" class:on={!trip.deciders?.length} aria-pressed={!trip.deciders?.length} onclick={() => setDeciders(trip, [])}>{t("dec.allBtn", { n: all.length })}</button>
      </div>
      <div class="chips dec-people">
        {#each all as x (x.id)}
          <button class="chip sm" class:on={inIds.has(x.id)} aria-pressed={inIds.has(x.id)} onclick={() => toggle(x.id)}>{x.name}</button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .dec { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); }
  .dec-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .dec p { margin: 0; }
  .dec-edit { padding: 0; }
  .dec-people .chip:not(.on) { opacity: .6; border-style: dashed; }
</style>
