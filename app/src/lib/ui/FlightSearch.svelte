<script lang="ts">
  /* Flüge suchen: über den Such-Dienst bei mehreren Anbietern gleichzeitig; Ergebnis als Angebot übernehmen */
  import { app } from "../store.svelte";
  import { eur } from "../calc";
  import { dayShort, nights, time } from "../format";
  import Modal from "./Modal.svelte";
  import { FLIGHTS_URL, defaultQuery, searchFlights, stopsText, takeOffer } from "../flights/app";
  import type { FlightOffer, OfferLeg, SearchResult } from "../flights/types";

  let { onclose }: { onclose: () => void } = $props();
  const K_FROM = "rk-flight-from";
  let last = "";
  try { last = localStorage.getItem(K_FROM) || ""; } catch {}
  const q = $state(defaultQuery(app.trip, last));
  // Standard: flexibel (früheste Abreise, späteste Rückkehr, Spanne an Nächten); sonst feste Daten, hin und zurück
  let flex = $state(true);
  let oneWay = $state(false);
  let busy = $state(false);
  let error = $state("");
  let result = $state<SearchResult | null>(null);
  let sort = $state<"price" | "time" | "direct">("price");
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>();
  let ctrl: AbortController | undefined;

  const people = $derived([q.adults && `${q.adults} ${q.adults === 1 ? "Erwachsener" : "Erwachsene"}`, q.children && `${q.children} ${q.children === 1 ? "Kind" : "Kinder"}`, q.infants && `${q.infants} ${q.infants === 1 ? "Baby" : "Babys"}`].filter(Boolean).join(", "));
  const n = $derived(q.adults + q.children + q.infants);
  const shown = $derived.by(() => {
    const list = [...(result?.offers || [])];
    if (sort === "direct") return list.filter(o => !o.out.stops && !(o.back?.stops));
    if (sort === "time") return list.sort((a, b) => a.out.minutes + (a.back?.minutes || 0) - (b.out.minutes + (b.back?.minutes || 0)));
    return list;
  });
  const dur = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;

  async function search(e: Event) {
    e.preventDefault();
    error = ""; result = null; busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    try { localStorage.setItem(K_FROM, q.from); } catch {}
    const query = flex
      ? { ...q, ret: undefined, nightsMax: Math.max(q.nightsMin || 1, q.nightsMax || 1) }
      : { ...q, latest: undefined, nightsMin: undefined, nightsMax: undefined, ret: oneWay ? undefined : q.ret || undefined };
    try { result = await searchFlights(query, ctrl.signal); }
    catch (err) { if ((err as Error).name !== "AbortError") error = (err as Error).message; }
    finally { busy = false; }
  }
  function take(o: FlightOffer) {
    // gefundene Flüge rechnen detailliert; weitere Treffer kommen als Angebote in denselben Posten
    app.trip.detail ||= {};
    app.trip.detail.flights = true;
    into = takeOffer(app.trip, o, into).id;
    taken[o.id] = true;
  }
  const swap = () => ([q.from, q.to] = [q.to, q.from]);
</script>

{#snippet legRow(dir: string, l: OfferLeg)}
  <div class="fs-leg">
    <span class="fs-dir">{dir}</span>
    <span><b>{dayShort(l.dep)} {time(l.dep)} → {time(l.arr)}</b> · {dur(l.minutes)} · {stopsText(l.stops)}</span>
    <span class="muted">{l.route.join(" → ")} · {l.carriers.join(" / ")}</span>
  </div>
{/snippet}

<Modal title="Flüge suchen" {onclose}>
  <form class="fs-form" onsubmit={search}>
    <div class="ed-row fs-route">
      <label class="f grow">Von<input bind:value={q.from} placeholder="z. B. Düsseldorf oder DUS" required /></label>
      <button type="button" class="x fs-swap" onclick={swap} aria-label="Start und Ziel tauschen" title="Tauschen">⇄</button>
      <label class="f grow">Nach<input bind:value={q.to} placeholder="z. B. Split oder SPU" required /></label>
    </div>
    <div class="chips fs-mode" role="radiogroup" aria-label="Daten">
      <button type="button" role="radio" aria-checked={flex} class="chip" class:on={flex} onclick={() => (flex = true)}>Flexibel</button>
      <button type="button" role="radio" aria-checked={!flex} class="chip" class:on={!flex} onclick={() => (flex = false)}>Feste Daten</button>
    </div>
    {#if flex}
      <div class="ed-row">
        <label class="f">Früheste Abreise<input type="date" bind:value={q.depart} required /></label>
        <label class="f">Späteste Rückkehr<input type="date" bind:value={q.latest} min={q.depart} required /></label>
      </div>
      <div class="ed-row fs-nights">
        <span class="dlabel">Nächte vor Ort</span>
        <span class="fs-nn-row">
          <label class="in-row">von <input class="inp num" type="number" min="1" max="60" bind:value={q.nightsMin} required aria-label="mindestens Nächte" /></label>
          <label class="in-row">bis <input class="inp num" type="number" min={q.nightsMin || 1} max="60" bind:value={q.nightsMax} required aria-label="höchstens Nächte" /></label>
          <span class="muted small">Nächte</span>
        </span>
      </div>
    {:else}
      <div class="ed-row">
        <label class="f">Hin<input type="date" bind:value={q.depart} required /></label>
        {#if !oneWay}<label class="f">Zurück<input type="date" bind:value={q.ret} min={q.depart} required /></label>{/if}
        <label class="in-row fs-one"><input type="checkbox" bind:checked={oneWay} /> nur Hinflug</label>
      </div>
    {/if}
    <p class="muted small">{people} (aus „Wer fährt mit“). Preise gelten für alle zusammen.</p>
    {#if !FLIGHTS_URL}
      <p class="warnline small">Der Such-Dienst ist noch nicht eingerichtet. Anleitung: docs/FLUGSUCHE.md im Projekt.</p>
    {/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? "Suche läuft…" : "Flüge suchen"}</button>
  </form>

  {#if error}<p class="err small">{error}</p>{/if}
  {#if busy}<p class="muted small fs-busy">Frage die Anbieter gleichzeitig ab, das dauert ein paar Sekunden…</p>{/if}

  {#if result}
    <div class="fs-src small">
      {#each result.sources as s (s.id)}
        <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}: {s.ok ? `${s.count} Treffer` : s.configured ? "Fehler" : "noch nicht eingerichtet"}</span>
      {/each}
    </div>
    {#if result.offers.length}
      <div class="chips fs-sort" role="radiogroup" aria-label="Sortierung">
        <button type="button" class="chip" class:on={sort === "price"} onclick={() => (sort = "price")}>Günstigste</button>
        <button type="button" class="chip" class:on={sort === "time"} onclick={() => (sort = "time")}>Schnellste</button>
        <button type="button" class="chip" class:on={sort === "direct"} onclick={() => (sort = "direct")}>Nur direkt</button>
      </div>
      <div class="fs-list">
        {#each shown as o (o.id)}
          <article class="fs-res">
            <div class="fs-top">
              <b class="num fs-price">{eur(o.price)}</b>
              {#if n > 1}<span class="muted small">{eur(o.price / n)} pro Person</span>{/if}
              {#if o.back}<span class="small fs-nn">{nights(o.out.dep.slice(0, 10), o.back.dep.slice(0, 10))} Nächte</span>{/if}
              <span class="fs-badge">{o.sourceName}</span>
            </div>
            {@render legRow("Hin", o.out)}
            {#if o.back}{@render legRow("Zurück", o.back)}{/if}
            {#if o.baggage}<p class="muted small fs-bag">Gepäck inklusive: {o.baggage.checked ? `${o.baggage.checked}× Koffer` : "kein Koffer"}{o.baggage.cabin ? `, ${o.baggage.cabin}× Handgepäck` : ""}{o.baggage.personal ? `, ${o.baggage.personal}× kleine Tasche` : ""}</p>{/if}
            <div class="fs-acts">
              <button class="btn primary sm" disabled={taken[o.id]} onclick={() => take(o)}>{taken[o.id] ? "✓ Übernommen" : "Übernehmen"}</button>
              {#if o.url}<a class="btn sm" href={o.url} target="_blank" rel="noopener noreferrer">Beim Anbieter ↗</a>{/if}
              <button class="btn sm" disabled title="Direkt in der App buchen kommt bald">Hier buchen <small>bald</small></button>
            </div>
          </article>
        {:else}
          <p class="muted small">Keine Direktflüge gefunden.</p>
        {/each}
      </div>
      {#if into}<p class="muted small">Übernommene Flüge stehen als Angebote in einem Posten im Kapitel Flüge. Dort kannst du vergleichen und eins wählen.</p>{/if}
    {:else}
      <p class="muted small">Keine Flüge gefunden. Andere Schreibweise oder einen Flughafen-Code (z. B. DUS) probieren.</p>
    {/if}
  {/if}
</Modal>
