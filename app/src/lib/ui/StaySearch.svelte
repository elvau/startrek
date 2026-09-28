<script lang="ts">
  /*
   * Unterkünfte suchen (wie im Artefakt): Booking.com und Trivago gleichzeitig, zusammengeführt nach Preis.
   * Treffer kommen als Angebote in einen Unterkunft-Posten, Preis für den ganzen Aufenthalt.
   */
  import { app } from "../store.svelte";
  import { eur } from "../calc";
  import { dateDE, nights } from "../format";
  import Modal from "./Modal.svelte";
  import { FLIGHTS_URL } from "../flights/app";
  import { defaultStayQuery, searchStaysRemote, takeStay } from "../stays/app";
  import type { StayOffer, StayQuery, StayType } from "../stays/types";
  import type { SourceStatus } from "../flights/types";

  let { onclose }: { onclose: () => void } = $props();

  const K = "rk-stay-search";
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(K) || "{}"); } catch {}

  const trip = app.trip;
  const SOURCES = [{ id: "booking", name: "Booking.com" }, { id: "trivago", name: "Trivago" }];
  const savedType = (["whole", "hotel", "all"] as const).find(t => t === saved.type);
  const base = defaultStayQuery(trip, undefined, savedType);

  let place = $state(base.place);
  let checkin = $state(base.checkin);
  let checkout = $state(base.checkout);
  let rooms = $state(1);
  let type = $state<StayType>(base.type);
  let use = $state<string[]>(Array.isArray(saved.sources) && (saved.sources as string[]).length ? (saved.sources as string[]) : SOURCES.map(s => s.id));
  const nn = $derived(checkin && checkout ? nights(checkin, checkout) : 0);

  const g = { adults: base.adults, childAges: base.childAges };
  const n = g.adults + g.childAges.length;
  const people = `${g.adults} Erw.${g.childAges.length ? `, ${g.childAges.length} ${g.childAges.length === 1 ? "Kind" : "Kinder"} (${g.childAges.join(", ")} J.)` : ""}`;

  let busy = $state(false);
  let error = $state("");
  let list = $state<StayOffer[] | null>(null);
  let sources = $state<SourceStatus[]>([]);
  let asked = $state<StayQuery | null>(null);
  let sort = $state<"price" | "rating">("price");
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>();
  let ctrl: AbortController | undefined;

  const shown = $derived(sort === "rating" ? [...(list || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || a.total - b.total) : list || []);
  const toggleSrc = (id: string) => (use = use.includes(id) ? use.filter(x => x !== id) : [...use, id]);
  const score = (s: number) => s.toFixed(1).replace(".", ",");

  async function search(e: Event) {
    e.preventDefault();
    error = ""; list = null; sources = [];
    if (!place.trim()) { error = "Bitte einen Ort eintragen."; return; }
    if (!nn || nn < 1) { error = "Bitte An- und Abreise eintragen (Abreise nach Anreise)."; return; }
    if (!use.length) { error = "Bitte mindestens eine Quelle auswählen."; return; }
    try { localStorage.setItem(K, JSON.stringify({ type, sources: use.length < SOURCES.length ? use : [] })); } catch {}
    const q: StayQuery = { ...base, place: place.trim(), checkin, checkout, rooms: Math.max(1, Math.min(rooms, g.adults)), type, sources: use, currency: "EUR" };
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
    into = takeStay(app.trip, o, asked, into).id;
    taken[o.id] = true;
  }
</script>

<Modal title="Unterkunft suchen" {onclose} wide>
  <form class="fs-form" onsubmit={search}>
    <div class="ed-row">
      <label class="f grow">Ort<input bind:value={place} placeholder="z. B. Split" required /></label>
      <label class="f">Anreise<input type="date" bind:value={checkin} required /></label>
      <label class="f">Abreise<input type="date" bind:value={checkout} min={checkin} required /></label>
      <label class="f">Zimmer<input class="n sm" type="number" min="1" max={Math.min(10, g.adults)} bind:value={rooms} /></label>
    </div>
    <div class="ed-row fs-opts">
      <div class="chips" role="radiogroup" aria-label="Art der Unterkunft">
        <button type="button" role="radio" aria-checked={type === "whole"} class="chip" class:on={type === "whole"} onclick={() => (type = "whole")}>Ganze Unterkunft</button>
        <button type="button" role="radio" aria-checked={type === "hotel"} class="chip" class:on={type === "hotel"} onclick={() => (type = "hotel")}>Hotel</button>
        <button type="button" role="radio" aria-checked={type === "all"} class="chip" class:on={type === "all"} onclick={() => (type = "all")}>Alle</button>
      </div>
      <div class="chips" aria-label="Quellen">
        {#each SOURCES as s (s.id)}
          <button type="button" class="chip" class:on={use.includes(s.id)} aria-pressed={use.includes(s.id)} onclick={() => toggleSrc(s.id)}>{s.name}</button>
        {/each}
      </div>
    </div>
    <p class="muted small">{nn > 0 ? `${nn} ${nn === 1 ? "Nacht" : "Nächte"} · ` : ""}{people} (aus „Wer fährt mit“). Preise gelten für den ganzen Aufenthalt.</p>
    {#if !FLIGHTS_URL}<p class="warnline small">Der Such-Dienst ist noch nicht eingerichtet. Anleitung: docs/FLUGSUCHE.md im Projekt.</p>{/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? `Suche bei ${SOURCES.filter(s => use.includes(s.id)).map(s => s.name).join(" und ")}…` : "Unterkünfte suchen"}</button>
  </form>

  {#if error}<p class="err small">{error}</p>{/if}

  {#if list && asked}
    {#if sources.length}
      <div class="fs-src small">
        {#each sources as s (s.id)}
          <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}: {s.ok ? `${s.count} Treffer` : s.configured ? "Fehler" : "noch nicht eingerichtet"}</span>
        {/each}
      </div>
    {/if}
    {#if list.length}
      {@const an = nights(asked.checkin, asked.checkout) || 1}
      <div class="chips fs-sort" role="radiogroup" aria-label="Sortierung">
        <button type="button" class="chip" class:on={sort === "price"} onclick={() => (sort = "price")}>Günstigste</button>
        <button type="button" class="chip" class:on={sort === "rating"} onclick={() => (sort = "rating")}>Beste Bewertung</button>
      </div>
      <p class="muted small">{list.length} Angebote in {asked.place}, {dateDE(asked.checkin)} bis {dateDE(asked.checkout)}, {asked.rooms} {asked.rooms === 1 ? "Zimmer" : "Zimmer"} · ab {eur(list[0].total)}</p>
      <div class="fs-list">
        {#each shown as o (o.id)}
          <article class="fs-res st-res">
            {#if o.image}<img class="st-img" src={o.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={e => ((e.currentTarget as HTMLImageElement).hidden = true)} />{/if}
            <div class="st-b">
              <div class="fs-top">
                <b class="st-name">{o.name}</b>
                <span class="fs-badge">{o.sourceName}{o.via && o.via !== o.sourceName ? ` · ${o.via}` : ""}</span>
              </div>
              <div class="fs-top">
                <b class="num fs-price">{eur(o.total)}</b>
                <span class="muted small">{eur(o.total / an)} pro Nacht{n > 1 ? ` · ${eur(o.total / an / n)} p. P.` : ""}</span>
              </div>
              <div class="fs-pills">
                {#if o.score}<span class="pill-n">{score(o.score)}{o.reviews ? ` (${o.reviews.toLocaleString("de-DE")} Bew.)` : ""}</span>{/if}
                {#if o.stars}<span class="pill-h">{"★".repeat(o.stars)}</span>{/if}
                {#each o.facts || [] as f (f)}<span class="pill-h">{f}</span>{/each}
              </div>
              {#if o.place}<p class="muted small fs-sub">{o.place}</p>{/if}
              <div class="fs-acts">
                <button class="btn primary sm" disabled={taken[o.id]} onclick={() => take(o)}>{taken[o.id] ? "✓ Übernommen" : "Übernehmen"}</button>
                {#if o.url}<a class="btn sm" href={o.url} target="_blank" rel="noopener noreferrer">Beim Anbieter ↗</a>{/if}
                <button class="btn sm" disabled title="Direkt in der App buchen kommt bald">Hier buchen <small>bald</small></button>
              </div>
            </div>
          </article>
        {/each}
      </div>
      {#if into}<p class="muted small">Übernommene Unterkünfte stehen als Angebote in einem Posten im Kapitel Unterkunft. Dort kannst du vergleichen und eine wählen.</p>{/if}
    {:else}
      <p class="muted small">Keine Angebote gefunden. Anderen Ort, andere Art oder mehr Zimmer versuchen.</p>
    {/if}
  {/if}
</Modal>
