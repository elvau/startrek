<script lang="ts">
  /* Reisebeobachtung: alle Flüge und Unterkünfte aus der Suche nachsuchen, unten das Potenzial für diese Reise */
  import { t } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import { access, app } from "../store.svelte";
  import { potential, rises, watchable } from "../watch";
  import { runWatch, watchRun } from "../watch.svelte";
  import { FLIGHTS_URL } from "../flights/app";

  const n = $derived(watchable(app.trip).length);
  const pot = $derived(potential(app.trip));
  const up = $derived(rises(app.trip));
  const w = $derived(app.trip.watch);
  const at = $derived(w ? new Date(w.at).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
</script>

<section class="watch card" id="watch">
  <div class="watch-head">
    <div>
      <h3>🔭 {t("watch.title")}</h3>
      <p class="muted small">{n ? t("watch.lead") : t("watch.none")}</p>
    </div>
    {#if n && FLIGHTS_URL && !access.readonly}
      <button class="btn primary watch-run" disabled={watchRun.busy} onclick={runWatch}>
        {watchRun.busy ? t("watch.checking", { n: watchRun.done, of: watchRun.of }) : `🔄 ${t("watch.check")}`}
      </button>
    {/if}
  </div>
  {#if w && n}
    <div class="watch-sum">
      <div class="watch-pot" class:good={pot > 0}>
        <small>{t("watch.potential")}</small>
        <b>{pot > 0 ? `▼ ${eur(pot)}` : t("watch.nothing")}</b>
      </div>
      {#if up > 0}<div class="watch-rise"><small>{t("watch.rise")}</small><b>▲ {eur(up)}</b></div>{/if}
      <p class="muted small watch-at">{t("watch.at", { d: at })}</p>
    </div>
  {/if}
  {#if watchRun.err}<p class="banner err">{watchRun.err}</p>{/if}
</section>
