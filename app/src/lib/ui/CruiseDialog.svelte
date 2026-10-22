<script lang="ts">
  /*
   * Kreuzfahrt (#519, #525): suchen (KI mit Websuche, solange kein Partner einen Feed hat), ein Angebot importieren oder
   * von Hand eintragen. Treffer werden Kreuzfahrt-Posten mit Route und Kabinen; Preise sind „ab“-Preise der Fundstelle.
   */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { CABIN_TYPES, isActive, type CabinType } from "../model";
  import { CABIN_ICON } from "../cruise";
  import { guests } from "../stays/app";
  import { FLIGHTS_URL } from "../flights/app";
  import { money } from "../calc";
  import { range } from "../format";
  import { partnersOf } from "../partners";
  import { CRUISE_AREAS, type CruiseArea, type CruiseHit } from "../cruises/search";
  import { askCruises, hitItem } from "../cruises/app";
  import Modal from "./Modal.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import PartnerLinks from "./PartnerLinks.svelte";
  import ExtLink from "./ExtLink.svelte";
  import { showItem } from "./showItem";

  let { onclose, onhand }: { onclose: () => void; onhand: () => void } = $props();
  type Mode = "search" | "import";
  let mode = $state<Mode>("search");
  const trip = app.trip;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const soon = (n: number) => iso(new Date(Date.now() + n * 86400000));
  // Abfahrt: um den Beginn der Reise (3 Tage davor bis eine Woche danach), sonst die drei Monate ab in vier Wochen
  const around = (d: string, n: number) => { const x = iso(new Date(Date.parse(d + "T00:00:00Z") + n * 86400000)); return x < soon(1) ? soon(1) : x; };
  let from = $state(trip.from ? around(trip.from, -3) : soon(28)), to = $state(trip.from ? around(trip.from, 7) : soon(120));
  let area = $state<CruiseArea>("any"), port = $state("");
  let nightsMin = $state<number | null>(null), nightsMax = $state<number | null>(null);
  let cabin = $state<CabinType | "">("");
  const g = $derived(guests(trip.travelers.filter(isActive)));
  let busy = $state(false), error = $state(""), hits = $state<CruiseHit[] | null>(null), taken = $state<Record<string, boolean>>({});
  let ctrl: AbortController | null = null;

  async function search(e?: Event) {
    e?.preventDefault();
    ctrl?.abort();
    ctrl = new AbortController();
    busy = true; error = ""; hits = null;
    try {
      const r = await askCruises({ area, from, to: to < from ? from : to, adults: Math.max(1, g.adults), ...(g.childAges.length ? { childAges: g.childAges } : {}),
        ...(port.trim() ? { port: port.trim() } : {}), ...(nightsMin ? { nightsMin } : {}), ...(nightsMax ? { nightsMax } : {}), ...(cabin ? { cabin } : {}) }, ctrl.signal);
      hits = r.cruises;
    } catch (x) {
      if ((x as Error).name !== "AbortError") error = (x as Error).message;
    } finally { busy = false; }
  }
  function take(h: CruiseHit) {
    const it = hitItem(trip, h);
    trip.detail = { ...(trip.detail || {}), stay: true };
    trip.items.push(it);
    taken[h.id] = true;
    onclose();
    showItem(it.id);
  }
  const people = $derived(g.adults + g.childAges.length);
  const route = (h: CruiseHit) => { const ps = h.ports.filter(p => p.place).map(p => p.place!); return ps.filter((x, i) => i === 0 || x !== ps[i - 1]).join(" → "); };
</script>

<Modal title={`🚢 ${t("cs.title")}`} {onclose}>
  <div class="chips cs-mode" role="group">
    <button type="button" class="chip" class:on={mode === "search"} aria-pressed={mode === "search"} onclick={() => (mode = "search")}>🔎 {t("cs.search")}</button>
    {#if cloud.configured}<button type="button" class="chip" class:on={mode === "import"} aria-pressed={mode === "import"} onclick={() => (mode = "import")}>📥 {t("pkg.import")}</button>{/if}
    <button type="button" class="chip cs-hand" onclick={() => { onclose(); onhand(); }}>✏ {t("pkg.hand")}</button>
  </div>
  {#if mode === "import"}
    <p class="small muted">{t("cs.importHint")}</p>
    <ImportPanel {onclose} into />
  {:else}
    <form class="cs-form" onsubmit={search}>
      <div class="cs-grid">
        <label class="f">🌍 {t("cs.area")}
          <select class="cs-area" bind:value={area}>{#each CRUISE_AREAS as a (a)}<option value={a}>{t(`cs.a.${a}` as Key)}</option>{/each}</select>
        </label>
        <label class="f">⚓ {t("cs.port")}<input class="cs-port" bind:value={port} placeholder={t("cr.portPh")} /></label>
        <label class="f">📅 {t("cs.from")}<input type="date" class="cs-from" bind:value={from} /></label>
        <label class="f">{t("cs.to")}<input type="date" class="cs-to" min={from} bind:value={to} /></label>
        <label class="f">🌙 {t("cs.nightsMin")}<input type="number" class="n sm" min="1" max="120" bind:value={nightsMin} /></label>
        <label class="f">{t("cs.nightsMax")}<input type="number" class="n sm" min="1" max="120" bind:value={nightsMax} /></label>
      </div>
      <div class="chips" role="radiogroup" aria-label={t("cr.type")}>
        <button type="button" role="radio" aria-checked={cabin === ""} class="chip sm" class:on={cabin === ""} onclick={() => (cabin = "")}>{t("cs.anyCabin")}</button>
        {#each CABIN_TYPES as c (c)}<button type="button" role="radio" aria-checked={cabin === c} class="chip sm" class:on={cabin === c} onclick={() => (cabin = c)}>{CABIN_ICON[c]} {t(`cr.type.${c}` as Key)}</button>{/each}
      </div>
      <p class="small muted">👥 {tn("n.persons", people)} · {t("cs.aiHint")}</p>
      {#if !FLIGHTS_URL}<p class="warnline small">{t("search.notSetUp")}</p>{/if}
      <button class="btn primary cs-go" disabled={busy || !FLIGHTS_URL || !from}>{busy ? t("cs.busy") : `🔎 ${t("cs.searchBtn")}`}</button>
    </form>
    {#if error}<p class="err small">{error}</p>{/if}
    {#if hits}
      {#if !hits.length}<p class="small cs-none">{t("cs.none")}</p>{/if}
      <ul class="cs-hits">
        {#each hits as h (h.id)}
          <li class="cs-hit">
            <div class="cs-top"><b>{h.title || [h.line, h.ship].filter(Boolean).join(" ")}</b>
              {#if h.price}<span class="cs-price">{t("cs.fromPp", { v: money(h.price.perPerson, h.price.currency) })}</span>{/if}</div>
            <div class="small">{[h.line, h.ship].filter(Boolean).join(" · ")}{h.price?.cabin ? ` · ${CABIN_ICON[h.price.cabin]} ${t(`cr.type.${h.price.cabin}` as Key)}` : ""}</div>
            <div class="small">📅 {h.to ? range(h.from, h.to) : h.from}{h.nights ? ` · ${tn("n.nights", h.nights)}` : ""}</div>
            {#if route(h)}<div class="small cs-route">🗺 {route(h)}</div>{/if}
            {#if h.price && people > 1}<div class="small muted">{t("cs.total", { v: money(h.price.perPerson * people, h.price.currency), p: tn("n.persons", people) })}</div>{/if}
            <div class="cs-act">
              <ExtLink href={h.url} cls="btn sm" gate name={h.source}>{h.source} ↗</ExtLink>
              <button type="button" class="btn primary sm cs-take" disabled={taken[h.id]} onclick={() => take(h)}>{taken[h.id] ? `✓ ${t("search.taken")}` : t("search.take")}</button>
            </div>
          </li>
        {/each}
      </ul>
      {#if hits.length}<p class="small muted">{t("cs.priceHint")}</p>{/if}
    {/if}
    <p class="small muted cs-links">{t("cs.portals")} <PartnerLinks ids={partnersOf("cruise")} /></p>
  {/if}
</Modal>

<style>
  .cs-mode { margin-bottom: 12px; }
  .cs-form { display: flex; flex-direction: column; gap: 10px; }
  .cs-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .cs-hits { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .cs-hit { border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; background: var(--paper); display: flex; flex-direction: column; gap: 3px; }
  .cs-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .cs-price { font-weight: 700; white-space: nowrap; }
  .cs-act { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 6px; }
  .cs-links { margin-top: 12px; }
</style>
