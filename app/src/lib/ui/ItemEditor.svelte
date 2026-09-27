<script lang="ts">
  /* Bearbeiten eines Postens im Fokusmodus: Status, Angebote, Preis, Beteiligte */
  import { uid, type Item, type Status } from "../model";
  import { app, removeItem } from "../store.svelte";
  import { activeOption } from "../calc";

  let { item }: { item: Item } = $props();
  const STATUS: [Status, string][] = [["idea", "Idee"], ["chosen", "Gewählt"], ["booked", "Gebucht"], ["paid", "Bezahlt"], ["dropped", "Verworfen"]];

  const opt = $derived(activeOption(item, app.trip) || item.options[0]);
  const all = $derived(!item.participants);

  function addOption() {
    const base = opt ? JSON.parse(JSON.stringify(opt)) : { price: { mode: "person", currency: "EUR" } };
    const o = { ...base, id: uid(), label: "", legs: undefined, source: undefined };
    item.options.push(o);
    item.chosen = o.id;
  }
  function dropOption() {
    if (item.options.length < 2 || !opt) return;
    item.options = item.options.filter(o => o.id !== opt.id);
    item.chosen = item.options[0].id;
  }
  function togglePerson(id: string) {
    const cur = item.participants ?? app.trip.travelers.map(t => t.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    item.participants = next.length === app.trip.travelers.length ? undefined : next;
  }
  const num = (v: string) => (v === "" ? undefined : Number(String(v).replace(",", ".")));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="editor" onclick={e => e.stopPropagation()}>
  <div class="ed-row">
    <label class="f grow">Bezeichnung<input bind:value={item.name} placeholder="z. B. Hotel am Strand" /></label>
  </div>

  <div class="ed-sec">
    <span class="dlabel">Status</span>
    <div class="seg" role="radiogroup" aria-label="Status">
      {#each STATUS as [k, l]}
        <button role="radio" aria-checked={item.status === k} class:on={item.status === k} data-s={k} onclick={() => (item.status = k)}>{l}</button>
      {/each}
    </div>
  </div>

  {#if item.options.length > 1}
    <div class="ed-sec">
      <span class="dlabel">Angebot</span>
      <div class="chips">
        {#each item.options as o, i (o.id)}
          <button class="chip" class:on={o.id === opt?.id} onclick={() => (item.chosen = o.id)}>{o.label || `Angebot ${i + 1}`}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if opt}
    <div class="ed-sec">
      <div class="ed-row">
        <label class="f grow">Angebot<input bind:value={opt.label} placeholder="Anbieter, Tarif" /></label>
        <label class="f">Abrechnung
          <select bind:value={opt.price.mode}>
            <option value="person">pro Person</option>
            <option value="unit">pauschal</option>
          </select>
        </label>
        <label class="f">Währung<input class="short" bind:value={opt.price.currency} maxlength="3" /></label>
      </div>
      <div class="ed-row">
        {#if opt.price.mode === "person"}
          <label class="f">Erwachsene<input class="n" inputmode="decimal" value={opt.price.adult ?? ""} oninput={e => (opt.price.adult = num(e.currentTarget.value))} /></label>
          <label class="f">Kinder<input class="n" inputmode="decimal" placeholder="wie Erw." value={opt.price.child ?? ""} oninput={e => (opt.price.child = num(e.currentTarget.value))} /></label>
          <label class="f">Kleinkinder<input class="n" inputmode="decimal" placeholder="wie Kind" value={opt.price.infant ?? ""} oninput={e => (opt.price.infant = num(e.currentTarget.value))} /></label>
        {:else}
          <label class="f">Preis<input class="n" inputmode="decimal" value={opt.price.unit ?? ""} oninput={e => (opt.price.unit = num(e.currentTarget.value))} /></label>
          <label class="f">Pers. pro Einheit<input class="n" inputmode="numeric" placeholder="egal" value={opt.price.capacity ?? ""} oninput={e => { opt.price.capacity = num(e.currentTarget.value); opt.price.multiply = !!opt.price.capacity; }} /></label>
        {/if}
        <label class="f">Menge<input class="n" inputmode="decimal" placeholder="1" value={opt.price.qty ?? ""} oninput={e => (opt.price.qty = num(e.currentTarget.value))} /></label>
      </div>
      <div class="ed-row">
        <button class="linkbtn" onclick={addOption}>+ Angebot zum Vergleichen</button>
        {#if item.options.length > 1}<button class="linkbtn danger" onclick={dropOption}>Dieses Angebot entfernen</button>{/if}
      </div>
    </div>
  {/if}

  <div class="ed-sec">
    <span class="dlabel">Wer ist dabei</span>
    <div class="chips">
      <button class="chip" class:on={all} onclick={() => (item.participants = undefined)}>Alle</button>
      {#each app.trip.travelers as t (t.id)}
        <button class="chip" class:on={all || item.participants?.includes(t.id)} onclick={() => togglePerson(t.id)}>{t.name || "Ohne Namen"}</button>
      {/each}
    </div>
  </div>

  <div class="ed-row">
    <label class="f grow">Notiz<input bind:value={item.note} placeholder="Details, erscheint auf der Karte" /></label>
  </div>

  <div class="ed-foot">
    <button class="linkbtn danger" onclick={() => removeItem(item.id)}>Posten löschen</button>
    <button class="btn primary" onclick={() => (app.editing = null)}>Fertig</button>
  </div>
</div>
