<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /* Bearbeiten eines Postens im Fokusmodus: Status, Angebote, Preis, Beteiligte */
  import { hhKey, isActive, uid, type FlightLeg, type Item, type Status } from "../model";
  import { app, removeItem } from "../store.svelte";
  import type { Key } from "../i18n/index.svelte";
  import { activeOption, ageClass, eur, followed } from "../calc";
  import { dayShort, time } from "../format";
  import { openStaySearch } from "../stays/open.svelte";
  import { openFlightSearch } from "../flights/open.svelte";

  let { item }: { item: Item } = $props();
  const STATUS: Status[] = ["idea", "chosen", "booked", "paid", "dropped"];

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

  // Mitfliegen wie im Artefakt: „Wie Flug Klein“ oder eigener Flug
  const main = $derived(followed(item, app.trip));
  const others = $derived(isFlight ? app.trip.items.filter(x => x.cat === "flights" && x.id !== item.id && !x.follow && x.status !== "dropped") : []);
  function setFollow(id: string | undefined) {
    item.follow = id;
    if (!id && !item.options.length) item.options.push({ id: uid(), label: "", price: { mode: "person", currency: "EUR" } });
  }
  const num = (v: string) => (v === "" ? undefined : Number(String(v).replace(",", ".")));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="editor" onclick={e => e.stopPropagation()}>
  <div class="ed-row">
    <label class="f grow">{t("ie.name")}<input bind:value={item.name} placeholder={t("ie.namePh")} /></label>
  </div>

  <div class="ed-sec">
    <span class="dlabel">{t("ie.status")}</span>
    <div class="seg" role="radiogroup" aria-label={t("ie.status")}>
      {#each STATUS as k}
        <button role="radio" aria-checked={item.status === k} class:on={item.status === k} data-s={k} onclick={() => (item.status = k)}>{t(`status.${k}` as Key)}</button>
      {/each}
    </div>
  </div>

  {#if item.options.length > 1}
    <div class="ed-sec">
      <span class="dlabel">{t("ie.offer")}</span>
      <div class="chips">
        {#each item.options as o, i (o.id)}
          <button class="chip" class:on={o.id === opt?.id} onclick={() => (item.chosen = o.id)}>{o.label || t("ie.offerN", { n: i + 1 })}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if isStay}
    <div class="ed-sec">
      <span class="dlabel">{t("ie.period")}</span>
      <div class="ed-row">
        <label class="f">{t("ie.checkin")}<input type="date" bind:value={item.from} /></label>
        <label class="f">{t("hh.departure")}<input type="date" bind:value={item.to} min={item.from} /></label>
        <span class="muted ed-note">{t("ie.nightsHint")}</span>
      </div>
      <div><button class="btn primary sm st-item" onclick={() => openStaySearch({ itemId: item.id })}>🔎 {t("st.open")}</button></div>
    </div>
  {/if}

  {#if isFlight && others.length}
    <div class="ed-sec">
      <span class="dlabel">{t("ie.flight")}</span>
      <div class="chips">
        <button class="chip" class:on={!main} onclick={() => setFollow(undefined)}>{t("ie.ownFlight")}</button>
        {#each others as o (o.id)}<button class="chip" class:on={main?.id === o.id} onclick={() => setFollow(o.id)}>{t("ie.like", { name: o.name || t("ie.otherFlight") })}</button>{/each}
      </div>
      {#if main}
        {@const out = opt?.legs?.find(l => l.dir === "out")}
        {@const back = opt?.legs?.find(l => l.dir === "back")}
        <p class="muted small">{t("ie.sameFlight", { name: main.name })}{out?.dep ? `: ${t("ie.sameOut", { day: dayShort(out.dep), time: time(out.dep), ap: out.from })}` : ""}{back?.dep ? `, ${t("ie.sameBack", { day: dayShort(back.dep), time: time(back.dep) })}` : ""}. {t("ie.samePrice")}{opt?.price.adult ? ` (${eur(opt.price.adult)})` : ""}, {t("ie.sameRest")}</p>
        <div><button class="btn sm fs-item" onclick={() => openFlightSearch({ itemId: item.id })}>✈ {t("ie.searchOwn")}</button></div>
      {/if}
    </div>
  {/if}

  {#if isFlight && opt && !main}
    <div class="ed-sec">
      <span class="dlabel">{t("ie.times")}</span>
      {#each [["out", t("ie.outFlight")], ["back", t("ie.backFlight")]] as [dir, l] (dir)}
        {@const L = legOf(dir as "out" | "back")}
        <div class="ed-row">
          <span class="ed-leg">{l}</span>
          <label class="f">{t("te.from")}<input class="short" maxlength="3" placeholder="DUS" value={L?.from ?? ""} oninput={e => setLeg(dir as "out", "from", e.currentTarget.value)} /></label>
          <label class="f">{t("ie.to")}<input class="short" maxlength="3" placeholder="SPU" value={L?.to ?? ""} oninput={e => setLeg(dir as "out", "to", e.currentTarget.value)} /></label>
          <label class="f">{t("ie.dep")}<input type="datetime-local" value={L?.dep ?? ""} oninput={e => setLeg(dir as "out", "dep", e.currentTarget.value)} /></label>
          <label class="f">{t("ie.arr")}<input type="datetime-local" value={L?.arr ?? ""} oninput={e => setLeg(dir as "out", "arr", e.currentTarget.value)} /></label>
          <label class="f">{t("ie.stops")}<input class="n sm" type="number" min="0" max="4" value={L?.stops ?? 0} oninput={e => setLeg(dir as "out", "stops", e.currentTarget.value)} /></label>
        </div>
      {/each}
      <div><button class="btn primary sm fs-item" onclick={() => openFlightSearch({ itemId: item.id })}>✈ {t("fs.open")}{item.participants ? ` ${t("ie.forWho", { who: [...new Set(app.trip.travelers.filter(x => item.participants!.includes(x.id)).map(hhKey))].join(", ") })}` : ""}</button></div>
      <label class="check"><input type="checkbox" checked={item.access !== false} onchange={e => (item.access = e.currentTarget.checked ? undefined : false)} /> {t("ie.access")}</label>
    </div>
  {/if}

  {#if opt && !main}
    <div class="ed-sec">
      <div class="ed-row">
        <label class="f grow">{t("ie.offer")}<input bind:value={opt.label} placeholder={t("ie.offerPh")} /></label>
        <label class="f">{t("ie.billing")}
          <select bind:value={opt.price.mode}>
            <option value="person">{t("simple.perPerson")}</option>
            <option value="unit">{t("ie.flat")}</option>
          </select>
        </label>
        <label class="f">{t("ie.currency")}<input class="short" bind:value={opt.price.currency} maxlength="3" /></label>
      </div>
      <div class="ed-row">
        {#if opt.price.mode === "person"}
          <label class="f">{t("age.adults")}{perNight ? ` / ${t("ie.night")}` : ""}<input class="n" inputmode="decimal" value={opt.price.adult ?? ""} oninput={e => (opt.price.adult = num(e.currentTarget.value))} /></label>
          <label class="f">{t("age.kids")}<input class="n" inputmode="decimal" placeholder={t("ie.likeAdult")} value={opt.price.child ?? ""} oninput={e => (opt.price.child = num(e.currentTarget.value))} /></label>
          <label class="f">{t("age.infants")}<input class="n" inputmode="decimal" placeholder={t("ie.likeChild")} value={opt.price.infant ?? ""} oninput={e => (opt.price.infant = num(e.currentTarget.value))} /></label>
        {:else}
          <label class="f">{t("ie.price")}{perNight ? ` ${t("ie.perNight")}` : ""}<input class="n" inputmode="decimal" value={opt.price.unit ?? ""} oninput={e => (opt.price.unit = num(e.currentTarget.value))} /></label>
          {#if isStay && item.from && item.to}
            <label class="f">{t("ie.applies")}
              <select value={opt.price.basis === "stay" ? "stay" : "night"} onchange={e => (opt.price.basis = e.currentTarget.value as "night" | "stay")}>
                <option value="night">{t("ie.perNight")}</option>
                <option value="stay">{t("ie.perStay")}</option>
              </select>
            </label>
            <label class="f">{t("ie.maxGuests")}<input class="n" inputmode="numeric" placeholder={t("ie.any")} value={opt.price.capacity ?? ""} oninput={e => (opt.price.capacity = num(e.currentTarget.value))} /></label>
          {:else}
            <label class="f">{t("ie.perUnit")}<input class="n" inputmode="numeric" placeholder={t("ie.any")} value={opt.price.capacity ?? ""} oninput={e => { opt.price.capacity = num(e.currentTarget.value); opt.price.multiply = !!opt.price.capacity; }} /></label>
          {/if}
        {/if}
        <label class="f">{t("ie.qty")}<input class="n" inputmode="decimal" placeholder="1" value={opt.price.qty ?? ""} oninput={e => (opt.price.qty = num(e.currentTarget.value))} /></label>
      </div>
      {#if isStay && opt.price.mode === "unit" && opt.price.capacity}
        <label class="check"><input type="checkbox" bind:checked={opt.price.multiply} /> {t("ie.multiply")}</label>
      {/if}
      <div class="ed-row">
        <button class="linkbtn" onclick={addOption}>+ {t("ie.addOffer")}</button>
        {#if item.options.length > 1}<button class="linkbtn danger" onclick={dropOption}>{t("ie.dropOffer")}</button>{/if}
      </div>
    </div>
  {/if}

  <div class="ed-sec">
    <span class="dlabel">{t("ie.who")}</span>
    <div class="chips">
      <button class="chip" class:on={all} onclick={() => (item.participants = undefined)}>{t("all")}</button>
      {#each people as p (p.id)}
        {@const cls = ageClass(p.age, app.trip.settings, p.kind)}
        <button class="chip" class:on={all || item.participants?.includes(p.id)} onclick={() => togglePerson(p.id)}>{p.name || t("trav.noName")}{#if cls !== "adult"} <em class="age-pill {cls}">{t(`age.class.${cls}` as Key)}</em>{/if}</button>
      {/each}
    </div>
  </div>

  <div class="ed-row">
    <label class="f grow">{t("ie.note")}<input bind:value={item.note} placeholder={t("ie.notePh")} /></label>
  </div>

  <div class="ed-foot">
    <button class="linkbtn danger" onclick={() => removeItem(item.id)}>{t("ie.delete")}</button>
    <button class="btn primary" onclick={() => (app.editing = null)}>{t("done")}</button>
  </div>
</div>
