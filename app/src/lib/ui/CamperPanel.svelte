<script lang="ts">
  /*
   * Roadtrip mit dem Camper (#203): Umschalter Auto | Camper, eigener oder gemieteter, über 3,5 t. Stationen legt man hier an:
   * je Station ein Unterkunfts-Posten „Campingplatz“ bzw. „Stellplatz“ mit Richtwert je Nacht und Land. Mietcamper als Posten
   * mit Tagespreis, Kilometerpaket, Pauschalen und Kaution (nur Kreditkarte).
   */
  import { t } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { eur } from "../calc";
  import { isActive, uid, type Item } from "../model";
  import { addDays } from "../calc/travel";
  import { ccOf, findCity } from "../geo/places";
  import { geo } from "../geo/geo.svelte";
  import { homeOf, tripDays } from "../ground";
  import { CAMPER_RENT, CAMPING_SOURCE, campNight } from "../road/camper";
  import { roadPlan } from "../road/road.svelte";
  import { FEES_AS_OF } from "../fees";
  import { nights as nightsBetween } from "../format";
  import PartnerLinks from "./PartnerLinks.svelte";
  import { partnersOf } from "../partners";
  import { showItem } from "./showItem";

  const flies = $derived(app.trip.items.some(i => i.cat === "flights" && i.status !== "dropped"));
  const show = $derived(!flies && !!homeOf(app.trip));
  const camper = $derived(app.trip.camper);
  const persons = $derived(app.trip.travelers.filter(isActive).length || 1);
  const camps = $derived(app.trip.items.filter(i => i.cat === "stay" && i.status !== "dropped" && i.hint?.startsWith("camp:"))
    .sort((a, b) => (a.from || "").localeCompare(b.from || "")));
  const rent = $derived(app.trip.items.find(i => i.hint === "camper:rent" && i.status !== "dropped"));

  function setMode(on: boolean) {
    if (on) app.trip.camper = { ...(app.trip.camper || {}) };
    else delete app.trip.camper;
  }
  const setOwn = (own: boolean) => (app.trip.camper = { ...app.trip.camper, own });
  const setHeavy = (heavy: boolean) => (app.trip.camper = { ...app.trip.camper, heavy });

  // neue Station: Ort, Nächte, Campingplatz oder Stellplatz
  let place = $state("");
  let n = $state(2);
  let kind = $state<"site" | "pitch">("site");
  let err = $state(false);
  const ccOfPlace = (p: string) => (findCity(geo, p, ccOf(geo, app.trip.country)) || findCity(geo, p))?.cc;
  function stayFor(p: string, k: "site" | "pitch", from: string, nn: number, cc?: string): Item {
    return {
      id: uid(), cat: "stay", hint: `camp:${k}`, status: "idea", name: t(k === "site" ? "camp.site" : "camp.pitch", { place: p }), from, to: addDays(from, nn),
      options: [{ id: uid(), label: t(k === "site" ? "camp.siteEst" : "camp.pitchEst"), estimate: true,
        price: { mode: "unit", currency: "EUR", unit: campNight(k, cc, persons), basis: "night" },
        query: { place: p, checkin: from, checkout: addDays(from, nn), adults: persons, childAges: [], rooms: 1 },
        source: { name: `${CAMPING_SOURCE}, ${FEES_AS_OF}` } }]
    };
  }
  function addStation(e: Event) {
    e.preventDefault();
    const p = place.trim();
    if (!p || !(n >= 1)) return;
    const c = findCity(geo, p, ccOf(geo, app.trip.country)) || findCity(geo, p);
    err = !c;
    if (!c) return;
    const from = camps.at(-1)?.to || app.trip.from || new Date().toISOString().slice(0, 10);
    const it = stayFor(p, kind, from, n, c.cc);
    app.trip.items.push(it);
    if (!app.trip.from) app.trip.from = from;
    if (!app.trip.to || it.to! > app.trip.to) app.trip.to = it.to;
    setDetailed("stay", true);
    place = ""; n = 2;
  }
  function setKind(it: Item, k: "site" | "pitch") {
    const p = it.options[0]?.query?.place || "";
    const nx = stayFor(p, k, it.from!, nightsBetween(it.from, it.to), ccOfPlace(p));
    it.hint = nx.hint; it.name = nx.name;
    it.options[0] = { ...nx.options[0], id: it.options[0]?.id || nx.options[0].id };
  }
  function setNights(it: Item, nn: number) {
    if (!(nn >= 1) || !it.from) return;
    it.to = addDays(it.from, nn);
    if (it.options[0]?.query) it.options[0].query.checkout = it.to;
    if (app.trip.to && it.to > app.trip.to) app.trip.to = it.to;
  }
  function remove(it: Item) { app.trip.items = app.trip.items.filter(i => i.id !== it.id); }

  // Mietcamper als Posten: Tagespreis × Tage, Mehrkilometer über dem Paket, Pauschalen, Kaution nur Kreditkarte
  const plan = $derived(camper ? roadPlan(app.trip) : null);
  const km = $derived(plan ? plan.etappen.reduce((s, e) => s + e.km, 0) : 0);
  const days = $derived(tripDays(app.trip));
  const extraKm = $derived(Math.max(0, Math.round(km - CAMPER_RENT.kmPerDay * days)));
  function addRent() {
    setDetailed("transport", true);
    const src = `${CAMPER_RENT.source}, ${FEES_AS_OF}`;
    const it: Item = {
      id: uid(), cat: "transport", icon: "car", hint: "camper:rent", status: "idea", name: t("camp.rent"),
      note: t("camp.rentNote", { km: CAMPER_RENT.kmPerDay, v: eur(CAMPER_RENT.extraKm) }),
      options: [{ id: uid(), label: t("camp.rentEst"), estimate: true, price: { mode: "unit", currency: "EUR", unit: CAMPER_RENT.day, qty: days },
        extras: [
          { id: `camp:service:${uid()}`, kind: "other", label: t("camp.service"), amount: CAMPER_RENT.service, basis: "booking", pay: "extra", est: true, source: src },
          { id: `camp:cleaning:${uid()}`, kind: "cleaning", amount: CAMPER_RENT.cleaning, basis: "booking", pay: "extra", est: true, off: true, source: src },
          ...(extraKm > 0 ? [{ id: `camp:km:${uid()}`, kind: "other" as const, label: t("camp.extraKm", { km: extraKm }), amount: Math.round(extraKm * CAMPER_RENT.extraKm), basis: "booking" as const, pay: "extra" as const, est: true, source: src }] : [])
        ],
        deposit: { amount: CAMPER_RENT.deposit, how: "credit", est: true, for: t("camp.rent") } }]
    };
    app.trip.items.push(it);
    showItem(it.id);
  }
</script>

{#if show}
  <div class="search-row camper">
    <div class="cp-mode chips" role="radiogroup" aria-label={t("camp.mode")}>
      <button type="button" role="radio" class="chip" class:on={!camper} aria-checked={!camper} disabled={access.readonly} onclick={() => setMode(false)}>🚗 {t("camp.car")}</button>
      <button type="button" role="radio" class="chip" class:on={!!camper} aria-checked={!!camper} disabled={access.readonly} onclick={() => setMode(true)}>🚐 {t("camp.camper")}</button>
    </div>
    {#if camper}
      <div class="cp-opts chips">
        <button type="button" class="chip sm" class:on={!camper.own} disabled={access.readonly} onclick={() => setOwn(false)}>{t("camp.rented")}</button>
        <button type="button" class="chip sm" class:on={!!camper.own} disabled={access.readonly} onclick={() => setOwn(true)}>{t("camp.own")}</button>
        <span class="cp-sep"></span>
        <button type="button" class="chip sm" class:on={!camper.heavy} disabled={access.readonly} onclick={() => setHeavy(false)}>{t("camp.light")}</button>
        <button type="button" class="chip sm" class:on={!!camper.heavy} disabled={access.readonly} onclick={() => setHeavy(true)}>{t("camp.heavy")}</button>
      </div>
      {#if camper.heavy}<p class="small cp-heavy">⚠ {t("camp.heavyHint")}</p>{/if}

      <p class="cp-t"><b>{t("camp.stations")}</b> <span class="muted small">{t("camp.stationsHint")}</span></p>
      {#if camps.length}
        <ul class="cp-list">
          {#each camps as c (c.id)}
            <li>
              <span class="cp-p">{c.hint === "camp:pitch" ? "🅿" : "⛺"} <b>{c.options[0]?.query?.place || c.name}</b></span>
              {#if access.readonly}<span class="small">{nightsBetween(c.from, c.to)}</span>
              {:else}
                <label class="small cp-n">{t("camp.nights")}<input class="n sm" type="number" min="1" max="60" value={nightsBetween(c.from, c.to)} onchange={e => setNights(c, Number(e.currentTarget.value))} /></label>
                <select class="cp-k" aria-label={t("camp.kind")} value={c.hint === "camp:pitch" ? "pitch" : "site"} onchange={e => setKind(c, e.currentTarget.value as "site" | "pitch")}>
                  <option value="site">⛺ {t("camp.kSite")}</option><option value="pitch">🅿 {t("camp.kPitch")}</option>
                </select>
              {/if}
              <span class="num small">{t("xc.ca")} {eur(c.options[0]?.price.unit || 0)} / {t("camp.night")}</span>
              {#if !access.readonly}<button type="button" class="linkbtn cp-del" aria-label={t("camp.remove")} onclick={() => remove(c)}>×</button>{/if}
            </li>
          {/each}
        </ul>
      {/if}
      {#if !access.readonly}
        <form class="cp-add" onsubmit={addStation}>
          <input class="cp-place" placeholder={t("camp.placePh")} aria-label={t("camp.place")} bind:value={place} />
          <label class="small cp-n">{t("camp.nights")}<input class="n sm cp-nn" type="number" min="1" max="60" bind:value={n} /></label>
          <select class="cp-kind" aria-label={t("camp.kind")} bind:value={kind}><option value="site">⛺ {t("camp.kSite")}</option><option value="pitch">🅿 {t("camp.kPitch")}</option></select>
          <button class="btn sm cp-go" type="submit">+ {t("camp.addStation")}</button>
          {#if err}<small class="err">{t("camp.unknown")}</small>{/if}
        </form>
      {/if}
      <p class="small muted">{t("camp.findPitch")} <PartnerLinks ids={partnersOf("camping")} /></p>

      {#if !camper.own}
        <div class="cp-rent">
          {#if !access.readonly && !rent}<button class="btn sm cp-rentadd" onclick={addRent}>+ {t("camp.rentAdd", { v: eur(CAMPER_RENT.day), d: eur(CAMPER_RENT.deposit) })}</button>{/if}
          <p class="small muted">{t("camp.compare")} <PartnerLinks ids={partnersOf("camper")} /></p>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .camper { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); }
  .cp-opts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .cp-sep { width: 10px; }
  .cp-t, .cp-heavy, .camper p { margin: 0; }
  .cp-heavy { color: var(--warn); }
  .cp-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .cp-list li { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; }
  .cp-p { min-width: 9em; }
  .cp-n { display: inline-flex; gap: 4px; align-items: center; }
  .cp-n input { width: 4em; }
  .cp-add { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
  .cp-place { flex: 1 1 12em; }
  .cp-del { font-size: 16px; padding: 0 4px; }
</style>
