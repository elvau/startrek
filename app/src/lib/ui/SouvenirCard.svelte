<script lang="ts">
  /* Souvenirs (#421): Betrag pro Person aus den Vorlieben oder für diese Reise; Posten „Souvenirs“ unter Sonstiges */
  import { t } from "../i18n/index.svelte";
  import { access, app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { dir } from "../directory.svelte";
  import { prefsFor } from "../prefs";
  import { souvenirRate, syncSouvenir } from "../souvenir";

  const prefs = $derived(prefsFor(app.trip, dir));
  // Posten nachführen, sobald sich Betrag, Vorlieben oder Personen ändern
  $effect(() => { if (!access.readonly) syncSouvenir(app.trip, prefs); });

  const on = $derived(!!app.trip.souvenir?.on);
  const rate = $derived(souvenirRate(app.trip, prefs));
  const it = $derived(app.trip.items.find(i => i.auto === "souvenir"));
  const sum = $derived(it && calc.T.items[it.id]?.counts ? calc.T.items[it.id].net : 0);

  const setOn = (v: boolean) => (app.trip.souvenir = { ...(app.trip.souvenir || {}), on: v });
  function step(d: number) { app.trip.souvenir = { ...(app.trip.souvenir || {}), eur: Math.max(0, Math.min(500, rate.eur + d)) }; }
  function reset() { const s = { ...(app.trip.souvenir || {}) }; delete s.eur; app.trip.souvenir = s; }
</script>

<div class="plan souv">
  <div class="plan-h"><h3>{t("souv.title")}</h3>{#if on}<span class="muted">{eur(sum)}</span>{/if}</div>
  {#if !on}
    <p class="muted">{t("souv.lead")}</p>
    {#if !access.readonly}<div><button class="btn primary sm souv-on" onclick={() => setOn(true)}>{t("souv.on")}</button></div>{/if}
  {:else}
    <div class="souv-row">
      <span class="souv-step">
        <button type="button" aria-label={t("souv.less")} disabled={access.readonly} onclick={() => step(-10)}>−</button>
        <b>{t("souv.perPerson", { v: eur(rate.eur) })}</b>
        <button type="button" aria-label={t("souv.more")} disabled={access.readonly} onclick={() => step(10)}>+</button>
      </span>
      <span class="muted small">{rate.from === "trip" ? t("souv.fromTrip") : rate.from === "prefs" ? t("souv.fromPrefs") : t("souv.fromDefault")}</span>
      {#if rate.from === "trip" && !access.readonly}<button class="linkbtn small" onclick={reset}>{t("souv.reset")}</button>{/if}
    </div>
    {#if !access.readonly}<p class="muted small"><button class="linkbtn souv-off" onclick={() => setOn(false)}>{t("food.off")}</button></p>{/if}
  {/if}
</div>

<style>
  .souv{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}
  .souv-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
  .souv-step{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:99px;padding:2px}
  .souv-step button{width:36px;height:36px;border-radius:99px;border:0;background:var(--paper-2);color:var(--ink);font:inherit;font-size:18px;cursor:pointer}
  .souv-step b{min-width:110px;text-align:center}
</style>
