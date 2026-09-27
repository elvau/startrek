<script lang="ts">
  /* Einfacher Modus: ein Betrag für den ganzen Bereich, gleich auf alle Aktiven verteilt */
  import type { CatKey } from "../model";
  import { access, app, calc, setDetailed, setSimple } from "../store.svelte";
  import { eur, parseNum } from "../calc";
  import { reveal } from "./reveal";

  let { cat, label }: { cat: CatKey; label: string } = $props();
  const HINT: Record<CatKey, string> = {
    flights: "alle Flüge zusammen, hin und zurück",
    stay: "alle Übernachtungen zusammen",
    transport: "Mietwagen, Bahn, Taxi, Fähre …",
    attractions: "Eintritte, Ausflüge, Touren",
    misc: "Essen, Versicherung, alles andere"
  };
  const v = $derived(app.trip.simple?.[cat]);
  const n = $derived(calc.T.active);
  const hidden = $derived(app.trip.items.filter(i => i.cat === cat).length);
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
    <span class="simple-t">{label} gesamt</span>
    <span class="simple-in">
      <input inputmode="decimal" placeholder="0" value={text} oninput={input} onfocus={() => (focused = true)} onblur={() => (focused = false)} disabled={access.readonly} aria-label="{label} gesamt in Euro" />
      <span class="simple-eur">€</span>
    </span>
    <span class="muted">{HINT[cat]}</span>
  </label>
  <div class="simple-out">
    {#if !n}
      <span class="warnline">Noch niemand dabei. Oben bei „Wer fährt mit“ Personen hinzufügen.</span>
    {:else if v}
      <b class="num">{eur(v / n)}</b><span> pro Person · {n} {n === 1 ? "Person" : "Personen"}</span>
    {:else}
      <span class="muted">wird gleich auf {n} {n === 1 ? "Person" : "Personen"} verteilt</span>
    {/if}
  </div>
  {#if hidden && !access.readonly}
    <p class="muted small simple-hidden">{hidden} {hidden === 1 ? "detaillierter Posten ist" : "detaillierte Posten sind"} ausgeblendet. <button class="linkbtn" onclick={() => setDetailed(cat, true)}>Detailliert anzeigen</button></p>
  {/if}
</article>
