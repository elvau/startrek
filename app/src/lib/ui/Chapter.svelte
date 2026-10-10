<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  import type { Snippet } from "svelte";
  import { chLabel, chTitle, type Chapter } from "../chapters";
  import { view } from "../scroll.svelte";
  import Icon from "./Icon.svelte";
  import ModeSwitch from "./ModeSwitch.svelte";

  let { ch, n, sum, sub, children, onadd, onreset, mode, onmode }: {
    ch: Chapter; n: number; sum: string; sub: string; children: Snippet; onadd?: () => void; onreset?: () => void;
    mode?: "simple" | "detail"; onmode?: (detail: boolean) => void;
  } = $props();
</script>

<section class="chapter" class:on={view.active === ch.k} id={ch.k} data-ch={ch.k} style="--cc:var(--c-{ch.k})">
  <div class="ch-head">
    <div class="ch-ico"><Icon name={ch.icon} /></div>
    <div class="ch-t"><small>{t("chapter.n", { n })}</small><h2>{chTitle(ch)}</h2>{#if mode && onmode}<div class="ch-mode"><ModeSwitch value={mode} onchange={onmode} label={t("chapter.mode", { label: chLabel(ch) })} /><Help k="mode" /></div>{/if}</div>
    <div class="ch-sum"><b class="num">{sum}</b><span>{sub}</span></div>
  </div>
  <div class="cards">
    {@render children()}
    {#if onadd}
      <div class="add-row">
        <button class="add" onclick={onadd}>+ {ch.k === "flights" ? t("chapter.addFlight") : ch.k === "stay" ? t("chapter.addStay") : t("chapter.addItem")}</button>
        {#if onreset}<button class="linkbtn danger" onclick={onreset}>{t("chapter.reset")}</button>{/if}
      </div>
    {/if}
  </div>
</section>
