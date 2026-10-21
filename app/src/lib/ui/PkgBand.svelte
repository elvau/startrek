<script lang="ts">
  import { arrow, t, type Key } from "../i18n/index.svelte";
  /*
   * Pauschalreise (#188, #460) an der Karte: Paketkarte „📦 Pauschalreise · inkl. ✈ Flug · 🚌 Transfer“, Teile „📦 im Paket“
   * mit Sprung zum Paketpreis; je Teil „einzeln suchen“, Vergleich Paket gegen einzeln, Paket aufbrechen bzw. wiederherstellen.
   */
  import type { Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { PART_ICON, breakPkg, pkgCompare, pkgInfo, pkgOf, pkgState, restorePkg } from "../package";
  import { openFlightSearch } from "../flights/open.svelte";
  import { openStaySearch } from "../stays/open.svelte";
  import { showItem } from "./showItem";

  let { item }: { item: Item } = $props();
  const p = $derived(pkgOf(item));
  const info = $derived(p ? pkgInfo(app.trip, p.id) : null);
  const state = $derived(info ? pkgState(info) : "whole");
  const cmp = $derived(info && p?.main && state === "whole" ? pkgCompare(app.trip, info) : null);
  const incl = $derived(info ? info.parts.map(x => `${PART_ICON[x.cat]} ${t(`pkg.part.${x.cat}` as Key)}`).join(" · ") : "");
  // Paketpreis ohne Nebenkosten (Kurtaxe usw. stehen an der Unterkunft)
  const price = $derived.by(() => { const r = info ? calc.T.items[info.main.id] : null; return r ? r.net - (r.extras?.added || 0) : 0; });
  const stop = (f: () => void) => (e: Event) => { e.stopPropagation(); f(); };
  const search = () => (item.cat === "flights" ? openFlightSearch({ itemId: item.id }) : openStaySearch({ itemId: item.id }));
  const canSearch = $derived(!access.readonly && (item.cat === "flights" || item.cat === "stay"));
</script>

{#if p && info}
  <div class="pkgb" class:warn={state === "mixed"}>
    {#if state === "off"}
      <span class="pkgb-pill off">📦 {t("pkg.broken")}</span>
      {#if !access.readonly && p.main}<button type="button" class="linkbtn pkgb-act pkgb-restore" onclick={stop(() => restorePkg(app.trip, info.id))}>↩ {t("pkg.restore")}</button>{/if}
    {:else if state === "mixed"}
      <span class="pkgb-pill">⚠ {t("pkg.mixed")}</span>
      {#if !access.readonly}<span class="pkgb-act">
        <button type="button" class="btn sm pkgb-break" onclick={stop(() => breakPkg(app.trip, info.id))}>✂ {t("pkg.break")}</button>
        <button type="button" class="btn sm pkgb-keep" onclick={stop(() => restorePkg(app.trip, info.id))}>📦 {t("pkg.keep")}</button></span>{/if}
    {:else if p.main}
      <span class="pkgb-pill">📦 {t("pkg.title")}</span>{#if incl}<span class="pkgb-incl">{t("pkg.incl", { x: incl })}</span>{/if}
      {#if canSearch}<button type="button" class="linkbtn pkgb-act pkgb-alone" onclick={stop(search)}>⇆ {t("pkg.searchAlone")}</button>{/if}
    {:else}
      <span class="pkgb-pill">📦 {t("pkg.inPkg")}</span>
      {#if canSearch}<button type="button" class="linkbtn pkgb-alone" onclick={stop(search)}>⇆ {t("pkg.searchAlone")}</button>{/if}
      <button type="button" class="linkbtn pkgb-act pkgb-go" onclick={stop(() => showItem(info.main.id))}>{t("pkg.priceAt", { v: eur(price), ch: `${PART_ICON[info.main.cat]} ${t(`ch.${info.main.cat}.label` as Key)}` })} {arrow() === "←" ? "‹" : "›"}</button>
    {/if}
    {#if cmp}
      <div class="pkgb-cmp">
        <span>📦 <b>{eur(cmp.pkg)}</b></span><span class="muted">·</span>
        <span>{[...info.parts.filter(x => x.cat !== "transport").map(x => PART_ICON[x.cat]), PART_ICON[info.main.cat]].join(" + ")} {t("pkg.alone")} <b>{eur(cmp.single)}</b></span>
        <b class:good={cmp.single > cmp.pkg} class:bad={cmp.single < cmp.pkg}>{cmp.single >= cmp.pkg ? "+" : "−"}{eur(Math.abs(cmp.single - cmp.pkg))}</b>
      </div>
      <p class="pkgb-loss muted">ⓘ {t("pkg.loss")}{cmp.missing.length ? ` · ${t("pkg.noTransfer")}` : ""}</p>
    {/if}
  </div>
{/if}

<style>
  .pkgb { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 22px 10px; border-top: 1px dashed var(--line); font-size: 13px; }
  .pkgb.warn { background: var(--warn-soft); }
  .pkgb-pill { font-weight: 800; color: var(--idea); background: var(--idea-soft); border-radius: 99px; padding: 3px 10px; }
  .pkgb-pill.off { color: var(--ink-2); background: var(--paper-2); }
  .pkgb-incl { color: var(--ink-2); }
  .pkgb-act { margin-inline-start: auto; display: inline-flex; gap: 6px; }
  .pkgb .linkbtn { padding: 8px 0; font-weight: 700; }
  .pkgb-cmp { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; width: 100%; font-size: 14px; }
  .pkgb-cmp .good { color: var(--good); }
  .pkgb-cmp .bad { color: var(--warn); }
  .pkgb-loss { margin: 0; width: 100%; font-size: 12.5px; }
</style>
