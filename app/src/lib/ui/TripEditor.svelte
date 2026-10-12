<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { autoName, nights } from "../format";
  import { geo } from "../geo/geo.svelte";
  import { ccOf, cityNames, countryNames, loadGeo } from "../geo/places";
  import { dir } from "../directory.svelte";
  import { prefsFor } from "../prefs";

  let { onclose }: { onclose: () => void } = $props();
  const trip = $derived(app.trip);
  const nn = $derived(nights(trip.from, trip.to));
  // Vorschläge: alle Länder, dazu bekannte Orte des gewählten Landes
  loadGeo(geo, []);
  const countries = $derived(countryNames(geo));
  const cities = $derived(cityNames(geo, ccOf(geo, trip.country)));
  // Zuhause während der Reise (#323): je Reise ein- oder ausschalten, sonst wie in den Vorlieben
  const homeOn = $derived(trip.homeCare ?? !!prefsFor(trip, dir).homeCare);
  function setHome(v: boolean) { if (v === !!prefsFor(trip, dir).homeCare) delete trip.homeCare; else trip.homeCare = v; }
</script>

<div class="trip-ed">
  <div class="ed-row">
    <label class="f grow">{t("te.name")}
      <!-- leer lassen: Name kommt aus Ort und Zeitraum -->
      <input value={trip.autoName ? "" : trip.name} placeholder={trip.autoName ? trip.name : t("te.namePh")}
        oninput={e => { const v = e.currentTarget.value; if (v.trim()) { trip.name = v; trip.autoName = false; } else { trip.autoName = true; trip.name = autoName(trip) || trip.name; } }} /></label>
  </div>
  <div class="ed-row">
    <label class="f grow">{t("te.place")}<input bind:value={trip.place} placeholder={t("te.placePh")} list="te-cities" autocomplete="off" /></label>
    <label class="f grow">{t("te.country")}<input bind:value={trip.country} placeholder={t("te.countryPh")} list="te-countries" autocomplete="off" /></label>
    <datalist id="te-countries">{#each countries as c (c)}<option value={c}></option>{/each}</datalist>
    <datalist id="te-cities">{#each cities as c (c)}<option value={c}></option>{/each}</datalist>
  </div>
  <div class="ed-row">
    <label class="f">{t("te.from")}<input type="date" bind:value={trip.from} /></label>
    <label class="f">{t("te.to")}<input type="date" bind:value={trip.to} min={trip.from} /></label>
    {#if nn}<span class="muted ed-note">{tn("n.nights", nn)}</span>{/if}
  </div>
  <div class="ed-row">
    <label class="f grow">{t("te.kicker")}<input bind:value={trip.kicker} placeholder={t("te.kickerPh")} /></label>
  </div>
  <label class="te-home"><input type="checkbox" checked={homeOn} onchange={e => setHome(e.currentTarget.checked)} /> <span>🏠 {t("home.switch")}<small class="muted">{t("home.switchHint")}</small></span></label>
  <div class="ed-foot"><span class="muted">{t("autosave")}</span><button class="btn primary" onclick={onclose}>{t("done")}</button></div>
</div>

<style>
  .te-home{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin:4px 0 8px}
  .te-home input{margin-top:3px}
  .te-home small{display:block}
</style>
