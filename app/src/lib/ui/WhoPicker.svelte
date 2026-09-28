<script module lang="ts">
  import { travelersFrom } from "../directory.svelte";
  import { animalEmoji, groupTravelers, nextAnimal, placeholderTravelers, soloTraveler, type FamilyRow } from "../placeholders";
  import type { Traveler } from "../model";

  export type WhoMode = "solo" | "partner" | "family" | "group" | "saved";
  export interface Who {
    mode: WhoMode;
    solo: string;
    partner: string;
    fams: FamilyRow[];
    group: { adults: number; kids: number };
    picked: string[];
  }
  /** Startauswahl: solo, mit zufälligen Tieren */
  export function newWho(): Who {
    return { mode: "solo", solo: nextAnimal(), partner: nextAnimal(), fams: [{ animal: nextAnimal(), adults: 2, kids: 0, infants: 0 }], group: { adults: 6, kids: 0 }, picked: [] };
  }
  /** Reisende nach der Auswahl */
  export function whoTravelers(w: Who): Traveler[] {
    switch (w.mode) {
      case "solo": return [soloTraveler(w.solo)];
      case "partner": return placeholderTravelers([{ animal: w.partner, adults: 2, kids: 0 }]);
      case "family": return placeholderTravelers(w.fams);
      case "group": return groupTravelers(w.group.adults, w.group.kids);
      default: return travelersFrom(w.picked);
    }
  }
</script>

<script lang="ts">
  /* Wer fährt mit: Solo, Partner, Familie, Gruppe (oder gespeicherte Gruppen) */
  import { dir } from "../directory.svelte";
  import QuickFamilies from "./QuickFamilies.svelte";

  let { who = $bindable() }: { who: Who } = $props();
  const famCount = $derived(who.fams.reduce((a, r) => a + r.adults + r.kids + (r.infants || 0), 0));
  const OPTS: { k: WhoMode; t: string; s: string }[] = [
    { k: "solo", t: "Solo", s: "1 Person" },
    { k: "partner", t: "Partner", s: "zu zweit" },
    { k: "family", t: "Familie", s: "eine oder mehrere" },
    { k: "group", t: "Gruppe", s: "Mannschaft, Verein" }
  ];
  const other = (cur: string) => nextAnimal([cur]);
  const step = (k: "adults" | "kids", d: number) => (who.group[k] = Math.max(k === "adults" ? 1 : 0, Math.min(40, who.group[k] + d)));

  const toggleGroup = (ids: string[]) => {
    const all = ids.every(id => who.picked.includes(id));
    who.picked = all ? who.picked.filter(id => !ids.includes(id)) : [...new Set([...who.picked, ...ids])];
  };
  const toggle = (id: string) => (who.picked = who.picked.includes(id) ? who.picked.filter(x => x !== id) : [...who.picked, id]);
</script>

<!-- kleine Figuren: Köpfe und Körper, Kinder kleiner -->
{#snippet person(x: number, s: number, o = 1)}
  <g opacity={o}><circle cx={x} cy={22 - 11 * s} r={5.5 * s} /><path d="M{x - 8 * s} 44 v{-8 * s} a{8 * s} {8 * s} 0 0 1 {16 * s} 0 v{8 * s} z" /></g>
{/snippet}
{#snippet fig(k: WhoMode)}
  <svg class="who-fig" viewBox="0 0 64 44" aria-hidden="true">
    {#if k === "solo"}{@render person(32, 1.25)}
    {:else if k === "partner"}{@render person(24, 1.15)}{@render person(40, 1.15)}
    {:else if k === "family"}{@render person(17, 1.1)}{@render person(47, 1.1)}{@render person(32, .8)}{@render person(25, .65)}{@render person(39, .65)}
    {:else if k === "group"}{@render person(12, .85, .55)}{@render person(24, .9, .75)}{@render person(52, .85, .55)}{@render person(40, .9, .75)}{@render person(32, 1.05)}
    {:else}{@render person(22, 1)}{@render person(42, 1)}{/if}
  </svg>
{/snippet}

<div class="who" role="radiogroup" aria-label="Wer fährt mit">
  {#each OPTS as o (o.k)}
    <button type="button" role="radio" aria-checked={who.mode === o.k} class="who-b who-{o.k}" class:on={who.mode === o.k} onclick={() => (who.mode = o.k)}>
      <span class="who-art">{@render fig(o.k)}</span><b>{o.t}</b><small>{o.s}</small></button>
  {/each}
  {#if dir.groups.length || dir.people.length}
    <button type="button" role="radio" aria-checked={who.mode === "saved"} class="who-b who-saved" class:on={who.mode === "saved"} onclick={() => (who.mode = "saved")}>
      <span class="who-art">{@render fig("saved")}</span><b>Gespeichert</b><small>deine Gruppen</small></button>
  {/if}
</div>

<div class="who-d">
  {#if who.mode === "solo"}
    <p class="small">Du planst als <b>{animalEmoji(who.solo)} {who.solo}</b>. <button type="button" class="linkbtn" onclick={() => (who.solo = other(who.solo))}>Anderes Tier</button></p>
    <p class="muted small">Namen und weitere Personen kannst du jederzeit in der Reise ergänzen.</p>
  {:else if who.mode === "partner"}
    <p class="small">Ihr plant zu zweit als <b>{animalEmoji(who.partner)} Familie {who.partner}</b>. <button type="button" class="linkbtn" onclick={() => (who.partner = other(who.partner))}>Anderes Tier</button></p>
    <p class="muted small">Ihr zählt als eine Familie und zahlt gemeinsam.</p>
  {:else if who.mode === "family"}
    <p class="muted small">Eine oder mehrere Familien, jede als Tier, z. B. „Familie Fuchs: 2 Erwachsene, 2 Kinder“. Echte Namen kannst du später eintragen.</p>
    <QuickFamilies bind:rows={who.fams} />
    {#if famCount}<p class="muted small">Zusammen {famCount} {famCount === 1 ? "Person" : "Personen"}.</p>{/if}
  {:else if who.mode === "group"}
    <p class="muted small">Jede Person rechnet für sich ab, z. B. Mannschaft, Verein oder Kegelclub.</p>
    <div class="qf-counts grp-counts">
      {#each [["adults", "Erw.", "Erwachsene"], ["kids", "Kinder", "Kinder"]] as [k, l, full] (k)}
        <span class="qf-step" role="group" aria-label={full}>
          <button type="button" onclick={() => step(k as "adults", -1)} aria-label="{full} weniger">−</button>
          <b>{who.group[k as "adults"]}</b><small>{l}</small>
          <button type="button" onclick={() => step(k as "adults", 1)} aria-label="{full} mehr">+</button>
        </span>
      {/each}
    </div>
    <p class="muted small">Zusammen {who.group.adults + who.group.kids} Personen.</p>
  {:else}
    <div class="chips">
      {#each dir.groups as g (g.id)}
        {@const on = g.memberIds.length > 0 && g.memberIds.every(id => who.picked.includes(id))}
        <button type="button" class="chip grp-chip" class:on aria-pressed={on} onclick={() => toggleGroup(g.memberIds)}>{g.name} <small>{g.memberIds.length}</small></button>
      {/each}
    </div>
    <div class="chips">
      {#each dir.people as p (p.id)}
        <button type="button" class="chip" class:on={who.picked.includes(p.id)} aria-pressed={who.picked.includes(p.id)} onclick={() => toggle(p.id)}>{p.first} {p.last}</button>
      {/each}
    </div>
    <p class="muted small">{who.picked.length} {who.picked.length === 1 ? "Person" : "Personen"} ausgewählt. Einzelne kannst du später für diese Reise auf „nicht dabei“ stellen.</p>
  {/if}
</div>
