<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Chapter } from "../chapters";
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
    <div class="ch-t"><small>Kapitel {n}</small><h2>{ch.title}</h2>{#if mode && onmode}<ModeSwitch value={mode} onchange={onmode} label="{ch.label}: einfach oder detailliert" />{/if}</div>
    <div class="ch-sum"><b class="num">{sum}</b><span>{sub}</span></div>
  </div>
  <div class="cards">
    {@render children()}
    {#if onadd}
      <div class="add-row">
        <button class="add" onclick={onadd}>+ {ch.k === "flights" ? "Flug oder Anreise" : ch.k === "stay" ? "Unterkunft" : "Posten"}</button>
        {#if onreset}<button class="linkbtn danger" onclick={onreset}>Details zurücksetzen</button>{/if}
      </div>
    {/if}
  </div>
</section>
