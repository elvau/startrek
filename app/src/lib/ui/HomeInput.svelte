<script lang="ts">
  /*
   * Wohnort je Land (#163, Entscheidung #335): Land wählen, dann Postleitzahl (wo Daten vorliegen: Deutschland und
   * europäische Länder aus GeoNames) oder Ort aus der Ortsliste. Gemeinsam für Haushalte, Personen, Assistent, Vorlieben,
   * Flug- und Event-Suche und Anreise; gespeichert wird wie bisher Ort und Koordinaten, dazu das Land.
   */
  import { untrack } from "svelte";
  import { t } from "../i18n/index.svelte";
  import { geo } from "../geo/geo.svelte";
  import { loadGeo } from "../geo/places";
  import { countryName } from "../geo/locations";
  import { flagOf } from "../format";
  import { HOME_DEFAULT, POSTAL_SOURCE, exactPostal, homeText, loadPostal, postalCountries, rowHome, shortCode, suggestPostal, type Home, type PostalRow } from "../home";

  let { value, onpick, onclear, label, cls = "" }: {
    value?: { cc?: string; plz?: string; ort?: string } | null;
    onpick: (h: Home) => void;
    /** Feld geleert */
    onclear?: () => void;
    label?: string;
    cls?: string;
  } = $props();

  let cc = $state(untrack(() => value?.cc || HOME_DEFAULT));
  let q = $state(untrack(() => homeText(value || undefined) || value?.plz || ""));
  let rows = $state<PostalRow[] | null>(null);
  let postal = $state<Set<string>>(new Set([HOME_DEFAULT]));
  let focus = $state(false);
  let picked = $state(untrack(() => !!(value?.ort || value?.plz)));
  // gewählter Ort (beim Eintippen einer vollständigen PLZ bleibt das Feld, wie es ist)
  let ort = $state(untrack(() => value?.ort || ""));

  $effect(() => { void postalCountries().then(s => (postal = s)); void loadGeo(geo, []); });
  $effect(() => {
    const c = cc;
    untrack(() => (rows = null));
    if (postal.has(c)) void loadPostal(c).then(r => { if (cc === c) rows = r; });
  });
  const countries = $derived(geo.world.map(w => ({ k: w.k, name: countryName(w.k) })).sort((a, b) => a.name.localeCompare(b.name)));
  const hasPostal = $derived(postal.has(cc));
  // ohne Postleitzahlen: Orte der Ortsliste als Zeilen ohne PLZ
  const cityRows = $derived<PostalRow[]>((geo.world.find(w => w.k === cc)?.cities || []).map(c => ["", c[0], c[1], c[2]] as PostalRow));
  const list = $derived(hasPostal ? rows : cityRows);
  const sugg = $derived(focus && !picked && q.trim() && list ? suggestPostal(list, shortCode(cc, q)) : []);
  const unknown = $derived(!picked && !!list && q.trim().length >= 3 && !sugg.length && !exactPostal(list, shortCode(cc, q.trim())));

  function pick(r: PostalRow) {
    const h = rowHome(cc, r);
    q = homeText(h);
    picked = true;
    ort = h.ort;
    focus = false;
    onpick(h);
  }
  function typed(v: string) {
    q = v;
    picked = false;
    ort = "";
    if (!v.trim()) { onclear?.(); return; }
    const r = list && hasPostal ? exactPostal(list, shortCode(cc, v.trim())) : undefined;
    if (r) { const h = rowHome(cc, r); picked = true; ort = h.ort; q = homeText(h); onpick(h); }
  }
  // schon getippte vollständige PLZ auflösen, sobald die Liste des Landes da ist
  $effect(() => {
    const l = list;
    untrack(() => { if (l && hasPostal && !picked && q.trim()) { const r = exactPostal(l, shortCode(cc, q.trim())); if (r) { const h = rowHome(cc, r); picked = true; ort = h.ort; q = homeText(h); onpick(h); } } });
  });
  // Land von außen (z. B. ungefährer Ort aus der Verbindung) übernehmen, solange nichts eingetippt ist
  $effect(() => { const c = value?.cc; untrack(() => { if (c && c !== cc && !q.trim() && !picked) cc = c; }); });
  function setCc(v: string) { cc = v; q = ""; picked = false; }
</script>

<div class="home-in {cls}">
  {#if label}<span class="dlabel home-l">{label}</span>{/if}
  <div class="home-row">
    <select class="home-cc" aria-label={t("home.country")} value={cc} onchange={e => setCc(e.currentTarget.value)}>
      {#if !countries.length}<option value={cc}>{flagOf(cc)} {countryName(cc)}</option>{/if}
      {#each countries as c (c.k)}<option value={c.k}>{flagOf(c.k)} {c.name}</option>{/each}
    </select>
    <span class="home-q">
      <input class="home-plz" value={q} oninput={e => typed(e.currentTarget.value)} onfocus={() => (focus = true)} onblur={() => setTimeout(() => (focus = false), 150)}
        placeholder={hasPostal ? t("home.ph") : t("home.phCity")} aria-label={hasPostal ? t("home.ph") : t("home.phCity")} autocomplete="off" />
      {#if sugg.length}
        <span class="sugg home-sugg">{#each sugg as r (r[0] + r[1])}<button type="button" onmousedown={e => e.preventDefault()} onclick={() => pick(r)}>{#if r[0]}<b>{r[0]}</b> {/if}{r[1]}</button>{/each}</span>
      {/if}
    </span>
  </div>
  {#if unknown}<small class="err">{t("fs.plzUnknown")}</small>{:else if picked && ort && !q.includes(ort)}<small class="muted home-ort">📍 {ort}</small>{/if}
  {#if hasPostal && cc !== HOME_DEFAULT}<small class="muted home-src">{t("home.source", { src: POSTAL_SOURCE })}</small>{/if}
</div>

<style>
  .home-in { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .home-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .home-cc { flex: 0 1 11em; min-width: 0; }
  .home-q { position: relative; flex: 1 1 10em; min-width: 0; display: flex; }
  .home-plz { width: 100%; min-width: 0; }
  .home-sugg { position: absolute; top: 100%; inset-inline: 0; z-index: 30; display: flex; flex-direction: column; background: var(--paper); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); overflow: hidden; }
  .home-sugg button { text-align: start; border: 0; background: none; padding: 8px 10px; font: inherit; font-size: 14px; color: inherit; cursor: pointer; }
  .home-sugg button:hover { background: var(--paper-2); }
  .home-src { font-size: 11.5px; }
</style>
