<script lang="ts">
  /* Unterkunft privat bzw. schon vorhanden (#233): Ort, Zeitraum, wer, Kosten optional; Ort wird Reiseziel */
  import { untrack } from "svelte";
  import Modal from "./Modal.svelte";
  import { t, tn } from "../i18n/index.svelte";
  import { isActive } from "../model";
  import { app } from "../store.svelte";
  import { entryCurrency } from "../currency.svelte";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, suggestCities, type CityHit } from "../geo/places";
  import { countryName } from "../geo/locations";
  import { nights } from "../format";
  import { destMode, savePrivate } from "../stays/private";
  import { showItem } from "./showItem";

  let { itemId, onclose }: { itemId?: string; onclose: () => void } = $props();
  const trip = app.trip;
  // Posten beim Öffnen festhalten (das Fenster wird je Posten neu angelegt)
  const id0 = untrack(() => itemId);
  const item = id0 ? trip.items.find(i => i.id === id0 && i.private) : undefined;
  const opt = item?.options[0];
  const act = trip.travelers.filter(isActive);

  let place = $state(item?.private?.place || trip.place || "");
  let country = $state(item?.private?.country || (item ? "" : trip.country) || "");
  let from = $state(item?.from || trip.from || "");
  let to = $state(item?.to || trip.to || "");
  let ids = $state<string[]>(item?.participants ? [...item.participants] : act.map(x => x.id));
  let cost = $state<number | null>(opt?.price.unit ? opt.price.unit : null);
  let basis = $state<"stay" | "night">(opt?.price.basis === "night" ? "night" : "stay");
  let dest = $state(false);

  $effect(() => { void ensureGeo(trip).catch(() => {}); });

  let placeFocus = $state(false);
  const prefer = $derived([ccOf(geo, trip.country)].filter((x): x is string => !!x));
  const sugg = $derived(placeFocus ? suggestCities(geo, place, prefer).filter(h => h.name !== place.trim()) : []);
  function pick(h: CityHit) { place = h.name; country = countryName(h.cc); placeFocus = false; }

  const nn = $derived(nights(from, to));
  const mode = $derived(place.trim() ? destMode(trip, place) : "same");
  const ok = $derived(!!place.trim() && nn > 0 && ids.length > 0);
  const toggle = (id: string) => (ids = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  function save(e: Event) {
    e.preventDefault();
    if (!ok) return;
    // privat eingetragen: Unterkunft rechnet detailliert (wie nach einer Suche)
    trip.detail ||= {};
    trip.detail.stay = true;
    const it = savePrivate(trip, { place, country: country || undefined, from, to, cost, basis, currency: opt?.price.currency || entryCurrency(), ids, dest }, item);
    onclose();
    showItem(it.id);
  }
</script>

<Modal title={`🏠 ${t("priv.title")}`} {onclose}>
  <form class="priv" onsubmit={save}>
    <p class="muted small">{t("priv.lead")}</p>
    <div class="ed-row">
      <label class="f grow priv-place">{t("te.place")}<input bind:value={place} placeholder={t("st.placePh")} required autocomplete="off"
          onfocus={() => (placeFocus = true)} onblur={() => setTimeout(() => (placeFocus = false), 150)} oninput={() => { placeFocus = true; country = ""; }} />
        {#if sugg.length}
          <div class="sugg">{#each sugg as h (h.cc + h.name)}<button type="button" onmousedown={e => e.preventDefault()} onclick={() => pick(h)}>{h.name} <small class="muted">{h.land}</small></button>{/each}</div>
        {/if}
      </label>
    </div>
    <div class="ed-row">
      <label class="f">{t("ie.checkin")}<input type="date" bind:value={from} required /></label>
      <label class="f">{t("hh.departure")}<input type="date" bind:value={to} min={from} required /></label>
      {#if nn > 0}<span class="muted small priv-nn">{tn("n.nights", nn)}</span>{/if}
    </div>
    {#if act.length > 1}
      <div class="f">{t("priv.who")}
        <div class="chips">{#each act as x (x.id)}<button type="button" class="chip" class:on={ids.includes(x.id)} aria-pressed={ids.includes(x.id)} onclick={() => toggle(x.id)}>{x.name}</button>{/each}</div>
      </div>
    {/if}
    <div class="priv-cost">
      <div class="ed-row">
        <label class="f">{t("priv.cost")}<input class="n priv-amount" type="number" min="0" step="any" inputmode="decimal" bind:value={cost} placeholder="0" /></label>
        <div class="chips" role="radiogroup" aria-label={t("priv.cost")}>
          <button type="button" role="radio" aria-checked={basis === "stay"} class="chip" class:on={basis === "stay"} onclick={() => (basis = "stay")}>{t("priv.perStay")}</button>
          <button type="button" role="radio" aria-checked={basis === "night"} class="chip" class:on={basis === "night"} onclick={() => (basis = "night")}>{t("priv.perNight")}</button>
        </div>
      </div>
      <span class="muted small">{t("priv.costHint")}</span>
    </div>
    {#if mode === "set"}<p class="small priv-dest">📍 {t("priv.destNew", { place: place.trim() })}</p>
    {:else if mode === "ask"}<label class="priv-dest chk"><input type="checkbox" bind:checked={dest} /> {t("priv.dest", { place: place.trim(), old: trip.place })}</label>{/if}
    <div class="priv-actions">
      <button type="button" class="btn" onclick={onclose}>{t("cancel")}</button>
      <button class="btn primary priv-save" disabled={!ok}>{t("priv.save")}</button>
    </div>
  </form>
</Modal>

<style>
  .priv { display: flex; flex-direction: column; gap: 14px; }
  .priv p { margin: 0; }
  .priv-place { position: relative; }
  .priv-nn { align-self: center; }
  .priv-cost { display: flex; flex-direction: column; gap: 6px; background: var(--paper-2); border-radius: 14px; padding: 12px 14px; }
  .priv-dest.chk { display: flex; gap: 8px; align-items: flex-start; font-size: 14px; }
  .priv-dest input { margin-top: 3px; }
  .priv-actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
</style>
