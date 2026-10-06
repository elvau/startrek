<script lang="ts">
  /* Aufteilung eines Postens auf die Familien (#229): wer trägt wie viel und warum (Personen, Nächte) */
  import { t, tn } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { app, calc } from "../store.svelte";
  import { eur, itemShares } from "../calc";

  let { item }: { item: Item } = $props();
  const shares = $derived(itemShares(app.trip, calc.T.items[item.id]));
</script>

{#if shares.length > 1}
  <div class="isplit small">
    <span class="muted">{t("split.byFamily")}</span>
    <ul>
      {#each shares as s (s.hh)}
        <li><b>{s.hh}</b> <span class="muted">{[tn("n.persons", s.persons), s.of ? (s.nights === s.of ? tn("n.nights", s.of) : t("split.nightsOf", { a: s.nights ?? 0, b: s.of })) : ""].filter(Boolean).join(" · ")}</span> <span class="num">{eur(s.v)}</span></li>
      {/each}
    </ul>
  </div>
{/if}

<style>
  .isplit { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; margin: 0 22px 12px; padding-top: 8px; border-top: 1px dashed var(--line); }
  .isplit ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .isplit .num { font-weight: 600; }
</style>
