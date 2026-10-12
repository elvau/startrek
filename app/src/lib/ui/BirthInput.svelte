<script lang="ts">
  /*
   * Geburtsdatum als Tag, Monat (Auswahl) und Jahr (Eingabe): schneller als der Kalender des Browsers,
   * wenn das Jahr weit zurückliegt, und im Dunkelmodus wie die übrigen Felder. Wert als JJJJ-MM-TT, leer = keine Angabe.
   */
  import { untrack } from "svelte";
  import { i18n, t } from "../i18n/index.svelte";
  import { birthParts, birthValue } from "./birth";

  let { value = $bindable() }: { value?: string } = $props();

  let p = $state(untrack(() => birthParts(value)));
  let last = untrack(() => value || "");
  // von außen geändert (z. B. KI-Vorschlag): Felder nachziehen
  $effect(() => { const v = value || ""; if (v !== last) { last = v; p = birthParts(v); } });
  function set(k: "d" | "m" | "y", v: string) {
    p[k] = v;
    const max = new Date(Number(p.y) || 2000, Number(p.m) || 1, 0).getDate();
    if (Number(p.d) > max) p.d = String(max);
    const next = birthValue(p);
    // halb getipptes Jahr: alten Wert behalten
    if (!next && p.d && p.m && p.y) return;
    last = next;
    value = next || undefined;
  }
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleDateString(i18n.lang, { month: "long" });
  const days = $derived(new Date(Number(p.y) || 2000, Number(p.m) || 1, 0).getDate());
</script>

<span class="bd">
  <select class="bd-d" aria-label={t("bd.day")} value={p.d} onchange={e => set("d", e.currentTarget.value)}>
    <option value="">{t("bd.day")}</option>
    {#each Array.from({ length: days }, (_, i) => i + 1) as n (n)}<option value={String(n)}>{n}</option>{/each}
  </select>
  <select class="bd-m" aria-label={t("bd.month")} value={p.m} onchange={e => set("m", e.currentTarget.value)}>
    <option value="">{t("bd.month")}</option>
    {#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}<option value={String(n)}>{monthName(n)}</option>{/each}
  </select>
  <input class="bd-y" inputmode="numeric" maxlength="4" autocomplete="bday-year" placeholder={t("bd.year")} aria-label={t("bd.year")} value={p.y}
    oninput={e => set("y", e.currentTarget.value.replace(/\D/g, "").slice(0, 4))} />
</span>

<style>
  .bd{display:flex;gap:6px;min-width:0}
  .bd-d{flex:0 0 auto;width:5.2em}
  .bd-m{flex:1 1 7em;min-width:0}
  .bd-y{flex:0 0 auto;width:4.6em}
</style>
