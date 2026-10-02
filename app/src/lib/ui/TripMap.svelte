<script lang="ts">
  /*
   * Karte der Reise: gewählte Unterkünfte, Events und Erlebnisse mit Ort, Flughäfen. Ein Tipp auf eine Unterkunft
   * oder ein Erlebnis springt zum Posten. Kacheln wie in der Unterkunftssuche (OpenFreeMap).
   */
  import { t } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { geo } from "../geo/geo.svelte";
  import { tripSpots } from "../geo/spots";
  import MapView, { type MapPoint } from "./MapView.svelte";
  import { showItem } from "./showItem";

  let { onclose }: { onclose: () => void } = $props();
  const spots = $derived(tripSpots(app.trip, geo));
  const short = (s: string) => (s.length > 24 ? s.slice(0, 23) + "…" : s);
  const points = $derived<MapPoint[]>(spots.map(s => ({
    id: s.id, lat: s.lat, lon: s.lon, kind: s.kind, title: s.name,
    label: s.kind === "airport" ? `✈ ${s.id.slice(3)}` : `${s.kind === "stay" ? "🛏" : "★"} ${short(s.name)}`
  })));
  function pick(id: string) {
    const s = spots.find(x => x.id === id);
    if (s?.itemId) showItem(s.itemId);
  }
</script>

<div class="trip-map">
  {#if points.length}
    <MapView {points} onselect={pick} />
    <p class="muted small">{t("tmap.hint")} <button type="button" class="linkbtn" onclick={onclose}>{t("tmap.close")}</button></p>
  {:else}
    <p class="muted small">{t("tmap.empty")}</p>
  {/if}
</div>
