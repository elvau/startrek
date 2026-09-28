<script lang="ts">
  /* Neue Reise: Name und wer mitfährt, aus gespeicherten Gruppen und Personen */
  import { newTrip } from "../store.svelte";
  import { dir, travelersFrom } from "../directory.svelte";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import { autoName, nights } from "../format";
  import QuickFamilies from "./QuickFamilies.svelte";
  import { placeholderTravelers, soloTraveler, type FamilyRow } from "../placeholders";

  let { onclose }: { onclose: () => void } = $props();
  let name = $state("");
  let place = $state("");
  let from = $state("");
  let to = $state("");
  const auto = $derived(autoName({ place, from, to }));
  const nn = $derived(nights(from, to));
  // wer fährt mit: allein als anonymes Reh (Standard), als Rudel (Platzhalter-Familien) oder aus gespeicherten Gruppen
  let mode = $state<"solo" | "pack" | "saved">("solo");
  let fams = $state<FamilyRow[]>([{ animal: "Reh", adults: 2, kids: 0, infants: 0 }]);
  const famCount = $derived(fams.reduce((a, r) => a + r.adults + r.kids + (r.infants || 0), 0));
  let picked = $state<string[]>([]);
  let groups = $state(false);

  const toggleGroup = (ids: string[]) => {
    const all = ids.every(id => picked.includes(id));
    picked = all ? picked.filter(id => !ids.includes(id)) : [...new Set([...picked, ...ids])];
  };
  const toggle = (id: string) => (picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);

  function create(e: Event) {
    e.preventDefault();
    const travelers = mode === "solo" ? [soloTraveler()] : mode === "pack" ? placeholderTravelers(fams) : travelersFrom(picked);
    newTrip({ name, place, from, to, travelers });
    onclose();
  }
</script>

{#if groups}
  <GroupsDialog onclose={() => (groups = false)} />
{:else}
  <Modal title="Neue Reise" {onclose}>
    <form class="newtrip" onsubmit={create}>
      <div class="ed-row">
        <label class="f grow">Wohin?<input bind:value={place} placeholder="z. B. Mosel" /></label>
      </div>
      <div class="ed-row">
        <label class="f">Von<input type="date" bind:value={from} /></label>
        <label class="f">Bis<input type="date" bind:value={to} min={from} /></label>
        {#if nn}<span class="muted ed-note">{nn + 1} Tage</span>{/if}
      </div>
      <label class="f">Name (optional)<input bind:value={name} placeholder={auto || "wird aus Ziel und Zeitraum gebildet"} /></label>
      <div class="ed-sec">
        <span class="dlabel">Wer fährt mit?</span>
        <div class="who" role="radiogroup" aria-label="Wer fährt mit">
          <button type="button" role="radio" aria-checked={mode === "solo"} class="who-b" class:on={mode === "solo"} onclick={() => (mode = "solo")}>
            <span class="who-i">🦌</span><b>Anonymes Reh</b><small>nur ich</small></button>
          <button type="button" role="radio" aria-checked={mode === "pack"} class="who-b" class:on={mode === "pack"} onclick={() => (mode = "pack")}>
            <span class="who-i">🐺</span><b>Rudel</b><small>Familien, anonym</small></button>
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
        <button type="button" class="linkbtn" onclick={() => (groups = true)}>Gruppen und Personen verwalten</button>
      </div>
      <div class="ed-foot"><span class="muted small">Startet im einfachen Modus: ein Betrag je Bereich.</span><button class="btn primary">Reise anlegen</button></div>
    </form>
  </Modal>
{/if}
