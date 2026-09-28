<script lang="ts">
  import { access, app } from "../store.svelte";
  import { ageClass } from "../calc";
  import { isActive, isDetailed, uid } from "../model";
  import { dir, saveAsGroup, travelersFrom } from "../directory.svelte";
  import Households from "./Households.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import QuickFamilies from "./QuickFamilies.svelte";
  import { animalEmoji, nextAnimal, placeholderTravelers, type FamilyRow } from "../placeholders";

  const COLORS = ["#D2693C", "#2F6FDB", "#C0487A", "#1F8A70", "#D08A12", "#7A5AC8"];
  const L = { adult: "Erwachsen", child: "Kind", infant: "Kleinkind" };
  let edit = $state(false);
  let pick = $state(false);
  let groups = $state(false);
  let saved = $state("");
  let quick = $state(false);
  let fams = $state<FamilyRow[]>([]);
  const households = $derived([...new Set(app.trip.travelers.map(t => t.household))]);
  function openQuick() { fams = [{ animal: nextAnimal(households), adults: 2, kids: 0, infants: 0 }]; quick = !quick; }
  function addQuick() {
    app.trip.travelers.push(...placeholderTravelers(fams, app.trip.travelers.length));
    quick = false;
  }

  const missing = (s: string) => !s || !s.trim();
  const incomplete = $derived(app.trip.travelers.some(t => missing(t.name) || missing(t.household)));

  function add(e: Event) {
    e.stopPropagation();
    const i = app.trip.travelers.length;
    app.trip.travelers.push({ id: uid(), name: "", household: app.trip.travelers[0]?.household || "", color: COLORS[i % COLORS.length] });
    edit = true;
  }
  function addFrom(ids: string[]) {
    app.trip.travelers.push(...travelersFrom(ids, app.trip.travelers));
    pick = false;
  }
  function saveGroup() {
    if (incomplete) { edit = true; saved = "Bitte bei allen Vor- und Nachname eintragen."; return; }
    // Platzhalter bleiben in der Reise und kommen nicht in gespeicherte Gruppen
    const real = app.trip.travelers.filter(t => !t.placeholder);
    if (!real.length) { saved = "Platzhalter werden nicht gespeichert. Trage erst echte Namen ein (Personen bearbeiten)."; return; }
    const name = prompt("Name der Gruppe, z. B. „Familie Klein“ oder „Kegelclub“:", app.trip.name);
    if (!name?.trim()) return;
    const g = saveAsGroup(name, real);
    saved = `Gespeichert als Gruppe „${g.name}“ (${g.memberIds.length} Personen).`;
    setTimeout(() => (saved = ""), 4000);
  }
</script>

<div class="people">
  {#each app.trip.travelers as t, i (t.id)}
    {@const emoji = t.placeholder ? animalEmoji(t.household) : null}
    <div class="person" class:off={!isActive(t)}>
      <span class="av" class:emoji style:--ring={t.color || COLORS[i % COLORS.length]} style:background={emoji ? null : t.color || COLORS[i % COLORS.length]}>{emoji || (t.name || "?")[0]}</span>
      {#if edit}
        <!-- ein echter Name macht aus dem Platzhalter eine Person -->
        <input class="inp" class:need={missing(t.name)} bind:value={t.name} oninput={() => (t.placeholder = undefined)} placeholder="Vorname *" aria-label="Vorname" />
        <input class="inp" class:need={missing(t.household)} bind:value={t.household} oninput={() => (t.placeholder = undefined)} placeholder="Nachname *" aria-label="Nachname" />
        <label class="in-row"><input class="inp num" type="number" min="0" max="120" bind:value={t.age} placeholder="?" aria-label="Alter" /> Jahre</label>
        <button class="linkbtn danger" onclick={() => (app.trip.travelers = app.trip.travelers.filter(x => x.id !== t.id))}>Entfernen</button>
      {:else}
        <b>{t.placeholder ? t.name : `${t.name || "Ohne Namen"} ${t.household}`}</b>
        <span>{t.age != null && String(t.age) !== "" ? `${t.age} Jahre · ` : ""}{L[ageClass(t.age, app.trip.settings, t.kind)]}</span>
        <button class="dabei" class:on={isActive(t)} disabled={access.readonly} aria-pressed={isActive(t)}
          onclick={() => (t.active = isActive(t) ? false : undefined)}>{isActive(t) ? "✓ dabei" : "nicht dabei"}</button>
      {/if}
    </div>
  {/each}
  {#if !access.readonly}<button class="person add" onclick={add}><span class="av plus">+</span><b>Person</b></button>{/if}
</div>

{#if !access.readonly}
  <div class="home trav-acts">
    <button class="linkbtn" onclick={e => { e.stopPropagation(); edit = !edit; }}>{edit ? "Fertig" : "Personen bearbeiten"}</button>
    {#if dir.groups.length || dir.people.length}<button class="linkbtn" onclick={() => (pick = !pick)}>Aus Gruppe hinzufügen</button>{/if}
    <button class="linkbtn" onclick={openQuick}>Familie als Platzhalter</button>
    {#if app.trip.travelers.length}<button class="linkbtn" onclick={saveGroup}>Als Gruppe speichern</button>{/if}
    <button class="linkbtn" onclick={() => (groups = true)}>Gruppen verwalten</button>
  </div>
  {#if edit && incomplete}<p class="warnline trav-note">Vor- und Nachname sind Pflicht. Der Nachname fasst eine Familie zusammen.</p>{/if}
  {#if saved}<p class="muted trav-note">{saved}</p>{/if}
  {#if quick}
    <div class="pick quick">
      <QuickFamilies bind:rows={fams} used={households} />
      <button class="btn primary" disabled={!fams.some(r => r.adults + r.kids + (r.infants || 0))} onclick={addQuick}>Hinzufügen</button>
      <p class="muted small">Nur für diese Reise, nicht in Gruppen gespeichert. Echte Namen trägst du bei „Personen bearbeiten“ ein.</p>
    </div>
  {/if}
  {#if pick}
    <div class="pick">
      {#each dir.groups as g (g.id)}
        {@const neu = g.memberIds.filter(id => !app.trip.travelers.some(t => t.personId === id))}
        <button class="chip" disabled={!neu.length} onclick={() => addFrom(g.memberIds)}>{g.name} <small>{neu.length ? `+${neu.length}` : "alle dabei"}</small></button>
      {/each}
      {#each dir.people.filter(p => !app.trip.travelers.some(t => t.personId === p.id)) as p (p.id)}
        <button class="chip" onclick={() => addFrom([p.id])}>+ {p.first} {p.last}</button>
      {/each}
    </div>
  {/if}
{/if}
<!-- Wohnort, Anreise und Anwesenheit braucht es erst für detaillierte Flüge oder Unterkünfte -->
{#if isDetailed(app.trip, "flights") || isDetailed(app.trip, "stay")}<Households />{/if}
{#if groups}<GroupsDialog onclose={() => (groups = false)} />{/if}
