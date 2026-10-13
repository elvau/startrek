<script lang="ts">
  /*
   * Schulferien (#163): Land, dann Region (Bundesland, Kanton …), wo es Regionen gibt; Länder aus der OpenHolidays API.
   * Gespeichert als „DE-NW“ bzw. „BE-“ für ein ganzes Land; alte Angaben („NW“) gelten als Bundesland.
   */
  import { untrack } from "svelte";
  import { i18n, t } from "../i18n/index.svelte";
  import { countryName } from "../geo/locations";
  import { flagOf } from "../format";
  import { holidayPlace, type Regions } from "../holidays";
  import { loadRegions } from "../holidaysApp.svelte";

  let { value, onchange, empty, cls = "" }: { value?: string; onchange: (v: string | undefined) => void; empty: string; cls?: string } = $props();
  let rs = $state<Regions | null>(null);
  $effect(() => { void loadRegions().then(r => (rs = r)); });
  let cc = $state(untrack(() => holidayPlace(value)?.cc || ""));
  const region = $derived(holidayPlace(value)?.region || "");
  const countries = $derived(Object.keys(rs?.countries || {}).map(k => ({ k, name: countryName(k) })).sort((a, b) => a.name.localeCompare(b.name)));
  const list = $derived((rs?.countries[cc] || []).map(r => ({ code: r.code, name: r.n[i18n.lang] || r.n.en || Object.values(r.n)[0] || r.code })).sort((a, b) => a.name.localeCompare(b.name)));
  function setCc(v: string) {
    cc = v;
    // Land ohne Regionen gleich speichern, sonst erst die Region
    if (!v) onchange(undefined);
    else if (!(rs?.countries[v] || []).length) onchange(`${v}-`);
  }
</script>

<span class="hol-pick {cls}">
  <select class="pv-in hol-cc" aria-label={t("hol.country")} value={cc} onchange={e => setCc(e.currentTarget.value)}>
    <option value="">{empty}</option>
    {#if cc && !countries.length}<option value={cc}>{flagOf(cc)} {countryName(cc)}</option>{/if}
    {#each countries as c (c.k)}<option value={c.k}>{flagOf(c.k)} {c.name}</option>{/each}
  </select>
  {#if cc && list.length}
    <select class="pv-in hol-region" aria-label={t("hol.region")} value={region} onchange={e => onchange(e.currentTarget.value || undefined)}>
      <option value="">{t("hol.pickRegion")}</option>
      {#each list as r (r.code)}<option value={r.code}>{r.name}</option>{/each}
    </select>
  {/if}
</span>

<style>
  .hol-pick { display: flex; flex-wrap: wrap; gap: 6px; }
  .hol-pick select { flex: 1 1 10em; min-width: 0; }
</style>
