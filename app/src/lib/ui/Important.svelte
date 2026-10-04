<script lang="ts">
  /*
   * Wichtiges zur Reise, oben unter der Überschrift: offene Punkte (Reisewarnung, Einreise je Person, besondere Orte) als
   * kurze Karten, bis man sie abhakt. Abgehakte sind minimiert und lassen sich wieder öffnen. Zähler in Rot (important.ts).
   */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { hintsFor, tripCountries } from "../hints";
  import { itinerary } from "../itinerary";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf } from "../geo/places";
  import { countryName, locOf } from "../geo/locations";
  import { flagOf } from "../format";
  import { adviceUrl, type AdviceMap } from "../advice";
  import { loadAdvice } from "../adviceApp";
  import { loadVisa, type EntryKind, type VisaData } from "../visa";
  import { doneIds, importantPoints, isOpen, markDone, reopen, type Point } from "../important";

  let visa = $state<VisaData | null>(null);
  let advice = $state<AdviceMap>({});
  $effect(() => { void loadVisa().then(d => (visa = d)); void loadAdvice().then(m => (advice = m)); });
  // Länder aus Reiseland und Flughäfen: Orts- und Flughafendaten laden
  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });

  const countries = $derived(tripCountries(app.trip, n => (n ? ccOf(geo, n) : null), c => locOf(airportData, c, "airport")?.cc));
  const places = $derived([...new Set(itinerary(app.trip).map(d => d.place).filter(Boolean))]);
  const points = $derived(importantPoints({ trip: app.trip, countries, hints: hintsFor(app.trip, countries, places), visa, advice }));
  const done = $derived(app.trip.done || {});
  const open = $derived(points.filter(p => isOpen(p, done)));
  const closed = $derived(points.filter(p => !isOpen(p, done)));
  let showDone = $state(false);

  const LEVEL: Record<string, Key> = { warning: "aa.warning", partial: "aa.partial", situation: "aa.situation" };
  const ENT: Record<EntryKind, Key> = { home: "ent.home", free: "ent.free", eta: "ent.eta", evisa: "ent.evisa", arrival: "ent.arrival", visa: "ent.visa", none: "ent.none", unknown: "ent.unknown" };
  const icon = (p: Point) => (p.kind === "aa" ? (p.level === "situation" ? "⚠️" : "⛔") : p.kind === "warn" ? "⛔" : p.kind === "entry" ? "🛂" : "📍");
  function title(p: Point) {
    if (p.kind === "aa") return `${flagOf(p.cc!)} ${countryName(p.cc!)}: ${t(LEVEL[p.level!])}`;
    if (p.kind === "entry") return `${flagOf(p.cc!)} ${t("imp.entry", { c: countryName(p.cc!) })}`;
    return t(`hint.${p.hint!.id}.t` as Key);
  }
  function text(p: Point) {
    if (p.kind === "aa") return t("imp.aaText");
    if (p.hint) return t(`hint.${p.hint.id}.x` as Key);
    const k = p.persons?.find(x => x.kind && x.kind !== "unknown");
    return k ? t(ENT[k.kind!], { n: k.days ?? 0 }) : t("ent.unknown");
  }
  const links = (p: Point) => (p.kind === "aa" ? [{ label: t("aa.link"), url: adviceUrl(p.advice!) }] : p.hint?.links || []);

  // abhaken schreibt in die Reise (alle Mitreisenden sehen es)
  function edit(fn: (d: NonNullable<typeof app.trip.done>) => void) {
    const d = { ...(app.trip.done || {}) };
    fn(d);
    app.trip.done = d;
  }
  const toggle = (p: Point, id: string) => edit(d => (doneIds(p, d).includes(id) ? reopen(d, p, id) : markDone(d, p, id)));
</script>

{#if points.length}
  <section class="imp" aria-labelledby="imp-h">
    <div class="imp-top">
      <h2 id="imp-h"><span aria-hidden="true">❗</span> {t("imp.title")}</h2>
      {#if open.length}<span class="imp-badge" aria-label={tn("imp.openN", open.length)}>{open.length}</span>{:else}<span class="imp-ok">✓ {t("imp.allDone")}</span>{/if}
      {#if closed.length}<button class="linkbtn imp-more" aria-expanded={showDone} onclick={() => (showDone = !showDone)}>{t("imp.doneN", { n: closed.length })} {showDone ? "▴" : "▾"}</button>{/if}
    </div>

    {#each open as p (p.key)}
      <article class="imp-card imp-{p.kind}" class:imp-hard={p.kind === "warn" || p.level === "warning"} data-key={p.key}>
        <div class="imp-head"><span class="imp-ic" aria-hidden="true">{icon(p)}</span><b>{title(p)}</b></div>
        <p>{text(p)}</p>
        {#if links(p).length}<p class="imp-links">{#each links(p) as l (l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}</p>{/if}
        {#if p.persons}
          {@const ok = doneIds(p, done)}
          <div class="imp-persons">
            <span class="muted small">{t("imp.donePersons", { a: ok.length, b: p.persons.length })}</span>
            {#each p.persons as x (x.id)}
              <button class="chip" class:on={ok.includes(x.id)} aria-pressed={ok.includes(x.id)} disabled={access.readonly} onclick={() => toggle(p, x.id)}>{ok.includes(x.id) ? "✓ " : ""}{x.name}</button>
            {/each}
            {#if !access.readonly && p.persons.length > 1}<button class="linkbtn" onclick={() => edit(d => markDone(d, p))}>{t("imp.allPersons")}</button>{/if}
          </div>
        {:else if !access.readonly}
          <div class="imp-acts"><button class="btn sm" onclick={() => edit(d => markDone(d, p))}>✓ {p.kind === "entry" ? t("imp.done") : t("imp.read")}</button></div>
        {/if}
      </article>
    {/each}

    {#if showDone && closed.length}
      <ul class="imp-closed">
        {#each closed as p (p.key)}
          <li><span aria-hidden="true">{icon(p)}</span> {title(p)}{#if !access.readonly} <button class="linkbtn" onclick={() => edit(d => reopen(d, p))}>{t("imp.reopen")}</button>{/if}</li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .imp { margin: 0 0 14px; display: flex; flex-direction: column; gap: 8px; }
  .imp-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .imp-top h2 { margin: 0; font-size: 18px; }
  .imp-badge { min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; background: #d0342c; color: #fff; font-weight: 800; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; }
  .imp-ok { color: var(--ok, #2e8b57); font-weight: 600; font-size: 14px; }
  .imp-more { margin-inline-start: auto; font-size: 13.5px; }
  .imp-card { background: var(--paper, #fff); border-radius: 14px; padding: 10px 14px; box-shadow: var(--shadow); border-inline-start: 4px solid var(--warn, #d08a12); display: flex; flex-direction: column; gap: 4px; font-size: 14.5px; }
  .imp-card p { margin: 0; }
  .imp-hard { border-inline-start-color: #d0342c; background: color-mix(in srgb, #d0342c 6%, var(--paper, #fff)); }
  .imp-place { border-inline-start-color: var(--c-plan, #3b6fd8); }
  .imp-head { display: flex; gap: 8px; align-items: baseline; }
  .imp-links { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13.5px; }
  .imp-persons, .imp-acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 2px; }
  .imp-persons .chip.on { background: color-mix(in srgb, var(--ok, #2e8b57) 18%, transparent); }
  .imp-closed { list-style: none; margin: 0; padding: 8px 12px; border-radius: 12px; background: var(--paper-2); display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--ink-2); }
</style>
