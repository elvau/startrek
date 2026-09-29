<script lang="ts">
  /* Reisebeobachtung am Posten: roter Pfeil nach oben (teurer geworden), grüner nach unten (günstiger gefunden) */
  import { t } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { eur } from "../calc";
  import { access, app } from "../store.svelte";
  import { hitFor, rise, saving, takeBetter } from "../watch";

  let { item }: { item: Item } = $props();
  const h = $derived(hitFor(app.trip, item));
  const up = $derived(h ? rise(h) : 0);
  const down = $derived(h ? saving(h) : 0);
</script>

{#if h && (up || down || h.err || (h.now == null && !h.best))}
  <div class="wb">
    {#if h.err}
      <span class="wb-err" title={h.err}>⚠ {t("watch.failed")}</span>
    {:else}
      {#if up}<span class="wb-up" title={t("watch.upTip")}>▲ {t("watch.up", { v: eur(up) })}</span>{/if}
      {#if h.best != null && down}
        <span class="wb-down" title={h.bestOpt?.label}>▼ {t("watch.down", { v: eur(down) })}</span>
        <span class="wb-what muted">{h.bestOpt?.label}</span>
        {#if !access.readonly}<button class="linkbtn wb-take" onclick={() => takeBetter(app.trip, item)}>{t("watch.take")}</button>{/if}
      {:else if down}
        <span class="wb-down">▼ {t("watch.down", { v: eur(down) })}</span>
      {/if}
      {#if h.now == null && !h.best}<span class="muted">{t("watch.gone")}</span>{/if}
    {/if}
  </div>
{/if}
