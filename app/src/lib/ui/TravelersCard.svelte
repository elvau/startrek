<script lang="ts">
  import { app } from "../store.svelte";
  import { ageClass } from "../calc";
  import { uid } from "../model";
  import Households from "./Households.svelte";

  const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8"];
  const L = { adult: "Erwachsen", child: "Kind", infant: "Kleinkind" };
  let edit = $state(false);

  function add(e: Event) {
    e.stopPropagation();
    const i = app.trip.travelers.length;
    app.trip.travelers.push({ id: uid(), name: "", age: 30, household: app.trip.travelers[0]?.household || "", color: COLORS[i % COLORS.length] });
    edit = true;
  }
</script>

<div class="people">
  {#each app.trip.travelers as t, i (t.id)}
    <div class="person">
      <span class="av" style:background={t.color || COLORS[i % COLORS.length]}>{(t.name || "?")[0]}</span>
      {#if edit}
        <input class="inp" bind:value={t.name} placeholder="Name" aria-label="Name" />
        <label class="in-row"><input class="inp num" type="number" min="0" max="120" bind:value={t.age} aria-label="Alter" /> Jahre</label>
        <input class="inp" bind:value={t.household} placeholder="Haushalt" aria-label="Haushalt" />
        <button class="linkbtn danger" onclick={() => (app.trip.travelers = app.trip.travelers.filter(x => x.id !== t.id))}>Entfernen</button>
      {:else}
        <b>{t.name || "Ohne Namen"}</b>
        <span>{t.age} Jahre · {L[ageClass(t.age, app.trip.settings)]}</span>
      {/if}
    </div>
  {/each}
  <button class="person add" onclick={add}><span class="av plus">+</span><b>Person</b></button>
</div>
<div class="home">
  <button class="linkbtn" onclick={e => { e.stopPropagation(); edit = !edit; }}>{edit ? "Fertig" : "Personen bearbeiten"}</button>
</div>
<Households />
