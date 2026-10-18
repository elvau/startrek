<script lang="ts">
  /* In der Reise (#431): gehört sie zu einem Vergleich, „Variante x von y“ und mit einem Tipp zu den anderen Varianten */
  import { t } from "../i18n/index.svelte";
  import { allTrips, app, openTrip, tripFor } from "../store.svelte";
  import { variantLabel } from "../variants";

  const list = $derived.by(() => {
    const id = app.trip.cmp?.id;
    if (!id) return [];
    return allTrips().map(m => ({ m, tr: m.id === app.trip.id ? app.trip : tripFor(m.id) })).filter(x => x.tr?.cmp?.id === id).map(x => ({ id: x.m.id, label: variantLabel(x.tr!) }));
  });
  const i = $derived(list.findIndex(x => x.id === app.trip.id));
</script>

{#if list.length > 1 && i >= 0}
  <nav class="vbar" aria-label={t("vbar.aria", { title: app.trip.cmp!.title })}>
    <span class="vb-t">⇆ {t("vbar.of", { i: i + 1, n: list.length, title: app.trip.cmp!.title })}</span>
    <span class="chips">
      {#each list as v (v.id)}
        <button class="chip sm" class:on={v.id === app.trip.id} aria-current={v.id === app.trip.id ? "page" : undefined} onclick={() => openTrip(v.id, "Variante")}>{v.label}</button>
      {/each}
    </span>
  </nav>
{/if}

<style>
  .vbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px; font-size: 13px; }
  .vb-t { font-weight: 700; color: var(--a); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
</style>
