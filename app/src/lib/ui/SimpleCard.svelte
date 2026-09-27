<script lang="ts">
  /* Einfacher Modus: ein Betrag für den ganzen Bereich, gleich auf alle Aktiven verteilt */
  import type { CatKey } from "../model";
  import { access, app, calc, discardDetails, setDetailed, setSimple } from "../store.svelte";
  import { calcItem } from "../calc";
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
    <p class="muted small simple-hidden">
      Details gespeichert: {hidden} Posten, zusammen {eur(hiddenSum)}. Sie zählen im einfachen Modus nicht und kommen beim Wechsel auf „Detailliert“ zurück{v != null && Math.abs(v - hiddenSum) > 0.005 ? ", dann gilt wieder deren Summe statt des Betrags oben" : ""}.
      <button class="linkbtn" onclick={() => setDetailed(cat, true)}>Wiederherstellen</button>
      <button class="linkbtn danger" onclick={() => { if (confirm(`Die ${hidden} gespeicherten Posten bei „${label}“ endgültig verwerfen?`)) discardDetails(cat); }}>Verwerfen</button>
    </p>
  {/if}
</article>
