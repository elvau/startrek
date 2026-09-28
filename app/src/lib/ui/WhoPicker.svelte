<script module lang="ts">
  import { travelersFrom } from "../directory.svelte";
  import { placeholderTravelers, soloTraveler, type FamilyRow } from "../placeholders";
  import type { Traveler } from "../model";

  export type WhoMode = "solo" | "pack" | "saved";
  /** Reisende nach der Auswahl: anonymes Reh, Platzhalter-Familien oder gespeicherte Personen */
  export function whoTravelers(mode: WhoMode, fams: FamilyRow[], picked: string[]): Traveler[] {
    return mode === "solo" ? [soloTraveler()] : mode === "pack" ? placeholderTravelers(fams) : travelersFrom(picked);
  }
</script>

<script lang="ts">
  /* Wer fährt mit: solo (anonymes Reh, Standard), im Rudel (Platzhalter-Familien) oder gespeicherte Gruppen */
  import { dir } from "../directory.svelte";
  import QuickFamilies from "./QuickFamilies.svelte";

  let { mode = $bindable(), fams = $bindable(), picked = $bindable() }: { mode: WhoMode; fams: FamilyRow[]; picked: string[] } = $props();
  const famCount = $derived(fams.reduce((a, r) => a + r.adults + r.kids + (r.infants || 0), 0));

  const toggleGroup = (ids: string[]) => {
    const all = ids.every(id => picked.includes(id));
    picked = all ? picked.filter(id => !ids.includes(id)) : [...new Set([...picked, ...ids])];
  };
  const toggle = (id: string) => (picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);
</script>

<div class="who" role="radiogroup" aria-label="Wer fährt mit">
  <button type="button" role="radio" aria-checked={mode === "solo"} class="who-b" class:on={mode === "solo"} onclick={() => (mode = "solo")}>
    <span class="who-i">🦌</span><b>Ich reise solo</b><small>anonym als Reh</small></button>
  <button type="button" role="radio" aria-checked={mode === "pack"} class="who-b" class:on={mode === "pack"} onclick={() => (mode = "pack")}>
    <span class="who-i">🐺</span><b>Ich reise im Rudel</b><small>Familien, anonym</small></button>
  {#if dir.groups.length || dir.people.length}
    <button type="button" role="radio" aria-checked={mode === "saved"} class="who-b" class:on={mode === "saved"} onclick={() => (mode = "saved")}>
      <span class="who-i">👥</span><b>Gespeichert</b><small>Gruppen, Personen</small></button>
  {/if}
</div>
{#if mode === "solo"}
  <p class="muted small">Eine Person ohne Namen. Weitere kannst du jederzeit in der Reise ergänzen.</p>
{:else if mode === "pack"}
  <p class="muted small">Familien als Platzhalter, z. B. „Familie Reh: 2 Erwachsene, 2 Kinder, 1 Kleinkind“. Sie gelten nur für diese Reise; echte Namen kannst du später eintragen.</p>
  <QuickFamilies bind:rows={fams} />
  {#if famCount}<p class="muted small">Zusammen {famCount} {famCount === 1 ? "Person" : "Personen"}.</p>{/if}
{:else}
  <div class="chips">
    {#each dir.groups as g (g.id)}
      {@const on = g.memberIds.length > 0 && g.memberIds.every(id => picked.includes(id))}
      <button type="button" class="chip grp-chip" class:on aria-pressed={on} onclick={() => toggleGroup(g.memberIds)}>{g.name} <small>{g.memberIds.length}</small></button>
    {/each}
  </div>
  <div class="chips">
    {#each dir.people as p (p.id)}
      <button type="button" class="chip" class:on={picked.includes(p.id)} aria-pressed={picked.includes(p.id)} onclick={() => toggle(p.id)}>{p.first} {p.last}</button>
    {/each}
  </div>
  <p class="muted small">{picked.length} {picked.length === 1 ? "Person" : "Personen"} ausgewählt. Einzelne kannst du später für diese Reise auf „nicht dabei“ stellen.</p>
{/if}
