<script lang="ts">
  /* Neue Reise: Name und wer mitfährt, aus gespeicherten Gruppen und Personen */
  import { newTrip } from "../store.svelte";
  import { dir, travelersFrom } from "../directory.svelte";
  import Modal from "./Modal.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let name = $state("");
  let picked = $state<string[]>([]);
  let groups = $state(false);

  const toggleGroup = (ids: string[]) => {
    const all = ids.every(id => picked.includes(id));
    picked = all ? picked.filter(id => !ids.includes(id)) : [...new Set([...picked, ...ids])];
  };
  const toggle = (id: string) => (picked = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);

  function create(e: Event) {
    e.preventDefault();
    newTrip({ name, travelers: travelersFrom(picked) });
    onclose();
  }
</script>

{#if groups}
  <GroupsDialog onclose={() => (groups = false)} />
{:else}
  <Modal title="Neue Reise" {onclose}>
    <form class="newtrip" onsubmit={create}>
      <label class="f">Name der Reise<input bind:value={name} placeholder="z. B. Kegeltour Mosel" /></label>
      <div class="ed-sec">
        <span class="dlabel">Wer fährt mit?</span>
        {#if dir.groups.length || dir.people.length}
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
        {:else}
          <p class="muted small">Noch keine gespeicherten Gruppen. Du kannst die Personen auch später in der Reise eintragen.</p>
        {/if}
        <button type="button" class="linkbtn" onclick={() => (groups = true)}>Gruppen und Personen verwalten</button>
      </div>
      <div class="ed-foot"><span class="muted small">Startet im einfachen Modus: ein Betrag je Bereich.</span><button class="btn primary">Reise anlegen</button></div>
    </form>
  </Modal>
{/if}
