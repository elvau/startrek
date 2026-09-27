<script lang="ts">
  /* Gespeicherte Gruppen und Personen verwalten. Eine Person kann in mehreren Gruppen sein. */
  import { addGroup, addPerson, dir, removeGroup, removePerson, toggleMember } from "../directory.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import Modal from "./Modal.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let first = $state(""), last = $state(""), age = $state<number | undefined>();
  let gname = $state("");
  let err = $state("");
  let open = $state<string | null>(dir.groups[0]?.id ?? null);

  function newPerson(e: Event) {
    e.preventDefault();
    if (!first.trim() || !last.trim()) { err = "Vor- und Nachname sind Pflicht."; return; }
    const p = addPerson(first, last, age);
    const g = dir.groups.find(x => x.id === open);
    if (g) g.memberIds.push(p.id);
    first = ""; age = undefined; err = "";
  }
  function newGroup(e: Event) {
    e.preventDefault();
    if (!gname.trim()) return;
    open = addGroup(gname).id;
    gname = "";
  }
</script>

<Modal title="Gruppen und Personen" {onclose}>
  <div class="groups-d">
    <p class="muted small">{cloud.user ? "Liegt in deinem Konto, nur du siehst es." : "Liegt in diesem Browser. Mit Anmeldung auf allen deinen Geräten."}</p>

    <div class="ed-sec">
      <span class="dlabel">Gruppen</span>
      {#each dir.groups as g (g.id)}
        <div class="grp" class:open={open === g.id}>
          <button class="grp-h" onclick={() => (open = open === g.id ? null : g.id)} aria-expanded={open === g.id}>
            <b>{g.name}</b><span class="muted">{g.memberIds.length} {g.memberIds.length === 1 ? "Person" : "Personen"}</span>
          </button>
          {#if open === g.id}
            <div class="grp-b">
              <input class="inp grp-name" bind:value={g.name} aria-label="Name der Gruppe" />
              <div class="chips">
                {#each dir.people as p (p.id)}
                  <button class="chip" class:on={g.memberIds.includes(p.id)} aria-pressed={g.memberIds.includes(p.id)} onclick={() => toggleMember(g, p.id)}>{p.first} {p.last}</button>
                {:else}
                  <span class="muted small">Noch keine Personen, unten anlegen.</span>
                {/each}
              </div>
              <button class="linkbtn danger" onclick={() => { if (confirm(`Gruppe „${g.name}“ löschen? Die Personen bleiben erhalten.`)) removeGroup(g.id); }}>Gruppe löschen</button>
            </div>
          {/if}
        </div>
      {:else}
        <p class="muted small">Noch keine Gruppe. Zum Beispiel „Familie Klein“ oder „Kegelclub“.</p>
      {/each}
      <form class="ed-row" onsubmit={newGroup}>
        <label class="f grow">Neue Gruppe<input bind:value={gname} placeholder="z. B. Kegelclub" /></label>
        <button class="btn" disabled={!gname.trim()}>Anlegen</button>
      </form>
    </div>

    <div class="ed-sec">
      <span class="dlabel">Personen</span>
      <ul class="plist">
        {#each dir.people as p (p.id)}
          <li>
            <input class="inp" class:need={!p.first.trim()} bind:value={p.first} aria-label="Vorname" />
            <input class="inp" class:need={!p.last.trim()} bind:value={p.last} aria-label="Nachname" />
            <input class="inp num" type="number" min="0" max="120" placeholder="Alter" bind:value={p.age} aria-label="Alter" />
            <button class="x" aria-label="{p.first} löschen" onclick={() => { if (confirm(`${p.first} ${p.last} löschen? Auch aus allen Gruppen.`)) removePerson(p.id); }}>×</button>
          </li>
        {/each}
      </ul>
      <form class="ed-row" onsubmit={newPerson}>
        <label class="f">Vorname *<input bind:value={first} placeholder="Monika" /></label>
        <label class="f">Nachname *<input bind:value={last} placeholder="Klein" /></label>
        <label class="f">Alter<input class="n sm" type="number" min="0" max="120" bind:value={age} /></label>
        <button class="btn">{open && dir.groups.find(x => x.id === open) ? `Hinzufügen zu „${dir.groups.find(x => x.id === open)?.name}“` : "Person anlegen"}</button>
      </form>
      {#if err}<p class="err">{err}</p>{/if}
    </div>
  </div>
</Modal>
