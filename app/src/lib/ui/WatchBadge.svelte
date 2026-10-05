<script lang="ts">
  /*
   * Preise am Posten: Änderung seit der letzten Prüfung (▲ teurer, ▼ günstiger geworden),
   * dazu „Günstigeres suchen“ nur für diesen Posten, mit Übernehmen.
   */
  import { locale, t } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { eur } from "../calc";
  import { access, app } from "../store.svelte";
  import { change, hitFor, saving, takeBetter, watchOption } from "../watch";
  import { cheaperRun, runCheaper } from "../watch.svelte";
  import { FLIGHTS_URL } from "../flights/app";

  let { item }: { item: Item } = $props();
  const can = $derived(!!watchOption(item, app.trip));
  const h = $derived(hitFor(app.trip, item));
  const d = $derived(h ? change(h) : 0);
  const down = $derived(h ? saving(h) : 0);
  const gone = $derived(!!h && !h.err && h.now == null && !!app.trip.watch?.at);
  const busy = $derived(!!cheaperRun[item.id]);
  // geprüft und gleich geblieben; wann zuletzt geprüft (je Posten sichtbar)
  const same = $derived(!!h && !h.err && h.now != null && d === 0 && !!app.trip.watch?.at && h.best == null && !h.noBetter);
  const at = $derived(h && app.trip.watch?.at ? new Date(app.trip.watch.at).toLocaleString(locale(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
</script>

{#if can}
  <div class="wb">
    {#if h?.err}
      <span class="wb-err" title={h.err}>⚠ {t("watch.failed")}</span>
    {:else}
      {#if d > 0}<span class="wb-up" title={t("watch.upTip")}>▲ {t("watch.up", { v: eur(d) })}</span>
      {:else if d < 0}<span class="wb-down" title={t("watch.downTip")}>▼ {t("watch.cheaperNow", { v: eur(-d) })}</span>
      {:else if gone}<span class="wb-gone">{t("watch.gone")}</span>
      {:else if same}<span class="wb-same">= {t("watch.unchanged")}</span>{/if}
      {#if at}<small class="muted wb-at">{t("watch.at", { d: at })}</small>{/if}
      {#if h?.best != null && down}
        <span class="wb-down wb-best">▼ {t("watch.down", { v: eur(down) })}</span>
        <span class="wb-what muted" title={h.bestOpt?.label}>{h.bestOpt?.label} · {eur(h.best)}</span>
        {#if !access.readonly}<button class="linkbtn wb-take" onclick={() => takeBetter(app.trip, item)}>{t("watch.take")}</button>{/if}
      {:else if h?.noBetter}
        <span class="muted wb-none">{t("watch.nothing")}</span>
      {/if}
    {/if}
    {#if FLIGHTS_URL && !access.readonly}
      <button class="linkbtn wb-cheaper" disabled={busy} onclick={e => { e.stopPropagation(); runCheaper(item.id); }}>
        <span aria-hidden="true" class:spin={busy}>🔎</span> {busy ? t("watch.searching") : t("watch.findCheaper")}
      </button>
    {/if}
  </div>
{/if}

<style>
  .wb-same { font-weight: 700; color: var(--ink-2); border-radius: 99px; padding: 2px 10px; background: var(--paper-2); white-space: nowrap; }
  .wb-gone { font-weight: 700; color: var(--warn); }
</style>
