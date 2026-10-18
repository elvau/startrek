<script lang="ts">
  /* In der Reise (#431): gehört sie zu einem Vergleich, „Variante x von y“ und mit einem Tipp zu den anderen Varianten */
  import { i18n, t, tn } from "../i18n/index.svelte";
  import { allTrips, app, openCompare, openTrip, tripFor } from "../store.svelte";
  import { pickedOf, variantLabel } from "../variants";

  const list = $derived.by(() => {
    const id = app.trip.cmp?.id;
    if (!id) return [];
    return allTrips().map(m => ({ m, tr: m.id === app.trip.id ? app.trip : tripFor(m.id) })).filter(x => x.tr?.cmp?.id === id).map(x => ({ id: x.m.id, label: variantLabel(x.tr!), cmp: x.tr!.cmp }))
      // feste Reihenfolge wie in der Kachel auf der Startseite
      .sort((a, b) => a.label.localeCompare(b.label, i18n.lang, { numeric: true }));
  });
  const i = $derived(list.findIndex(x => x.id === app.trip.id));
  const pick = $derived(pickedOf(list));
</script>

{#if list.length > 1 && i >= 0}
  <nav class="vbar" aria-label={t("vbar.aria", { title: app.trip.cmp!.title })}>
    <span class="vb-t">{#if pick?.id === app.trip.id}✓ {tn("vbar.picked", list.length - 1)}{:else}⇆ {t("vbar.of", { i: i + 1, n: list.length, title: app.trip.cmp!.title })}{/if}</span>
    <span class="chips">
      {#each list as v (v.id)}
        <button class="chip sm" class:on={v.id === app.trip.id} class:picked={pick?.id === v.id} aria-current={v.id === app.trip.id ? "page" : undefined} onclick={() => openTrip(v.id, "Variante")}>{pick?.id === v.id ? "✓ " : ""}{v.label}</button>
      {/each}
    </span>
    <button class="linkbtn vb-cmp" onclick={() => openCompare(app.trip.cmp!.id)}>{t("home.compare")} →</button>
  </nav>
{/if}

<style>
  .vbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 8px; font-size: 13px; }
  .vb-t { font-weight: 700; color: var(--a); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .vb-cmp { padding: 0; font-weight: 700; }
</style>
