<script lang="ts">
  /* Einfacher Modus: ein Eintrag mit Text, Betrag und wer dabei ist (Knöpfe, anfangs alle an) */
  import { t } from "../i18n/index.svelte";
  import type { SimpleLine } from "../model";
  import { access, app, removeLine, toggleLineWho } from "../store.svelte";
  import { eurPP, lineWho, parseNum } from "../calc";

  let { line, ph }: { line: SimpleLine; ph: string } = $props();
  const people = $derived(app.trip.travelers.filter(x => x.active !== false));
  const who = $derived(lineWho(line, app.trip));
  let text = $state("");
  let focused = $state(false);
  $effect(() => { if (!focused) text = line.amount ? String(line.amount).replace(".", ",") : ""; });

  function input(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const x = parseNum(text);
    line.amount = text.trim() === "" ? 0 : isNaN(x) ? line.amount : Math.max(0, x);
  }
</script>

<div class="sl">
  <div class="sl-top">
    <input class="inp sl-t" bind:value={line.label} placeholder={ph} disabled={access.readonly} aria-label={t("simple.lineText")} />
    <span class="sl-v">
      <input class="inp" inputmode="decimal" placeholder="0" value={text} oninput={input} onfocus={() => (focused = true)} onblur={() => (focused = false)} disabled={access.readonly} aria-label={t("simple.lineAmount")} />
      <span>€</span>
    </span>
    {#if !access.readonly}<button class="x sl-x" onclick={() => removeLine(line.id)} aria-label={t("simple.lineRemove")}>✕</button>{/if}
  </div>
  <div class="sl-who" role="group" aria-label={t("simple.lineWho")}>
    {#each people as p (p.id)}
      <button class="chip sm" class:on={who.includes(p)} disabled={access.readonly} onclick={() => toggleLineWho(line, p.id)}>{p.name || t("trav.noName")}</button>
    {/each}
    {#if line.amount > 0}
      <span class="muted small sl-pp">{who.length ? t("perPerson", { v: eurPP(line.amount / who.length) }) : t("simple.lineNobody")}</span>
    {/if}
  </div>
</div>
