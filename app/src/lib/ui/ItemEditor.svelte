<script lang="ts">
  import { untrack } from "svelte";
  import Help from "./Help.svelte";
  import { entryCurrency, fromShown, toShown } from "../currency.svelte";
  import { t, tn } from "../i18n/index.svelte";
  /* Bearbeiten eines Postens: oben Name, Status und Suche, der Rest eingeklappt mit Zusammenfassung */
  import { hhKey, isActive, uid, type Extra, type FlightLeg, type Item, type Option, type Status } from "../model";
  import { app, calc, removeItem } from "../store.svelte";
  import type { Key } from "../i18n/index.svelte";
  import { activeOption, ageClass, eur, followed, parseNum } from "../calc";
  import { dateDE, dayShort, time } from "../format";
  import { dayRange } from "../itinerary";
  import { kassen, kasseName } from "../ledger";
  import { openStaySearch } from "../stays/open.svelte";
  import { openFlightSearch } from "../flights/open.svelte";

  let { item }: { item: Item } = $props();
  const STATUS: Status[] = ["idea", "chosen", "booked", "paid", "dropped"];

  const opt = $derived(activeOption(item, app.trip) || item.options[0]);
  const all = $derived(!item.participants);

  function addOption() {
    const base = opt ? JSON.parse(JSON.stringify(opt)) : { price: { mode: "person", currency: entryCurrency() } };
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
    if (!id && !item.options.length) item.options.push({ id: uid(), label: "", price: { mode: "person", currency: entryCurrency() } });
  }
  // Bezahlt: wer hat wie viel gezahlt (für die Kasse); reicht es, ist der Posten bezahlt
  // Kassen wie in der Kasse: Familie gemeinsam oder einzelne Erwachsene (Mannschaft)
  const kList = $derived(kassen(app.trip));
  const hhList = $derived(kList.map(k => k.id));
  const net = $derived(calc.T.items[item.id]?.net || 0);
  const paidSum = $derived((item.payments || []).reduce((a, p) => a + (p.amount || 0), 0));
  let payBy = $state("");
  let payAmt = $state("");
  function addPay() {
    const x = payAmt.trim() ? parseNum(payAmt) : toShown(Math.max(0, net - paidSum));
    const by = payBy || hhList[0];
    if (!(x > 0) || !by) return;
    item.payments = [...(item.payments || []), { amount: Math.round(fromShown(x) * 100) / 100, by, at: new Date().toISOString().slice(0, 10) }];
    if (paidSum + fromShown(x) >= net - 0.5 && item.status !== "dropped") item.status = "paid";
    payAmt = "";
  }
  function dropPay(i: number) {
    item.payments = (item.payments || []).filter((_, k) => k !== i);
    if (!item.payments.length) delete item.payments;
  }
  // Tag im Plan (Erlebnisse, Transport …): Tag und optional Uhrzeit, wie „Noch ohne Tag“ im Tagesplan
  const planDays = $derived(item.cat === "flights" || item.cat === "stay" ? [] : dayRange(app.trip));
  const dayOf = $derived(item.day?.slice(0, 10) || "");
  const timeOf = $derived(item.day && item.day.length >= 16 ? item.day.slice(11, 16) : "");
  function setDay(d: string, tm = timeOf) { if (d) item.day = tm ? `${d}T${tm}` : d; else delete item.day; }
  // Suche im eigenen Fenster; danach ist man wieder am Posten
  function search() {
    if (isStay) openStaySearch({ itemId: item.id }); else openFlightSearch({ itemId: item.id });
  }
  // neuer Posten ohne Preis: Preis (bei Flügen auch die Zeiten) gleich aufgeklappt; nur beim Öffnen, nicht beim Tippen
  const fresh = untrack(() => !calc.T.items[item.id]?.net);
  // Nebenkosten und Kaution (#169)
  const XKINDS: Extra["kind"][] = ["citytax", "tax", "cleaning", "resort", "bag", "seat", "toll", "vignette", "visa", "tips", "insurance", "driver", "other"];
  const XBASES: Extra["basis"][] = ["booking", "person", "personNight", "night", "day", "personDay", "percent"];
  const XPAYS: Extra["pay"][] = ["onsite", "extra", "included"];
  const DHOWS = ["credit", "card", "cash", "transfer"] as const;
  function addExtra() {
    if (!opt) return;
    opt.extras = [...(opt.extras || []), { id: uid(), kind: isStay ? "citytax" : "other", amount: 0, basis: isStay ? "personNight" : "booking", pay: "onsite" }];
  }
  function setDeposit(d: Partial<NonNullable<Option["deposit"]>>) {
    if (!opt) return;
    const next = { amount: 0, ...opt.deposit, ...d };
    if (!next.how) delete next.how;
    if (!(next.amount > 0) && !next.how) delete opt.deposit; else opt.deposit = next;
  }
  const xcSum = $derived.by(() => {
    const ex = calc.T.items[item.id]?.extras;
    const parts = [];
    if (ex?.added) parts.push(`+ ${ex.est ? `${t("xc.ca")} ` : ""}${eur(ex.added)}`);
    if (ex?.deposit) parts.push(`🔒 ${eur(ex.deposit)}`);
    return parts.join(" · ") || "—";
  });
  // Zusammenfassungen der eingeklappten Abschnitte
  const outL = $derived(opt?.legs?.find(l => l.dir === "out"));
  const backL = $derived(opt?.legs?.find(l => l.dir === "back"));
  const legSum = (l: FlightLeg | undefined, w: string) => l?.dep ? `${w} ${dayShort(l.dep)} ${time(l.dep)} ${l.from}→${l.to}` : "";
  const timesSum = $derived(main ? t("ie.like", { name: main.name }) : [legSum(outL, t("fl.out")), legSum(backL, t("fl.back"))].filter(Boolean).join(" · ") || t("ie.open"));
  const priceSum = $derived(`${eur(net)}${item.options.length > 1 ? ` · ${tn("n.offers", item.options.length)}` : ""}`);
  const whoSum = $derived(all ? t("all") : people.filter(p => item.participants!.includes(p.id)).map(p => p.name).join(", "));
  const paySum = $derived(paidSum ? t("ie.paidOf", { paid: eur(paidSum), total: eur(net) }) : t("ie.paidNone"));
  const num = (v: string) => (v === "" ? undefined : Number(String(v).replace(",", ".")));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="editor" onclick={e => e.stopPropagation()}>
  <!-- Das Wesentliche: Name, Status, Suche; der Rest eingeklappt mit Zusammenfassung -->
  <div class="ed-row">
    <label class="f grow">{t("ie.name")}<input bind:value={item.name} placeholder={t("ie.namePh")} /></label>
  </div>
  <div class="seg" role="radiogroup" aria-label={t("ie.status")}>
    {#each STATUS as k}
      <button role="radio" aria-checked={item.status === k} class:on={item.status === k} data-s={k} onclick={() => (item.status = k)}>{t(`status.${k}` as Key)}</button>
    {/each}
    <Help k="status" />
  </div>
  {#if isStay || isFlight}
    <!-- mitfliegen „wie Flug …“: Knopf sucht einen eigenen Flug -->
    <div><button class="btn primary ed-search" class:fs-item={isFlight} class:st-item={isStay} onclick={search}>
      {isStay ? `🛏 ${t("st.open")}` : main ? `✈ ${t("ie.searchOwn")}` : `✈ ${t("fs.open")}${item.participants ? ` ${t("ie.forWho", { who: [...new Set(app.trip.travelers.filter(x => item.participants!.includes(x.id)).map(hhKey))].join(", ") })}` : ""}`}</button></div>
  {/if}

  {#if isStay}
    <details class="ed-acc" data-sec="period">
      <summary><span class="dlabel">{t("ie.period")}</span><span class="ed-sum">{item.from && item.to ? `${dateDE(item.from)} – ${dateDE(item.to)}` : t("ie.open")}</span></summary>
      <div class="ed-row">
        <label class="f">{t("ie.checkin")}<input type="date" bind:value={item.from} /></label>
        <label class="f">{t("hh.departure")}<input type="date" bind:value={item.to} min={item.from} /></label>
        <span class="muted ed-note">{t("ie.nightsHint")}</span>
      </div>
    </details>
  {/if}

  {#if planDays.length}
    <details class="ed-acc ie-day" data-sec="day">
      <summary><span class="dlabel">{t("ie.day")}</span><span class="ed-sum">{dayOf ? `${dayShort(dayOf)}${timeOf ? ` ${timeOf}` : ""}` : t("ie.dayNone")}</span></summary>
      <div class="ed-row">
        <label class="f">{t("ie.day")}
          <select value={dayOf} onchange={e => setDay(e.currentTarget.value)}>
            <option value="">{t("ie.dayNone")}</option>
            {#each planDays as d, i (d)}<option value={d}>{t("day.n", { n: i + 1 })} · {dayShort(d)}</option>{/each}
          </select>
        </label>
        {#if dayOf}<label class="f">{t("ie.dayTime")}<input type="time" value={timeOf} onchange={e => setDay(dayOf, e.currentTarget.value)} /></label>{/if}
      </div>
    </details>
  {/if}

  {#if isFlight && (others.length || (opt && !main))}
    <details class="ed-acc" data-sec="times" open={fresh && !main}>
      <summary><span class="dlabel">{t("ie.times")}</span><span class="ed-sum">{timesSum}</span></summary>
      {#if others.length}
        <div class="chips">
          <button class="chip" class:on={!main} onclick={() => setFollow(undefined)}>{t("ie.ownFlight")}</button>
          {#each others as o (o.id)}<button class="chip" class:on={main?.id === o.id} onclick={() => setFollow(o.id)}>{t("ie.like", { name: o.name || t("ie.otherFlight") })}</button>{/each}
        </div>
        {#if main}
          <p class="muted small">{t("ie.sameFlight", { name: main.name })}. {t("ie.samePrice")}{opt?.price.adult ? ` (${eur(opt.price.adult)})` : ""}, {t("ie.sameRest")}</p>
        {/if}
      {/if}
      {#if opt && !main}
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
        <label class="check"><input type="checkbox" checked={item.access !== false} onchange={e => (item.access = e.currentTarget.checked ? undefined : false)} /> {t("ie.access")}</label>
      {/if}
    </details>
  {/if}
  {#if item.cat === "transport"}
    <label class="check ie-arrival"><input type="checkbox" checked={!!item.arrival} onchange={e => (item.arrival = e.currentTarget.checked || undefined)} /> {t("ie.arrival")}</label>
  {/if}

  {#if opt && !main}
    <details class="ed-acc" data-sec="price" open={fresh}>
      <summary><span class="dlabel">{t("ie.priceOffers")}</span><span class="ed-sum">{priceSum}</span></summary>
      {#if item.options.length > 1}
        <div class="chips">
          {#each item.options as o, i (o.id)}
            <button class="chip" class:on={o.id === opt?.id} onclick={() => (item.chosen = o.id)}>{o.label || t("ie.offerN", { n: i + 1 })}</button>
          {/each}
        </div>
      {/if}
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
    </details>
  {/if}

  <details class="ed-acc" data-sec="who">
    <summary><span class="dlabel">{t("ie.who")} <Help k="who" /></span><span class="ed-sum">{whoSum}</span></summary>
    <div class="chips">
      <button class="chip" class:on={all} onclick={() => (item.participants = undefined)}>{t("all")}</button>
      {#each people as p (p.id)}
        {@const cls = ageClass(p.age, app.trip.settings, p.kind)}
        <button class="chip" class:on={all || item.participants?.includes(p.id)} onclick={() => togglePerson(p.id)}>{p.name || t("trav.noName")}{#if cls !== "adult"} <em class="age-pill {cls}">{t(`age.class.${cls}` as Key)}</em>{/if}</button>
      {/each}
    </div>
  </details>

  {#if item.status !== "idea" && item.status !== "dropped"}
    <details class="ed-acc ie-pay" data-sec="pay">
      <summary><span class="dlabel">{t("ie.paidBy")} <Help k="paid" /></span><span class="ed-sum">{paySum}</span></summary>
      {#each item.payments || [] as p, i (i)}
        <div class="ie-p"><span>{p.by ? kasseName(app.trip, p.by) : "?"}</span><b class="num">{eur(p.amount)}</b>{#if p.at}<small class="muted">{dateDE(p.at)}</small>{/if}
          <button class="dp-del" aria-label={t("ks.remove", { text: `${p.by ? kasseName(app.trip, p.by) : ""} ${eur(p.amount)}` })} onclick={() => dropPay(i)}>×</button></div>
      {/each}
      <div class="ed-row">
        <label class="f">{t("ks.paidBy")}<select class="ie-payby" value={payBy || hhList[0]} onchange={e => (payBy = e.currentTarget.value)}>{#each kList as k (k.id)}<option value={k.id}>{k.name}</option>{/each}</select></label>
        <label class="f">{t("ks.amount")}<input class="n ie-payamt" inputmode="decimal" bind:value={payAmt} placeholder={String(toShown(Math.max(0, net - paidSum)))} /></label>
        <button class="btn sm ie-payadd" onclick={addPay}>+ {t("ie.payAdd")}</button>
      </div>
    </details>
  {/if}

  {#if opt && !main}
    <details class="ed-acc ie-xc" data-sec="extras">
      <summary><span class="dlabel">{t("ie.extras")}</span><span class="ed-sum">{xcSum}</span></summary>
      {#each opt.extras || [] as x (x.id)}
        <div class="ed-row ie-x">
          <label class="f">{t("ie.xKind")}<select value={x.kind} onchange={e => (x.kind = e.currentTarget.value as Extra["kind"])}>{#each XKINDS as k (k)}<option value={k}>{t(`xc.kind.${k}` as Key)}</option>{/each}</select></label>
          <label class="f">{t("ie.xAmount")}<input class="n ie-xamt" inputmode="decimal" value={x.amount} oninput={e => (x.amount = num(e.currentTarget.value) ?? 0)} /></label>
          <label class="f">{t("ie.xBasis")}<select value={x.basis} onchange={e => (x.basis = e.currentTarget.value as Extra["basis"])}>{#each XBASES as b (b)}<option value={b}>{b === "percent" ? `% ${t("xc.ofPrice")}` : t(`xc.basis.${b}` as Key)}</option>{/each}</select></label>
          <label class="f">{t("ie.xPay")}<select value={x.pay} onchange={e => (x.pay = e.currentTarget.value as Extra["pay"])}>{#each XPAYS as w (w)}<option value={w}>{t(`xc.pay.${w}` as Key)}</option>{/each}</select></label>
          {#if x.basis === "person" || x.basis === "personNight" || x.basis === "personDay"}
            <label class="f">{t("ie.xFree")}<input class="n sm" inputmode="numeric" placeholder="–" value={x.freeUpTo ?? ""} oninput={e => { const v = num(e.currentTarget.value); if (v == null) delete x.freeUpTo; else x.freeUpTo = v; }} /></label>
          {/if}
          <label class="check"><input type="checkbox" checked={!!x.est} onchange={e => (x.est = e.currentTarget.checked || undefined)} /> {t("xc.estimated")}</label>
          <button class="linkbtn danger" onclick={() => (opt.extras = (opt.extras || []).filter(y => y.id !== x.id))}>{t("ie.xRemove")}</button>
        </div>
      {/each}
      <div><button class="linkbtn ie-xadd" onclick={addExtra}>+ {t("ie.xAdd")}</button></div>
      <div class="ed-row ie-dep">
        <label class="f">🔒 {t("dep.title")}<input class="n ie-depamt" inputmode="decimal" placeholder="0" value={opt.deposit?.amount ?? ""} oninput={e => setDeposit({ amount: num(e.currentTarget.value) ?? 0 })} /></label>
        <label class="f">{t("ie.depHow")}<select class="ie-dephow" value={opt.deposit?.how ?? ""} onchange={e => setDeposit({ how: (e.currentTarget.value || undefined) as NonNullable<Option["deposit"]>["how"] })}>
          <option value="">–</option>{#each DHOWS as h (h)}<option value={h}>{t(`dep.how.${h}` as Key)}</option>{/each}
        </select></label>
      </div>
    </details>
  {/if}

  <details class="ed-acc" data-sec="note">
    <summary><span class="dlabel">{t("ie.note")}</span><span class="ed-sum">{item.note || "—"}</span></summary>
    <label class="f grow">{t("ie.note")}<input bind:value={item.note} placeholder={t("ie.notePh")} /></label>
  </details>

  <div class="ed-foot">
    <button class="linkbtn danger" onclick={() => removeItem(item.id)}>{t("ie.delete")}</button>
    <button class="btn primary" onclick={() => (app.editing = null)}>{t("done")}</button>
  </div>
</div>

<style>
  .ie-p { display: flex; gap: 8px; align-items: baseline; font-size: 14px; }
  .ie-p .dp-del { border: 0; background: none; color: var(--ink-3); font-size: 16px; cursor: pointer; }
  .ed-acc { border: 1px solid var(--line); border-radius: 12px; padding: 0 12px; }
  .ed-acc[open] { padding-bottom: 12px; }
  .ed-acc > summary { list-style: none; cursor: pointer; display: flex; gap: 10px; align-items: baseline; padding: 10px 0; }
  .ed-acc > summary::-webkit-details-marker { display: none; }
  .ed-acc > summary::after { content: "▾"; margin-inline-start: auto; color: var(--ink-3); }
  .ed-acc[open] > summary::after { content: "▴"; }
  .ed-acc > summary .dlabel { flex: none; }
  .ed-sum { font-size: 13.5px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .ed-acc > :not(summary) + :not(summary) { margin-top: 8px; }
</style>
