<script lang="ts">
  import { locale, t, tn } from "../i18n/index.svelte";
  /*
   * Unterkünfte suchen (wie im Artefakt): Zeitraum und Gäste aus der Anwesenheit (Flüge oder eigene Daten),
   * Booking.com und Trivago gleichzeitig, zusammengeführt nach Preis.
   * Treffer kommen als Angebote in einen Unterkunft-Posten, Preis für den ganzen Aufenthalt.
   */
  import { app } from "../store.svelte";
  import { activeOption, eur } from "../calc";
  import { dateDE, dayShort, nights, time } from "../format";
  import Modal from "./Modal.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import { guests, searchStaysRemote, takeStay } from "../stays/app";
  import { arrivals, guestsIn, hints, stayWindow } from "../stays/presence";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { airportOf, ccOf, cityForAirport, placesNear, searchParts, stayNear } from "../geo/places";
  import type { StayScope } from "../stays/open.svelte";
  import type { StayOffer, StayQuery, StayType } from "../stays/types";
  import type { SourceStatus } from "../flights/types";
  import { airbnbLink, bookingLink } from "../links";

  let { onclose, scope = {} }: { onclose: () => void; scope?: StayScope } = $props();

  const K = "rk-stay-search";
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(K) || "{}"); } catch {}

  const trip = app.trip;
  const SOURCES = [{ id: "booking", name: "Booking.com" }, { id: "trivago", name: "Trivago" }];
  // Anfangswerte aus dem Aufruf: Posten, Lücke im Plan oder ganze Reise
  const start = (() => ({ ...scope }))();
  const item = start.itemId ? trip.items.find(i => i.id === start.itemId) : undefined;
  const ids = start.ids ?? item?.participants;
  const win = stayWindow(trip, ids);

  let place = $state(start.place || trip.place || "");
  let checkin = $state(start.from || item?.from || win?.from || "");
  let checkout = $state(start.to || item?.to || win?.to || "");
  let rooms = $state(1);
  let type = $state<StayType>((["whole", "hotel", "all"] as const).find(t => t === saved.type) || "whole");
  let use = $state<string[]>(Array.isArray(saved.sources) && (saved.sources as string[]).length ? (saved.sources as string[]) : SOURCES.map(s => s.id));
  const nn = $derived(checkin && checkout ? nights(checkin, checkout) : 0);

  // Wer braucht in diesem Zeitraum ein Bett (laut Flügen), wer nur einen Teil der Nächte
  const who = $derived(nn > 0 ? guestsIn(trip, checkin, checkout, ids) : []);
  const g = $derived(guests(who.map(x => x.t)));
  const partial = $derived(who.filter(x => x.nights < nn));
  const arr = arrivals(trip).filter(a => !ids || a.ids.some(id => ids.includes(id)));

  // wie im Artefakt: Orte am Ankunfts- und Abflughafen als Vorschläge; ohne Reiseziel der Ort am Ankunftsflughafen
  ensureGeo(trip);
  const near = $derived.by(() => {
    const codes = [...new Set(arr.flatMap(a => [a.arrAp, a.depAp]).filter((c): c is string => !!c))];
    return codes.map(c => airportOf(geo, c)).filter(a => !!a).map(ap => ({
      ap: ap!, role: [arr.some(a => a.arrAp === ap!.code) && t("st.landing"), arr.some(a => a.depAp === ap!.code) && t("ie.dep")].filter(Boolean).join(` ${t("and")} `),
      places: placesNear(geo, ap!, 5), city: cityForAirport(geo, ap!)
    }));
  });
  $effect(() => { if (!place && near[0]?.city) place = near[0].city.name; });

  let busy = $state(false);
  let error = $state("");
  let list = $state<StayOffer[] | null>(null);
  let sources = $state<SourceStatus[]>([]);
  let asked = $state<StayQuery | null>(null);
  let sort = $state<"price" | "rating">("price");
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>(item?.id);
  let ctrl: AbortController | undefined;

  // bisheriger Preis des Postens für den ganzen Aufenthalt (zum Vergleichen)
  const current = $derived.by(() => {
    const it = into ? trip.items.find(i => i.id === into) : undefined;
    const o = it && activeOption(it, trip);
    if (!o || o.price.mode !== "unit" || !o.price.unit) return null;
    return { total: o.price.basis === "stay" ? o.price.unit : o.price.unit * (nights(it!.from, it!.to) || 1), url: o.source?.url };
  });

  const shown = $derived(sort === "rating" ? [...(list || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || a.total - b.total) : list || []);
  const toggleSrc = (id: string) => (use = use.includes(id) ? use.filter(x => x !== id) : [...use, id]);
  const score = (s: number) => s.toFixed(1).replace(".", ",");
  const people = (a: number, kids: number[]) => `${a} ${t("age.adultShort")}${kids.length ? `, ${tn("n.kids", kids.length)} (${kids.join(", ")} ${t("st.yearsShort")})` : ""}`;

  async function search(e: Event) {
    e.preventDefault();
    error = ""; list = null; sources = [];
    if (!place.trim()) { error = t("st.errPlace"); return; }
    if (!nn || nn < 1) { error = t("st.errDates"); return; }
    if (!who.length) { error = t("st.errNobody"); return; }
    if (!use.length) { error = t("st.errSource"); return; }
    try { localStorage.setItem(K, JSON.stringify({ type, sources: use.length < SOURCES.length ? use : [] })); } catch {}
    const sp = searchParts(geo, place.trim(), ccOf(geo, trip.country) || near[0]?.ap.cc);
    const q: StayQuery = { place: sp.place, country: sp.country || trip.country || undefined, checkin, checkout, ...g, rooms: Math.max(1, Math.min(rooms, g.adults)), type, sources: use, currency: "EUR" };
    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const r = await searchStaysRemote(q, ctrl.signal);
      list = r.offers.slice(0, 40);
      sources = r.sources;
      asked = q;
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = (err as Error).message;
    } finally { busy = false; }
  }

  function take(o: StayOffer) {
    if (!asked) return;
    // gefundene Unterkünfte rechnen detailliert; weitere Treffer kommen als Angebote in denselben Posten
    app.trip.detail ||= {};
    app.trip.detail.stay = true;
    into = takeStay(app.trip, o, asked, into, ids ?? who.map(x => x.t.id)).id;
    taken[o.id] = true;
  }
</script>

<Modal title={item ? `${t("st.open")}: ${item.name || t("stay.new")}` : t("st.open")} {onclose} wide>
  {#if arr.length}
    <div class="st-pres">
      <span class="dlabel">{arr.some(a => a.arr || a.dep) ? t("st.presFlights") : t("st.pres")}</span>
      <ul>
        {#each arr as a (a.ids.join())}
          <li>
            <b>{a.who}</b>
            {#if a.p}
              <span>{t("st.arrDep", { a: a.arr ? `${dayShort(a.arr)} ${time(a.arr)}` : dayShort(a.p.a), d: a.dep ? `${dayShort(a.dep)} ${time(a.dep)}` : dayShort(a.p.d) })} · {tn("n.nights", nights(a.p.a, a.p.d))}{a.p.src === "manual" ? ` (${t("hh.ownDates")})` : ""}</span>
              {#each hints(a) as h (h)}<small class="muted">{h}</small>{/each}
            {:else}
              <span class="muted">{t("st.presOpen")}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <form class="fs-form" onsubmit={search}>
    <div class="ed-row">
      <label class="f grow">{t("te.place")}<input bind:value={place} placeholder={t("st.placePh")} required /></label>
      <label class="f">{t("st.checkin")}<input type="date" bind:value={checkin} required /></label>
      <label class="f">{t("st.checkout")}<input type="date" bind:value={checkout} min={checkin} required /></label>
      <label class="f">{t("st.rooms")}<input class="n sm" type="number" min="1" max={Math.min(10, g.adults)} bind:value={rooms} /></label>
    </div>
    {#if near.length || trip.place}
      <div class="st-near">
        {#if trip.place}<span class="muted small">{t("st.dest")}</span><button type="button" class="chip sm" class:on={place === trip.place} onclick={() => (place = trip.place)}>{trip.place}</button>{/if}
        {#each near as n (n.ap.code)}
          {#if n.places.length}
            <span class="muted small">{t("st.atAirport", { ap: n.ap.code, role: n.role })}</span>
            {@const sug = stayNear(geo, n.ap)}
            {#each sug && !n.places.some(p => p.name === sug.name) ? [sug, ...n.places] : n.places as p (p.name)}<button type="button" class="chip sm" class:on={place === p.name} onclick={() => (place = p.name)}>{p.name} <small>{Math.round(p.km)} km</small></button>{/each}
          {/if}
        {/each}
      </div>
    {/if}
    <div class="ed-row fs-opts">
      <div class="chips" role="radiogroup" aria-label={t("st.type")}>
        <button type="button" role="radio" aria-checked={type === "whole"} class="chip" class:on={type === "whole"} onclick={() => (type = "whole")}>{t("st.whole")}</button>
        <button type="button" role="radio" aria-checked={type === "hotel"} class="chip" class:on={type === "hotel"} onclick={() => (type = "hotel")}>{t("st.hotel")}</button>
        <button type="button" role="radio" aria-checked={type === "all"} class="chip" class:on={type === "all"} onclick={() => (type = "all")}>{t("all")}</button>
      </div>
      <div class="chips" aria-label={t("st.sources")}>
        {#each SOURCES as s (s.id)}
          <button type="button" class="chip" class:on={use.includes(s.id)} aria-pressed={use.includes(s.id)} onclick={() => toggleSrc(s.id)}>{s.name}</button>
        {/each}
      </div>
    </div>
    <p class="muted small st-guests">
      {#if nn > 0}{t("range.fromTo", { a: dayShort(checkin), b: dayShort(checkout) })} · {tn("n.nights", nn)} · {/if}
      {#if who.length}<b>{tn("n.guests", who.length)}</b>: {people(g.adults, g.childAges)}{:else}{t("st.nobody")}{/if}
      · {ids ? t("st.fromOnly") : t("st.from")}
      {#if partial.length}<br />{t("stay.partial", { list: partial.map(x => t("st.partialOf", { name: x.t.name, a: x.nights, b: nn })).join(", ") })}{/if}
    </p>
    {#if !FLIGHTS_URL}<p class="warnline small">{t("search.notSetUp")}</p>{/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? t("st.busy", { src: SOURCES.filter(s => use.includes(s.id)).map(s => s.name).join(` ${t("and")} `) }) : t("st.searchBtn")}</button>
    {#if place.trim() && nn > 0}
      {@const lq = { ...searchParts(geo, place.trim(), ccOf(geo, trip.country) || near[0]?.ap.cc), checkin, checkout, ...g, rooms: Math.max(1, Math.min(rooms, g.adults)) }}
      <p class="muted small fs-direct">{t("search.direct")} <a href={bookingLink(lq)} target="_blank" rel="noopener noreferrer">Booking.com ↗</a> · <a href={airbnbLink(lq)} target="_blank" rel="noopener noreferrer">Airbnb ↗</a></p>
    {/if}
  </form>

  {#if error}<p class="err small">{error}</p>{/if}

  {#if list && asked}
    {#if sources.length}
      <div class="fs-src small">
        {#each sources as s (s.id)}
          <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}: {s.ok ? tn("n.hits", s.count) : s.configured ? t("search.error") : t("search.notConfigured")}</span>
        {/each}
      </div>
    {/if}
    {#if list.length}
      {@const an = nights(asked.checkin, asked.checkout) || 1}
      {@const n = asked.adults + asked.childAges.length}
      <div class="chips fs-sort" role="radiogroup" aria-label={t("search.sort")}>
        <button type="button" class="chip" class:on={sort === "price"} onclick={() => (sort = "price")}>{t("search.cheapest")}</button>
        <button type="button" class="chip" class:on={sort === "rating"} onclick={() => (sort = "rating")}>{t("st.bestRated")}</button>
      </div>
      <p class="muted small">{t("st.summary", { offers: tn("n.offers", list.length), place: asked.place, guests: tn("n.guests", n), people: people(asked.adults, asked.childAges), nights: tn("n.nights", an), d: dateDE(asked.checkin), rooms: asked.rooms, min: eur(list[0].total) })}</p>
      <div class="fs-list">
        {#each shown as o (o.id)}
          {@const diff = current && current.url !== o.url ? o.total - current.total : null}
          <article class="fs-res st-res" class:st-cur={current?.url === o.url}>
            {#if o.image}<img class="st-img" src={o.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={e => ((e.currentTarget as HTMLImageElement).hidden = true)} />{/if}
            <div class="st-b">
              <div class="fs-top">
                <b class="st-name">{o.name}</b>
                <span class="fs-badge">{o.sourceName}{o.via && o.via !== o.sourceName ? ` · ${o.via}` : ""}</span>
              </div>
              <div class="fs-top">
                <b class="num fs-price">{eur(o.total)}</b>
                <span class="muted small">{t("perNight", { v: eur(o.total / an) })}{n > 1 ? ` · ${t("st.ppNight", { v: eur(o.total / an / n) })}` : ""}</span>
                {#if diff != null && Math.abs(diff) >= 1}<span class="st-diff" class:good={diff < 0}>{diff < 0 ? "−" : "+"}{eur(Math.abs(diff))} {t("st.vsCurrent")}</span>{/if}
              </div>
              <div class="fs-pills">
                {#if o.score}<span class="pill-n">{score(o.score)}{o.reviews ? ` (${t("st.reviews", { n: o.reviews.toLocaleString(locale()) })})` : ""}</span>{/if}
                {#if o.stars}<span class="pill-h">{"★".repeat(o.stars)}</span>{/if}
                {#each o.facts || [] as f (f)}<span class="pill-h">{f}</span>{/each}
              </div>
              {#if o.place}<p class="muted small fs-sub">{o.place}</p>{/if}
              <div class="fs-acts">
                {#if !taken[o.id] && current?.url === o.url}<span class="pill-n">{t("st.chosen")}</span>
                {:else}<button class="btn primary sm" disabled={taken[o.id]} onclick={() => take(o)}>{taken[o.id] ? `✓ ${t("search.taken")}` : t("search.take")}</button>{/if}
                {#if o.url}<a class="btn sm" href={o.url} target="_blank" rel="noopener noreferrer">{t("search.atProvider")} ↗</a>{/if}
                <button class="btn sm" disabled title={t("search.bookSoonTitle")}>{t("search.bookHere")} <small>{t("search.soon")}</small></button>
              </div>
            </div>
          </article>
        {/each}
      </div>
      {#if into}<p class="muted small">{t("st.takenHint", { name: trip.items.find(i => i.id === into)?.name || "" })}</p>{/if}
    {:else}
      <p class="muted small">{t("st.none")}</p>
    {/if}
  {/if}
</Modal>
