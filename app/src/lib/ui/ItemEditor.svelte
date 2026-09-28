<script lang="ts">
  /* Bearbeiten eines Postens im Fokusmodus: Status, Angebote, Preis, Beteiligte */
  import { isActive, uid, type FlightLeg, type Item, type Status } from "../model";
  import { app, removeItem } from "../store.svelte";
  import { activeOption, ageClass } from "../calc";
  import { openStaySearch } from "../stays/open.svelte";

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
  // nur wer bei der Reise dabei ist
  const people = $derived(app.trip.travelers.filter(isActive));
  function togglePerson(id: string) {
    const cur = item.participants ?? people.map(t => t.id);
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    item.participants = people.every(t => next.includes(t.id)) ? undefined : next;
  }
  const isStay = $derived(item.cat === "stay");
  const isFlight = $derived(item.cat === "flights");
  const perNight = $derived(isStay && !!item.from && !!item.to && opt?.price.basis !== "stay");

  function leg(dir: "out" | "back"): FlightLeg {
    const o = opt!;
    o.legs ||= [];
    let l = o.legs.find(x => x.dir === dir);
    if (!l) {
      const other = o.legs.find(x => x.dir !== dir);
      l = { dir, from: other?.to || "", to: other?.from || "", dep: "", arr: "", stops: 0 };
      o.legs.push(l);
    }
    return l;
  }
  function setLeg(dir: "out" | "back", k: "from" | "to" | "dep" | "arr" | "stops", v: string) {
    const l = leg(dir);
    if (k === "stops") l.stops = Number(v) || 0;
    else if (k === "from" || k === "to") l[k] = v.toUpperCase().trim();
    else l[k] = v;
  }
  const legOf = (dir: "out" | "back") => opt?.legs?.find(x => x.dir === dir);
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

  {#if isStay}
    <div class="ed-sec">
      <span class="dlabel">Zeitraum</span>
      <div class="ed-row">
        <label class="f">Anreise<input type="date" bind:value={item.from} /></label>
        <label class="f">Abreise<input type="date" bind:value={item.to} min={item.from} /></label>
        <span class="muted ed-note">Jede Nacht zählt nur für die, die dann da sind.</span>
      </div>
      <div><button class="btn primary sm st-item" onclick={() => openStaySearch({ itemId: item.id })}>🔎 Unterkunft suchen</button></div>
    </div>
  {/if}

  {#if isFlight && opt}
    <div class="ed-sec">
      <span class="dlabel">Flugzeiten</span>
      {#each [["out", "Hinflug"], ["back", "Rückflug"]] as [dir, l] (dir)}
        {@const L = legOf(dir as "out" | "back")}
        <div class="ed-row">
          <span class="ed-leg">{l}</span>
          <label class="f">Von<input class="short" maxlength="3" placeholder="DUS" value={L?.from ?? ""} oninput={e => setLeg(dir as "out", "from", e.currentTarget.value)} /></label>
          <label class="f">Nach<input class="short" maxlength="3" placeholder="SPU" value={L?.to ?? ""} oninput={e => setLeg(dir as "out", "to", e.currentTarget.value)} /></label>
          <label class="f">Abflug<input type="datetime-local" value={L?.dep ?? ""} oninput={e => setLeg(dir as "out", "dep", e.currentTarget.value)} /></label>
          <label class="f">Ankunft<input type="datetime-local" value={L?.arr ?? ""} oninput={e => setLeg(dir as "out", "arr", e.currentTarget.value)} /></label>
          <label class="f">Umstiege<input class="n sm" type="number" min="0" max="4" value={L?.stops ?? 0} oninput={e => setLeg(dir as "out", "stops", e.currentTarget.value)} /></label>
        </div>
      {/each}
      <label class="check"><input type="checkbox" checked={item.access !== false} onchange={e => (item.access = e.currentTarget.checked ? undefined : false)} /> Anreise zum Abflughafen einrechnen (Auto mit Parken oder Bahn, je Familie)</label>
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
          <label class="f">Erwachsene{perNight ? " / Nacht" : ""}<input class="n" inputmode="decimal" value={opt.price.adult ?? ""} oninput={e => (opt.price.adult = num(e.currentTarget.value))} /></label>
          <label class="f">Kinder<input class="n" inputmode="decimal" placeholder="wie Erw." value={opt.price.child ?? ""} oninput={e => (opt.price.child = num(e.currentTarget.value))} /></label>
          <label class="f">Kleinkinder<input class="n" inputmode="decimal" placeholder="wie Kind" value={opt.price.infant ?? ""} oninput={e => (opt.price.infant = num(e.currentTarget.value))} /></label>
        {:else}
          <label class="f">Preis{perNight ? " pro Nacht" : ""}<input class="n" inputmode="decimal" value={opt.price.unit ?? ""} oninput={e => (opt.price.unit = num(e.currentTarget.value))} /></label>
          {#if isStay && item.from && item.to}
            <label class="f">gilt
              <select value={opt.price.basis === "stay" ? "stay" : "night"} onchange={e => (opt.price.basis = e.currentTarget.value as "night" | "stay")}>
                <option value="night">pro Nacht</option>
                <option value="stay">für den Aufenthalt</option>
              </select>
            </label>
            <label class="f">Max. Gäste<input class="n" inputmode="numeric" placeholder="egal" value={opt.price.capacity ?? ""} oninput={e => (opt.price.capacity = num(e.currentTarget.value))} /></label>
          {:else}
            <label class="f">Pers. pro Einheit<input class="n" inputmode="numeric" placeholder="egal" value={opt.price.capacity ?? ""} oninput={e => { opt.price.capacity = num(e.currentTarget.value); opt.price.multiply = !!opt.price.capacity; }} /></label>
          {/if}
        {/if}
        <label class="f">Menge<input class="n" inputmode="decimal" placeholder="1" value={opt.price.qty ?? ""} oninput={e => (opt.price.qty = num(e.currentTarget.value))} /></label>
      </div>
      {#if isStay && opt.price.mode === "unit" && opt.price.capacity}
        <label class="check"><input type="checkbox" bind:checked={opt.price.multiply} /> Bei mehr Gästen weitere Zimmer oder Apartments dazubuchen</label>
      {/if}
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
      {#each people as t (t.id)}
        {@const cls = ageClass(t.age, app.trip.settings, t.kind)}
        <button class="chip" class:on={all || item.participants?.includes(t.id)} onclick={() => togglePerson(t.id)}>{t.name || "Ohne Namen"}{#if cls !== "adult"} <em class="age-pill {cls}">{cls === "child" ? "Kind" : "Kleinkind"}</em>{/if}</button>
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
