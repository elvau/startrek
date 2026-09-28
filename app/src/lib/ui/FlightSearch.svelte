<script lang="ts">
  /*
   * Flüge suchen (wie im Artefakt): mehrere Abflughäfen einzeln abfragen und vergleichen, Anfahrt einrechnen,
   * feste Daten (± Tage) oder flexibler Zeitraum mit „spätestens zuhause“ und Nächten per Schieberegler.
   */
  import { app } from "../store.svelte";
  import { eur } from "../calc";
  import { airportsOf } from "../calc/travel";
  import { dayShort, nights, time } from "../format";
  import Modal from "./Modal.svelte";
  import DualRange from "./DualRange.svelte";
  import { FLIGHTS_URL, compareRow, deadline, defaultQuery, fmtMin, nearestAirports, rate, searchFlights, stopsText, takeOffer, type CompareRow, type Rated } from "../flights/app";
  import type { FlightQuery, OfferLeg, SourceStatus } from "../flights/types";

  let { onclose }: { onclose: () => void } = $props();

  const K = "rk-flight-search";
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(K) || "{}"); } catch {}

  const trip = app.trip;
  const base = defaultQuery(trip);
  const known = airportsOf(trip);
  // Abflughäfen: eigene Auswahl (gemerkt) oder die 4 nächsten zum Wohnort
  const savedAps = Array.isArray(saved.aps) && (saved.aps as string[]).length ? (saved.aps as string[]) : null;
  let custom = $state(!!savedAps);
  let aps = $state<string[]>(savedAps ?? nearestAirports(trip));
  const allCodes = $derived([...new Set([...known.map(a => a.code), ...aps])]);
  let extra = $state("");

  let mode = $state<"flex" | "fixed">((saved.mode as "flex" | "fixed") || "flex");
  let to = $state(base.to);
  // flexibel
  let rFrom = $state(base.depart);
  let rTo = $state(base.latest || "");
  let rToTime = $state((saved.rToTime as string) || "22:00");
  let lo = $state(base.nightsMin || 7);
  let hi = $state(base.nightsMax || 14);
  const span = $derived(rFrom && rTo ? nights(rFrom, rTo) : null);
  // feste Daten
  let out = $state(base.depart);
  let ret = $state(base.ret || "");
  let flexDays = $state(Number(saved.flexDays ?? 0));
  // für beide
  let maxStops = $state(Number(saved.maxStops ?? 1));
  let bags = $state(saved.bags !== false);
  let noSelf = $state(saved.noSelf !== false);
  let withAccess = $state(saved.withAccess !== false);

  const pax = { adults: base.adults, children: base.children, infants: base.infants };
  const n = pax.adults + pax.children + pax.infants;
  const people = [`${pax.adults} Erw.`, pax.children && `${pax.children} ${pax.children === 1 ? "Kind" : "Kinder"}`, pax.infants && `${pax.infants} ${pax.infants === 1 ? "Baby" : "Babys"}`].filter(Boolean).join(" · ");

  let busy = $state(false);
  let progress = $state("");
  let error = $state("");
  let list = $state<Rated[] | null>(null);
  let rows = $state<CompareRow[]>([]);
  let sources = $state<SourceStatus[]>([]);
  let lateOut = $state(0);
  let sort = $state<"price" | "time" | "direct">("price");
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>();
  let ctrl: AbortController | undefined;

  function toggleAp(code: string) {
    aps = aps.includes(code) ? aps.filter(c => c !== code) : [...aps, code];
    custom = true;
  }
  function addAp(e: Event) {
    e.preventDefault();
    const c = extra.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(c) && !aps.includes(c)) { aps = [...aps, c]; custom = true; }
    extra = "";
  }
  function resetAps() { aps = nearestAirports(trip); custom = false; }

  const shown = $derived.by(() => {
    const l = [...(list || [])];
    if (sort === "direct") return l.filter(o => !o.out.stops && !o.back?.stops);
    if (sort === "time") return l.sort((a, b) => a.out.minutes + (a.back?.minutes || 0) + 120 * a.accessHours - (b.out.minutes + (b.back?.minutes || 0) + 120 * b.accessHours));
    return l;
  });
  const dur = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")} h`;

  async function search(e: Event) {
    e.preventDefault();
    error = ""; list = null; rows = []; sources = []; lateOut = 0;
    if (!aps.length) { error = "Bitte mindestens einen Abflughafen auswählen."; return; }
    if (mode === "flex") {
      if (span == null) { error = "Bitte früheste Hinreise und spätestes Zuhause-Datum eintragen."; return; }
      if (span < 1) { error = "Das Zuhause-Datum liegt vor der frühesten Hinreise."; return; }
    } else if (!out) { error = "Bitte ein Hinflugdatum eintragen."; return; }
    if (n > 9) { error = `Es sind ${n} Personen dabei. Kiwi sucht höchstens 9 Personen pro Buchung. Unter „Wer fährt mit“ einzelne auf „nicht dabei“ stellen und je Familie suchen.`; return; }
    try { localStorage.setItem(K, JSON.stringify({ aps: custom ? aps : [], mode, rToTime, flexDays, maxStops, bags, noSelf, withAccess })); } catch {}

    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    const q: Omit<FlightQuery, "from"> = mode === "flex"
      ? { to, depart: rFrom, latest: rTo, nightsMin: lo, nightsMax: hi, ...pax, maxStops, bags, selfTransfer: !noSelf, currency: "EUR" }
      : { to, depart: out, ret: ret || undefined, flexDays, ...pax, maxStops, bags, selfTransfer: !noSelf, currency: "EUR" };
    const dl = mode === "flex" ? deadline(rTo, rToTime) : NaN;
    const all: Rated[] = [], cmp: CompareRow[] = [], src = new Map<string, SourceStatus>();
    let late = 0;
    try {
      for (const [i, code] of aps.entries()) {
        progress = `${code} (${i + 1} von ${aps.length})`;
        try {
          const r = await searchFlights({ ...q, from: code }, ctrl.signal);
          r.sources.forEach(s => { const p = src.get(s.id); src.set(s.id, p ? { ...p, ok: p.ok || s.ok, count: p.count + s.count, error: p.ok ? p.error : s.error } : { ...s }); });
          let rated = r.offers.map(o => rate(trip, o, code, withAccess));
          if (!isNaN(dl)) { const before = rated.length; rated = rated.filter(o => !isNaN(o.home) && o.home <= dl); late += before - rated.length; }
          all.push(...rated);
          const err = r.sources.find(s => s.configured && !s.ok)?.error;
          cmp.push(compareRow(code, rated, rated.length ? undefined : err));
        } catch (err) {
          if ((err as Error).name === "AbortError") throw err;
          cmp.push(compareRow(code, [], (err as Error).message));
        }
      }
      list = all.sort((a, b) => a.total - b.total).slice(0, 40);
      rows = cmp.sort((a, b) => (a.count ? a.total : Infinity) - (b.count ? b.total : Infinity));
      sources = [...src.values()];
      lateOut = late;
    } catch (err) {
      if ((err as Error).name !== "AbortError") error = (err as Error).message;
    } finally { busy = false; progress = ""; }
  }

  function take(o: Rated) {
    // gefundene Flüge rechnen detailliert; weitere Treffer kommen als Angebote in denselben Posten
    app.trip.detail ||= {};
    app.trip.detail.flights = true;
    into = takeOffer(app.trip, o, into).id;
    taken[o.id + o.origin] = true;
  }
  function takeCheapest(code: string) {
    const o = list?.filter(x => x.origin === code).sort((a, b) => a.total - b.total)[0];
    if (o) take(o);
  }
</script>

{#snippet legRow(dir: string, l: OfferLeg)}
  <div class="fs-leg">
    <span class="fs-dir">{dir}</span>
    <span><b>{dayShort(l.dep)} {time(l.dep)} → {time(l.arr)}</b> · {dur(l.minutes)} · {stopsText(l.stops)}</span>
    <span class="muted">{l.route.join(" → ")} · {l.carriers.join(" / ")}</span>
  </div>
{/snippet}

<Modal title="Flüge suchen" {onclose} wide>
  <form class="fs-form" onsubmit={search}>
    <div>
      <span class="dlabel">Abflughäfen (werden einzeln abgefragt und verglichen)</span>
      <div class="chips fs-aps">
        {#each allCodes as c (c)}
          {@const a = known.find(x => x.code === c)}
          <button type="button" class="chip" class:on={aps.includes(c)} aria-pressed={aps.includes(c)} title={a?.name || c} onclick={() => toggleAp(c)}>{c}</button>
        {/each}
        <span class="fs-add"><input class="inp" bind:value={extra} placeholder="+ Code" maxlength="3" aria-label="weiteren Flughafen hinzufügen (IATA-Code)" onkeydown={e => { if (e.key === "Enter") addAp(e); }} /></span>
      </div>
      <p class="muted small">
        {#if custom}Eigene Auswahl. <button type="button" class="linkbtn" onclick={resetAps}>Standard wiederherstellen</button>
        {:else}Standard: die 4 nächsten Flughäfen zum Wohnort.{/if}
      </p>
    </div>

    <div class="chips fs-mode" role="radiogroup" aria-label="Daten">
      <button type="button" role="radio" aria-checked={mode === "fixed"} class="chip" class:on={mode === "fixed"} onclick={() => (mode = "fixed")}>Feste Daten</button>
      <button type="button" role="radio" aria-checked={mode === "flex"} class="chip" class:on={mode === "flex"} onclick={() => (mode = "flex")}>Flexibler Zeitraum</button>
    </div>

    <label class="f">Nach<input bind:value={to} placeholder="z. B. Split oder SPU" required /></label>

    {#if mode === "flex"}
      <div class="fs-flexbox">
        <div class="ed-row">
          <label class="f">Früheste Hinreise<input type="date" bind:value={rFrom} required /></label>
          <label class="f">Spätestens zuhause am<input type="date" bind:value={rTo} min={rFrom} required /></label>
          <label class="f fs-time">um<input type="time" bind:value={rToTime} /></label>
        </div>
        {#if span == null}
          <p class="muted small">Bitte früheste Hinreise und spätestes Zuhause-Datum eintragen.</p>
        {:else if span < 1}
          <p class="warnline small">Das Zuhause-Datum liegt vor der frühesten Hinreise.</p>
        {:else}
          <DualRange bind:lo bind:hi min={1} max={span} label="Reisedauer (Nächte vor Ort)" unit="Nächte" maxNote="max. {span} (ganzer Zeitraum)" />
        {/if}
        <p class="muted small">Gesucht wird der günstigste Hin- und Rückflugtag im Zeitraum. Rückflüge, bei denen ihr nach Landung, Gepäck und Heimfahrt nicht rechtzeitig zuhause wärt, fallen raus.</p>
      </div>
    {:else}
      <div class="ed-row">
        <label class="f">Hin am<input type="date" bind:value={out} required /></label>
        <label class="f">Rück am <small class="muted">(leer = nur Hinweg)</small><input type="date" bind:value={ret} min={out} /></label>
        <label class="f fs-sel">± Tage<select bind:value={flexDays}>{#each [0, 1, 2, 3] as v (v)}<option value={v}>{v}</option>{/each}</select></label>
      </div>
    {/if}

    <div class="ed-row fs-opts">
      <label class="f fs-sel">Umstiege max.<select bind:value={maxStops}>{#each [0, 1, 2] as v (v)}<option value={v}>{v}</option>{/each}</select></label>
      <label class="in-row"><input type="checkbox" bind:checked={bags} /> 1 Koffer pro Person</label>
      <label class="in-row"><input type="checkbox" bind:checked={noSelf} /> ohne Self-Transfer</label>
      <label class="in-row"><input type="checkbox" bind:checked={withAccess} /> Anfahrt einrechnen</label>
    </div>
    <p class="muted small">{people} (aus „Wer fährt mit“). Preise gelten für alle zusammen.</p>
    {#if !FLIGHTS_URL}<p class="warnline small">Der Such-Dienst ist noch nicht eingerichtet. Anleitung: docs/FLUGSUCHE.md im Projekt.</p>{/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? `Suche läuft… ${progress}` : aps.length > 1 ? `${aps.length} Flughäfen vergleichen` : "Suchen"}</button>
  </form>

  {#if error}<p class="err small">{error}</p>{/if}

  {#if list}
    {#if sources.length}
      <div class="fs-src small">
        {#each sources as s (s.id)}
          <span class:ok={s.ok} class:off={!s.configured} title={s.error || ""}>{s.name}: {s.ok ? `${s.count} Treffer` : s.configured ? "Fehler" : "noch nicht eingerichtet"}</span>
        {/each}
      </div>
    {/if}
    {#if rows.length > 1}
      <div class="fs-cmp-wrap">
        <table class="fs-cmp">
          <thead><tr><th>Ab</th><th>Flug</th><th class="c-x">Anfahrt</th><th>gesamt</th><th class="c-x">Zeit</th><th>direkt</th><th></th></tr></thead>
          <tbody>
            {#each rows as r, i (r.code)}
              {#if r.count}
                <tr class:cheap={i === 0}>
                  <td><b>{r.code}</b><small class="muted fs-apn">{known.find(a => a.code === r.code)?.name || ""}</small></td>
                  <td class="num">{eur(r.price)}</td>
                  <td class="num muted c-x">{r.access ? eur(r.access) : "0 €"}</td>
                  <td class="num"><b>{eur(r.total)}</b></td>
                  <td class="num c-x">{Math.round(r.hours)} h</td>
                  <td class="num">{r.direct != null ? eur(r.direct) : "nein"}</td>
                  <td><button class="btn sm" onclick={() => takeCheapest(r.code)}>Wählen</button></td>
                </tr>
              {:else}
                <tr class="muted"><td><b>{r.code}</b></td><td colspan="6">{r.error}</td></tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
      <p class="muted small">Reisezeit = Flug + zweimal Anfahrt. Gesamt {withAccess ? "inkl." : "ohne"} Anfahrt.</p>
    {/if}
    {#if lateOut}<p class="muted small">{lateOut} {lateOut === 1 ? "Verbindung" : "Verbindungen"} aussortiert, weil ihr zu spät zuhause wärt.</p>{/if}

    {#if list.length}
      <div class="chips fs-sort" role="radiogroup" aria-label="Sortierung">
        <button type="button" class="chip" class:on={sort === "price"} onclick={() => (sort = "price")}>Günstigste</button>
        <button type="button" class="chip" class:on={sort === "time"} onclick={() => (sort = "time")}>Schnellste</button>
        <button type="button" class="chip" class:on={sort === "direct"} onclick={() => (sort = "direct")}>Nur direkt</button>
      </div>
      <p class="muted small">{list.length} beste Treffer über {rows.length > 1 ? "alle Flughäfen" : aps[0]} · sortiert nach Preis {withAccess ? "inkl. Anfahrt" : ""} · {n} Pers.</p>
      <div class="fs-list">
        {#each shown as o (o.id + o.origin)}
          <article class="fs-res">
            <div class="fs-top">
              <span class="pill-ap">ab {o.out.from}</span>
              <b class="num fs-price">{eur(o.total)}</b>
              <span class="fs-badge">{o.sourceName}</span>
            </div>
            <p class="muted small fs-sub">Flug {eur(o.price)}{withAccess && o.access ? ` + Anfahrt ${eur(o.access)}` : ""}{n > 1 ? ` · ${eur(o.total / n)} p. P.` : ""}{o.baggage ? ` · ${o.baggage.checked} Koffer` : ""}</p>
            <div class="fs-pills">
              {#if o.nights != null}<span class="pill-n">{o.nights} Nächte vor Ort</span>{/if}
              {#if !isNaN(o.home)}<span class="pill-h">zuhause ca. {fmtMin(o.home)}</span>{/if}
              {#if o.accessHours}<span class="pill-h">Anfahrt ca. {hm(o.accessHours)}</span>{/if}
            </div>
            {@render legRow("Hin", o.out)}
            {#if o.back}{@render legRow("Rück", o.back)}{/if}
            <div class="fs-acts">
              <button class="btn primary sm" disabled={taken[o.id + o.origin]} onclick={() => take(o)}>{taken[o.id + o.origin] ? "✓ Übernommen" : "Übernehmen"}</button>
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
      <p class="muted small">Keine passenden Flüge gefunden. Datum, Umstiege oder Flughäfen ändern.</p>
    {/if}
  {/if}
</Modal>
