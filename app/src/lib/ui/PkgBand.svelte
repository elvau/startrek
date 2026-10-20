<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /* Pauschalreise (#188) an der Karte: Hauptposten „📦 Pauschalreise · inkl. ✈ Flug · 🚌 Transfer“, Teile „📦 im Paket“ mit Sprung zum Paketpreis */
  import type { Item } from "../model";
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { PART_ICON, pkgInfo, pkgOf } from "../package";
  import { showItem } from "./showItem";

  let { item }: { item: Item } = $props();
  const p = $derived(pkgOf(item));
  const info = $derived(p ? pkgInfo(app.trip, p.id) : null);
  const incl = $derived(info ? info.parts.map(x => `${PART_ICON[x.cat]} ${t(`pkg.part.${x.cat}` as Key)}`).join(" · ") : "");
  // Paketpreis ohne Nebenkosten (Kurtaxe usw. stehen an der Unterkunft)
  const price = $derived.by(() => { const r = info ? calc.T.items[info.main.id] : null; return r ? r.net - (r.extras?.added || 0) : 0; });
  function jump(e: Event) { e.stopPropagation(); if (info) showItem(info.main.id); }
</script>

{#if p && info}
  <div class="pkgb">
    {#if p.main}<span class="pkgb-pill">📦 {t("pkg.title")}</span>{#if incl}<span class="pkgb-incl">{t("pkg.incl", { x: incl })}</span>{/if}
    {:else}<span class="pkgb-pill">📦 {t("pkg.inPkg")}</span><button type="button" class="linkbtn pkgb-go" onclick={jump}>{t("pkg.priceAt", { v: eur(price), ch: `${PART_ICON[info.main.cat]} ${t(`ch.${info.main.cat}.label` as Key)}` })} ›</button>{/if}
  </div>
{/if}

<style>
  .pkgb { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 22px 10px; border-top: 1px dashed var(--line); font-size: 13px; }
  .pkgb-pill { font-weight: 800; color: var(--idea); background: var(--idea-soft); border-radius: 99px; padding: 3px 10px; }
  .pkgb-incl { color: var(--ink-2); }
  .pkgb-go { margin-inline-start: auto; padding: 8px 0; font-weight: 700; }
</style>
