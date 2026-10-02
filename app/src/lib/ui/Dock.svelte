<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { app, calc } from "../store.svelte";
  import { eur, testItems } from "../calc";
  import { CHAPTERS, chLabel } from "../chapters";
  import { view } from "../scroll.svelte";
  import Icon from "./Icon.svelte";

  let { onopen }: { onopen: () => void } = $props();

  const ch = $derived(CHAPTERS.find(c => c.k === view.active) || CHAPTERS[0]);
  const val = $derived(ch.k === "trav" ? tn("n.persons", calc.T.active) : ch.k === "split" ? (Object.keys(calc.T.byHousehold).length > 1 && Object.keys(calc.T.byHousehold).length === calc.T.active ? tn("n.persons", calc.T.active) : tn("n.families", Object.keys(calc.T.byHousehold).length)) : eur(calc.T.byCat[ch.k]));
</script>

<button class="dock" onclick={onopen} aria-label={t("dock.open", { total: eur(calc.T.total) })}>
  <span class="ic"><Icon name={ch.icon} /></span>
  <div><small>{chLabel(ch)}</small><b class="num">{val}</b></div>
  <div class="tot"><small>{t("total")}{#if testItems(app.trip).length} <span class="pill-test">{t("test.badge")}</span>{/if}</small><b class="num">{eur(calc.T.total)}</b></div>
  <span class="up" aria-hidden="true">▴</span>
</button>
