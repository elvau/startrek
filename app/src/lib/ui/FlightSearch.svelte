<script lang="ts">
  /*
   * Flüge suchen (wie im Artefakt): mehrere Abflughäfen einzeln abfragen und vergleichen, Anfahrt einrechnen,
   * feste Daten (± Tage) oder flexibler Zeitraum mit „spätestens zuhause“ und Nächten per Schieberegler.
   */
  import { app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { airportsOf } from "../calc/travel";
  import { dayShort, nights, time } from "../format";
  import Modal from "./Modal.svelte";
  import DualRange from "./DualRange.svelte";
  import LocationPicker from "./LocationPicker.svelte";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf, findCity } from "../geo/places";
  import { airportsNear, areaAround, locLabel, locOf, resolveLoc, searchLocs, type Loc } from "../geo/locations";
  import { FLIGHTS_URL, compareRow, covered, deadline, defaultFlyers, defaultQuery, flyers, followFlight, fmtMin, nearestAirports, passengers, rate, searchFlights, stopsText, takeOffer, type CompareRow, type Rated } from "../flights/app";
  import { hhKey, isActive } from "../model";
  import type { FlightScope } from "../flights/open.svelte";
  import { googleFlightsLink, skyscannerLink } from "../links";
  import type { FlightQuery, OfferLeg, SourceStatus } from "../flights/types";

  let { onclose, scope = {} }: { onclose: () => void; scope?: FlightScope } = $props();

  const K = "rk-flight-search";
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(localStorage.getItem(K) || "{}"); } catch {}

  const trip = app.trip;
  // Wer fliegt (wie im Artefakt je Flug-Posten): aus dem Posten, sonst die erste Familie ohne Flug, sonst alle
  const start = (() => ({ ...scope }))();
  const item = start.itemId ? trip.items.find(i => i.id === start.itemId) : undefined;
  let who = $state<string[] | undefined>(start.ids ?? item?.participants ?? defaultFlyers(trip));
  const act = trip.travelers.filter(isActive);
  const hhs = [...new Set(act.map(hhKey))];
  const cov = covered(trip);
  const whoIds = $derived(flyers(trip, who).map(t => t.id));
  const hhOn = (h: string) => !!who && act.filter(t => hhKey(t) === h).every(t => who!.includes(t.id));
  function setWho(ids: string[] | undefined) {
    who = ids && ids.length && ids.length < act.length ? ids : undefined;
    if (!custom) aps = nearestAirports(trip, 4, who);
  }
  const toggleHh = (h: string) => { const ids = act.filter(t => hhKey(t) === h).map(t => t.id); setWho(hhOn(h) ? whoIds.filter(id => !ids.includes(id)) : [...new Set([...(who || []), ...ids])]); };
  // bei „Alle“ nimmt ein Klick die Person heraus, sonst schaltet er sie dazu oder weg
  const togglePerson = (id: string) => setWho(!who ? whoIds.filter(x => x !== id) : who.includes(id) ? who.filter(x => x !== id) : [...who, id]);
  // Mitfliegen: andere Flug-Posten, die diese Personen nicht schon enthalten
  const mains = $derived(trip.items.filter(i => i.cat === "flights" && !i.follow && i.status !== "dropped" && i.id !== item?.id && i.participants && !whoIds.some(id => i.participants!.includes(id))));
  function flyAlong(mainId: string) {
    app.trip.detail ||= {};
    app.trip.detail.flights = true;
    followFlight(app.trip, mainId, whoIds);
    onclose();
  }
  // bisher mitgeflogen: was das kostet (inkl. Anfahrt), zum Vergleich mit einem eigenen Flug
  const alongCost = $derived(item?.follow ? calc.T.items[item.id]?.net ?? null : null);
  const base = defaultQuery(trip, "", start.ids ?? item?.participants ?? defaultFlyers(trip));
  const known = airportsOf(trip);
  // Abflughäfen: eigene Auswahl (gemerkt) oder die 4 nächsten zum Wohnort
  const savedAps = Array.isArray(saved.aps) && (saved.aps as string[]).length ? (saved.aps as string[]) : null;
  let custom = $state(!!savedAps);
  let aps = $state<string[]>(savedAps ?? nearestAirports(trip, 4, start.ids ?? item?.participants ?? defaultFlyers(trip)));
  const allCodes = $derived([...new Set([...known.map(a => a.code), ...aps])]);
  // aus der Liste gewählte Abflug-Städte (z. B. LON = alle Londoner Flughäfen); alles andere ist ein Flughafen
  let apCities = $state<string[]>(Array.isArray(saved.apCities) ? (saved.apCities as string[]) : []);
  const originLoc = (code: string): Loc | null => (apCities.includes(code) ? locOf(airportData, code, "city") : locOf(airportData, code, "airport"));

  let mode = $state<"flex" | "fixed">((saved.mode as "flex" | "fixed") || "flex");
  let to = $state(base.to);
  let toLoc = $state<Loc | null>(null);
  const cc = $derived(ccOf(geo, trip.country));
  /** Ort mit Koordinaten: bekannter Ort (auch ohne Flughafen, z. B. Makarska) oder Flughafen/Stadt aus der Liste */
  function pointOf(text: string): { name: string; lat: number; lon: number; cc?: string } | null {
    const name = text.split(",")[0].trim();
    if (!name || /^[A-Za-z]{3}$/.test(name)) return null;
    const c = findCity(geo, name, cc) || findCity(geo, name);
    if (c) return { name: c.name, lat: c.lat, lon: c.lon, cc: c.cc };
    const hit = searchLocs(airportData, name, 1)[0];
    const ap = hit && (hit.lat != null ? hit : locOf(airportData, hit.airports[0], "airport"));
    return ap?.lat != null ? { name: hit.city, lat: ap.lat, lon: ap.lon!, cc: hit.cc } : null;
  }
  const areaFor = (text: string) => { const p = pointOf(text); return p ? areaAround(airportData, p) : null; };
  // Vorschläge ohne Eingabe: alle Flughäfen im Umkreis des Reiseziels, dann jeder einzeln mit Entfernung
  const nearDest = $derived.by(() => {
    const p = airportData.airports.length ? pointOf(trip.place || base.to) : null;
    if (!p) return [];
    const city = resolveLoc(airportData, p.name, cc);
    const area = areaAround(airportData, p);
    return [...(city?.kind === "city" ? [city] : []), ...(area ? [area] : []), ...airportsNear(airportData, p)];
  });
  // Ziel der Reise gleich als Auswahl: der Flughafen am Ort (Split → SPU), sonst alle im Umkreis (Makarska)
  Promise.all([ensureGeo(trip), ensureAirports()]).then(() => {
    if (toLoc || to !== base.to || !base.to) return;
    const l = resolveLoc(airportData, base.to, cc) ?? areaFor(base.to);
    if (l) { toLoc = l; to = locLabel(l); }
  });
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

  const pax = $derived(passengers(trip, who));
  const n = $derived(pax.adults + pax.children + pax.infants);
  const people = $derived([`${pax.adults} Erw.`, pax.children && `${pax.children} ${pax.children === 1 ? "Kind" : "Kinder"}`, pax.infants && `${pax.infants} ${pax.infants === 1 ? "Baby" : "Babys"}`].filter(Boolean).join(" · "));

  let busy = $state(false);
  let progress = $state("");
  let error = $state("");
  let list = $state<Rated[] | null>(null);
  let rows = $state<CompareRow[]>([]);
  let sources = $state<SourceStatus[]>([]);
  let lateOut = $state(0);
  let sort = $state<"price" | "time" | "direct">("price");
  let taken = $state<Record<string, boolean>>({});
  let into = $state<string | undefined>(item?.id);
  let ctrl: AbortController | undefined;

  function toggleAp(code: string) {
    aps = aps.includes(code) ? aps.filter(c => c !== code) : [...aps, code];
    custom = true;
  }
  function addAp(l: Loc) {
    if (!aps.includes(l.code)) { aps = [...aps, l.code]; custom = true; }
    apCities = l.kind === "city" ? [...new Set([...apCities, l.code])] : apCities.filter(c => c !== l.code);
  }
  function resetAps() { aps = nearestAirports(trip, 4, who); custom = false; }

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
    if (n > 9) { error = `Es fliegen ${n} Personen. Kiwi sucht höchstens 9 Personen pro Buchung. Oben bei „Wer fliegt“ eine Familie wählen und je Familie suchen.`; return; }
    if (!whoIds.length) { error = "Bitte oben auswählen, wer fliegt."; return; }
    // Ziel: gewählte Stadt oder Flughafen; Freitext wird nachgeschlagen („Split“ → SPU)
    const dest = toLoc ?? resolveLoc(airportData, to, cc) ?? areaFor(to);
    if (!dest && !/^[A-Za-z]{3}$/.test(to.trim())) { error = `„${to.trim()}“ nicht gefunden. Bitte einen Vorschlag aus der Liste wählen oder den Flughafen-Code eingeben.`; return; }
    // Auswahl = Name + Liste von Codes; bei einer Stadt zusätzlich ihr Stadt-Code
    const toQ = dest ? { to: dest.code, toAirports: dest.airports, ...(dest.kind === "city" ? { toCityCode: dest.code } : {}) } : { to: to.trim().toUpperCase() };
    const fromQ = (code: string) => { const l = originLoc(code); return l ? { from: l.code, fromAirports: l.airports, ...(l.kind === "city" ? { fromCityCode: l.code } : {}) } : { from: code }; };
    try { localStorage.setItem(K, JSON.stringify({ aps: custom ? aps : [], apCities: custom ? apCities.filter(c => aps.includes(c)) : [], mode, rToTime, flexDays, maxStops, bags, noSelf, withAccess })); } catch {}

    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    const q: Omit<FlightQuery, "from"> = mode === "flex"
      ? { ...toQ, depart: rFrom, latest: rTo, nightsMin: lo, nightsMax: hi, ...pax, maxStops, bags, selfTransfer: !noSelf, currency: "EUR" }
      : { ...toQ, depart: out, ret: ret || undefined, flexDays, ...pax, maxStops, bags, selfTransfer: !noSelf, currency: "EUR" };
    const dl = mode === "flex" ? deadline(rTo, rToTime) : NaN;
    const all: Rated[] = [], cmp: CompareRow[] = [], src = new Map<string, SourceStatus>();
    let late = 0;
    try {
      for (const [i, code] of aps.entries()) {
        progress = `${code} (${i + 1} von ${aps.length})`;
        try {
          const r = await searchFlights({ ...q, ...fromQ(code) }, ctrl.signal);
          r.sources.forEach(s => { const p = src.get(s.id); src.set(s.id, p ? { ...p, ok: p.ok || s.ok, count: p.count + s.count, error: p.ok ? p.error : s.error } : { ...s }); });
          let rated = r.offers.map(o => rate(trip, o, code, withAccess, who));
          if (!isNaN(dl)) { const before = rated.length; rated = rated.filter(o => !isNaN(o.home) && o.home <= dl); late += before - rated.length; }
          all.push(...rated);
          // Fehler nur zeigen, wenn keine Quelle geantwortet hat; sonst gab es schlicht keine passende Verbindung
          const err = r.sources.some(s => s.ok) ? undefined : r.sources.find(s => s.configured && !s.ok)?.error;
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
    into = takeOffer(app.trip, o, into, who).id;
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

<Modal title={item ? `Flüge suchen: ${item.name || "Flug"}` : "Flüge suchen"} {onclose} wide>
  <form class="fs-form" onsubmit={search}>
    <div class="fs-who">
      <span class="dlabel">Wer fliegt</span>
      <div class="chips">
        <button type="button" class="chip" class:on={!who} aria-pressed={!who} onclick={() => setWho(undefined)}>Alle ({act.length})</button>
        {#if hhs.length > 1}
          {#each hhs as h (h)}
            {@const ms = act.filter(t => hhKey(t) === h)}
            <button type="button" class="chip" class:on={hhOn(h)} aria-pressed={hhOn(h)} onclick={() => toggleHh(h)}>{h} ({ms.length}){#if ms.every(t => cov.has(t.id)) && !item}<small> hat Flug</small>{/if}</button>
          {/each}
        {/if}
      </div>
      <details class="more"><summary class="muted small">Einzelne Personen</summary>
        <div class="chips">{#each act as t (t.id)}<button type="button" class="chip sm" class:on={whoIds.includes(t.id)} aria-pressed={whoIds.includes(t.id)} onclick={() => togglePerson(t.id)}>{t.name}</button>{/each}</div>
      </details>
      {#if hhs.length > 1 && !who}<p class="muted small">Tipp wie im Artefakt: je Familie suchen, dann gelten eigene Abflughäfen und die eigene Anfahrt.</p>{/if}
      {#if who && mains.length && !item}
        <div class="chips fs-along"><span class="muted small">Oder mitfliegen, gleicher Flug:</span>
          {#each mains as mm (mm.id)}<button type="button" class="chip sm" onclick={() => flyAlong(mm.id)}>Wie {mm.name}</button>{/each}
        </div>
      {/if}
      {#if alongCost != null}<p class="muted small">Bisher: mitfliegen wie „{trip.items.find(i => i.id === item?.follow)?.name}“ für {eur(alongCost)} inkl. Anfahrt. Die Treffer zeigen den Unterschied; „Übernehmen“ macht daraus einen eigenen Flug.</p>{/if}
    </div>
    <div>
      <span class="dlabel">Abflughäfen (werden einzeln abgefragt und verglichen)</span>
      <div class="chips fs-aps">
        {#each allCodes as c (c)}
          {@const a = known.find(x => x.code === c)}
          {@const l = a ? null : originLoc(c)}
          <button type="button" class="chip" class:on={aps.includes(c)} aria-pressed={aps.includes(c)} title={a?.name || (l ? locLabel(l) : c)} onclick={() => toggleAp(c)}>{c}{#if l?.kind === "city"}<small>{l.name}, alle</small>{/if}</button>
        {/each}
        <LocationPicker cls="fs-add" placeholder="+ Stadt oder Code" clearOnPick onpick={addAp} />
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

    <LocationPicker label="Nach" bind:value={toLoc} bind:text={to} placeholder="Flughafen, Stadt oder Ort wählen" required near={nearDest} {areaFor} />
    {#if toLoc && toLoc.kind !== "airport"}<p class="muted small fs-note">Sucht über {toLoc.airports.length} Flughäfen: {toLoc.airports.join(", ")}. Nur einen? In der Liste den Flughafen wählen.</p>{/if}

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
    <p class="muted small">{people}{who ? ` (${[...new Set(flyers(trip, who).map(hhKey))].join(", ")})` : " (alle aus „Wer fährt mit“)"}. Preise gelten für alle zusammen, die Anfahrt {who ? ([...new Set(flyers(trip, who).map(hhKey))].length === 1 ? "nur für diese Familie" : "nur für diese Familien") : "für alle Familien"}.</p>
    {#if !FLIGHTS_URL}<p class="warnline small">Der Such-Dienst ist noch nicht eingerichtet. Anleitung: docs/FLUGSUCHE.md im Projekt.</p>{/if}
    <button class="btn primary" disabled={busy || !FLIGHTS_URL}>{busy ? `Suche läuft… ${progress}` : aps.length > 1 ? `${aps.length} Flughäfen vergleichen` : "Suchen"}</button>
    {#if to.trim() && aps.length && (mode === "flex" ? rFrom : out)}
      {@const d0 = toLoc ?? resolveLoc(airportData, to, cc)}
      {@const o0 = originLoc(aps[0])}
      {@const lq = { from: o0?.kind === "city" ? o0.airports[0] : aps[0], to: d0 ? d0.airports[0] : to.trim(), depart: mode === "flex" ? rFrom : out, ret: mode === "flex" ? rTo || undefined : ret || undefined, ...pax }}
      {@const sky = skyscannerLink(lq)}
      <p class="muted small fs-direct">Direkt beim Anbieter suchen (ab {aps[0]}): <a href={googleFlightsLink({ ...lq, from: o0?.kind === "city" ? o0.city : lq.from, to: d0 && d0.kind !== "airport" ? d0.city : lq.to })} target="_blank" rel="noopener noreferrer">Google Flüge ↗</a>{#if sky} · <a href={sky} target="_blank" rel="noopener noreferrer">Skyscanner ↗</a>{/if}</p>
    {/if}
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
            {#if alongCost != null && Math.abs(o.total - alongCost) >= 1}<p class="st-diff fs-sub" class:good={o.total < alongCost}>{o.total < alongCost ? `${eur(alongCost - o.total)} günstiger` : `${eur(o.total - alongCost)} teurer`} als mitfliegen</p>{/if}
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
