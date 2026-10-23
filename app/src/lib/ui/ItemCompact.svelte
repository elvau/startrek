<script lang="ts">
  /*
   * Posten am Handy (#531) zugeklappt: eine Zeile mit Symbol, Name, Datum bzw. Zeitraum, Status und Preis.
   * Antippen klappt die ganze Karte auf (ItemCard).
   */
  import type { Item } from "../model";
  import { noPrice } from "../model";
  import { calc } from "../store.svelte";
  import { eur } from "../calc";
  import { autoName, t, tn } from "../i18n/index.svelte";
  import { dayShort, range } from "../format";
  import StatusBadge from "./StatusBadge.svelte";
  import Icon from "./Icon.svelte";

  let { item, icon }: { item: Item; icon: string } = $props();
  const r = $derived(calc.T.items[item.id]);
  const opt = $derived(r?.option);
  // wann: Zeitraum (Unterkunft), Tag (Erlebnis), sonst der erste Flug
  const when = $derived.by(() => {
    if (item.from && item.to && item.to > item.from) return range(item.from, item.to);
    if (item.day) return dayShort(item.day.slice(0, 10));
    const dep = opt?.legs?.[0]?.dep;
    return dep ? dayShort(dep.slice(0, 10)) : "";
  });
  const sub = $derived([when, item.options.length > 1 ? tn("n.offers", item.options.length) : ""].filter(Boolean).join(" · "));
  const unpriced = $derived(!opt || noPrice(opt));
</script>

<div class="icp">
  <span class="icp-ic" aria-hidden="true"><Icon name={item.icon || icon} /></span>
  <span class="icp-m">
    <b>{autoName(item.name) || opt?.label || (item.cat === "stay" ? t("stay.new") : t("chapter.addItem"))}</b>
    <small>{#if sub}{sub} · {/if}<StatusBadge status={item.status} />{#if item.check} <span class="icp-chk" title={t("imp.check")}>⚠</span>{/if}</small>
  </span>
  <span class="icp-p num">{unpriced ? "–" : eur(r?.net || 0)}{#if !unpriced && r?.n && r.n > 1}<small>{t("pp", { v: eur((r?.net || 0) / r.n) })}</small>{/if}</span>
</div>

<style>
  .icp { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .icp-ic { flex: none; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: var(--paper-2); color: var(--cc, var(--a)); }
  .icp-ic :global(svg) { width: 19px; height: 19px; }
  .icp-m { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .icp-m b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 14.5px; }
  .icp-m small { color: var(--ink-2); font-size: 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
  .icp-m :global(.status) { font-size: 11px; padding: 1px 7px; }
  .icp-chk { color: var(--warn); }
  .icp-p { flex: none; text-align: end; font: 800 16px "Bricolage Grotesque Variable", sans-serif; }
  .icp-p small { display: block; font: 500 11px inherit; font-family: inherit; color: var(--ink-2); }
</style>
