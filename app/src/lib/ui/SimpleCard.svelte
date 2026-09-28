<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  /* Einfacher Modus: ein Betrag für den ganzen Bereich, gleich auf alle Aktiven verteilt */
  import type { CatKey } from "../model";
  import type { Key } from "../i18n/index.svelte";
  import { access, app, calc, discardDetails, setDetailed, setSimple } from "../store.svelte";
  import { calcItem } from "../calc";
  import { eur, parseNum } from "../calc";
  import { reveal } from "./reveal";

  let { cat, label }: { cat: CatKey; label: string } = $props();
  const HINT = (c: CatKey) => t(`simple.hint.${c}` as Key);
  const v = $derived(app.trip.simple?.[cat]);
  const n = $derived(calc.T.active);
  const hiddenItems = $derived(app.trip.items.filter(i => i.cat === cat));
  const hidden = $derived(hiddenItems.length);
  // Summe der gespeicherten Posten, als wären sie aktiv
  const hiddenSum = $derived(hiddenItems.reduce((a, it) => a + (it.status === "dropped" ? 0 : calcItem(it, app.trip).net), 0));
  let text = $state("");
  let focused = $state(false);
  // Anzeige folgt dem Wert, außer während man tippt
  $effect(() => { if (!focused) text = v != null ? String(v).replace(".", ",") : ""; });

  function input(e: Event) {
    text = (e.currentTarget as HTMLInputElement).value;
    const x = parseNum(text);
    setSimple(cat, text.trim() === "" ? undefined : isNaN(x) ? v : x);
  }
</script>

<article class="card simple-card" use:reveal>
  <label class="simple-l">
    <span class="simple-t">{t("simple.total", { label })}</span>
    <span class="simple-in">
      <input inputmode="decimal" placeholder="0" value={text} oninput={input} onfocus={() => (focused = true)} onblur={() => (focused = false)} disabled={access.readonly} aria-label={t("simple.totalEur", { label })} />
      <span class="simple-eur">€</span>
    </span>
    <span class="muted">{HINT(cat)}</span>
  </label>
  <div class="simple-out">
    {#if !n}
      <span class="warnline">{t("simple.nobody")}</span>
    {:else if v}
      <b class="num">{eur(v / n)}</b><span> {t("simple.perPerson")} · {tn("n.persons", n)}</span>
    {:else}
      <span class="muted">{t("simple.split", { p: tn("n.persons", n) })}</span>
    {/if}
  </div>
  {#if hidden && !access.readonly}
    <p class="muted small simple-hidden">
      {t("simple.hidden", { n: hidden, sum: eur(hiddenSum) })}{v != null && Math.abs(v - hiddenSum) > 0.005 ? ` ${t("simple.hiddenSum")}` : ""}
      <button class="linkbtn" onclick={() => setDetailed(cat, true)}>{t("simple.restore")}</button>
      <button class="linkbtn danger" onclick={() => { if (confirm(t("simple.discardConfirm", { n: hidden, label }))) discardDetails(cat); }}>{t("simple.discard")}</button>
    </p>
  {/if}
</article>
