<script lang="ts">
  /*
   * Wichtiges zur Reise, oben unter der Überschrift (ersetzt die frühere Karte „Einreise & Tipps“ im Tagesplan).
   * Dringendes (Reisewarnung, Einreise) steht aufgeklappt, Sicherheitshinweise und besondere Orte einzeilig bis zum
   * Antippen. Gelesen bzw. erledigt je Person; wer man selbst ist, kommt aus „Ich bin“ im Personenverzeichnis.
   * Abgehakte sind minimiert und lassen sich wieder öffnen. Zähler in Rot (important.ts).
   * Reisepässe prüft die Seite nur, wenn die Buchungsdaten im Konto ohnehin geladen sind bzw. auf Knopfdruck; das Ablaufdatum
   * bleibt im Browser.
   */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { dir } from "../directory.svelte";
  import { GENERAL_LINKS, hintsFor, tripCountries, type Hint } from "../hints";
  import { itinerary } from "../itinerary";
  import { airportData, ensureAirports, ensureGeo, geo } from "../geo/geo.svelte";
  import { ccOf } from "../geo/places";
  import { countryName, locOf } from "../geo/locations";
  import { flagOf } from "../format";
  import { groupLabel } from "../groups";
  import { isActive, uid } from "../model";
  import { adviceUrl, type AdviceMap } from "../advice";
  import { loadAdvice } from "../adviceApp";
  import { entryFor, loadVisa, type EntryKind, type VisaData } from "../visa";
  import { doneIds, importantPoints, isOpen, isUrgent, markDone, reopen, type Point } from "../important";
  import { showItem } from "./showItem";
  import { EES_LINKS, MIN_VALID, type MinValid } from "../borders";
  import { docs, loadDocs } from "../traveldocs.svelte";
  import { cloud } from "../cloud/cloud.svelte";

  let visa = $state<VisaData | null>(null);
  let advice = $state<AdviceMap>({});
  $effect(() => { void loadVisa().then(d => (visa = d)); void loadAdvice().then(m => (advice = m)); });
  // Länder aus Reiseland und Flughäfen: Orts- und Flughafendaten laden
  $effect(() => { void ensureGeo(app.trip).catch(() => {}); void ensureAirports().catch(() => {}); });

  const countries = $derived(tripCountries(app.trip, n => (n ? ccOf(geo, n) : null), c => locOf(airportData, c, "airport")?.cc));
  const places = $derived([...new Set(itinerary(app.trip).map(d => d.place).filter(Boolean))]);
  // Ablauf der Reisepässe (nur aus dem Konto, nur im Browser)
  const passports = $derived(docs.status === "ready" ? Object.fromEntries(app.trip.travelers.filter(x => x.personId && docs.map[x.personId]?.passExpiry).map(x => [x.id, docs.map[x.personId!].passExpiry!])) : {});
  const canCheck = $derived(!!cloud.user && docs.status !== "ready" && docs.status !== "loading" && app.trip.travelers.some(x => x.personId));
  const points = $derived(importantPoints({ trip: app.trip, countries, hints: hintsFor(app.trip, countries, places), visa, advice, passports }));
  const done = $derived(app.trip.done || {});
  const open = $derived(points.filter(p => isOpen(p, done)));
  const closed = $derived(points.filter(p => !isOpen(p, done)));
  /** man selbst in dieser Reise („Ich bin“ im Personenverzeichnis) */
  const meId = $derived(dir.me ? app.trip.travelers.find(x => x.personId === dir.me)?.id : undefined);
  let more = $state(false);
  let unfolded = $state<Record<string, boolean>>({});

  const LEVEL: Record<string, Key> = { warning: "aa.warning", partial: "aa.partial", situation: "aa.situation" };
  const ENT: Record<EntryKind, Key> = { home: "ent.home", free: "ent.free", eta: "ent.eta", evisa: "ent.evisa", arrival: "ent.arrival", visa: "ent.visa", none: "ent.none", unknown: "ent.unknown" };
  const ICON: Record<string, string> = { warn: "⛔", entry: "🛂", border: "🛃", pass: "🪪", place: "📍" };
  const icon = (p: Point) => (p.kind === "aa" ? (p.level === "situation" ? "⚠️" : "⛔") : ICON[p.kind]);
  const date = (iso: string) => iso.split("-").reverse().join(".");
  const validText = (v: MinValid) => t(`imp.valid.${v.months ? "m" : "d"}${v.from === "entry" ? "Entry" : "Exit"}` as Key, { n: v.months || v.days || 0 });
  function title(p: Point) {
    if (p.kind === "aa") return `${flagOf(p.cc!)} ${countryName(p.cc!)}: ${t(LEVEL[p.level!])}`;
    if (p.kind === "entry") return `${flagOf(p.cc!)} ${t("imp.entry", { c: countryName(p.cc!) })}`;
    if (p.kind === "border") return t("imp.border.t");
    if (p.kind === "pass") return t("imp.pass.t", { name: p.persons![0].name });
    return t(`hint.${p.hint!.id}.t` as Key);
  }
  function text(p: Point) {
    if (p.kind === "aa") return t("imp.aaText") + (p.advice?.modified ? ` ${t("imp.aaChanged", { d: date(p.advice.modified) })}` : "");
    if (p.kind === "border") return t("imp.border.x");
    if (p.kind === "pass") return t("imp.pass.x", { d: date(p.pass!.expires), c: countryName(p.cc!), r: date(p.pass!.needed) });
    if (p.hint) return t(`hint.${p.hint.id}.x` as Key);
    const k = p.persons?.find(x => x.kind && x.kind !== "unknown");
    return k ? t(ENT[k.kind!], { n: k.days ?? 0 }) : t("ent.unknown");
  }
  const links = (p: Point) => (p.kind === "aa" ? [{ label: t("aa.link"), url: adviceUrl(p.advice!) }] : p.kind === "border" ? EES_LINKS : p.hint?.links || []);
  const isTask = (p: Point) => p.kind === "entry" || p.kind === "pass";
  const verb = (p: Point) => (isTask(p) ? t("imp.done") : t("imp.read"));

  // abhaken schreibt in die Reise (alle Mitreisenden sehen, wer was erledigt bzw. gelesen hat)
  function edit(fn: (d: NonNullable<typeof app.trip.done>) => void) {
    const d = { ...(app.trip.done || {}) };
    fn(d);
    app.trip.done = d;
  }
  const toggle = (p: Point, id: string) => edit(d => (doneIds(p, d).includes(id) ? reopen(d, p, id) : markDone(d, p, id)));

  // Gebühren vor Ort (z. B. Galápagos) als Posten
  const hasFee = (h: Hint) => app.trip.items.some(i => i.hint === h.id);
  function addFee(h: Hint) {
    if (!h.fee || hasFee(h)) return;
    setDetailed(h.fee.cat, true);
    const it = { id: uid(), cat: h.fee.cat, name: t(`hint.${h.id}.t` as Key), status: "idea" as const, hint: h.id,
      options: [{ id: uid(), label: t("hint.estimate"), estimate: true, price: { mode: "person" as const, currency: h.fee.currency, adult: h.fee.adult, ...(h.fee.child != null ? { child: h.fee.child, infant: h.fee.child } : {}) } }] };
    app.trip.items.push(it);
    showItem(it.id);
  }

  // Einreise je Land und Staatsangehörigkeit im Überblick (auch ohne Handlungsbedarf, z. B. „visumfrei bis 90 Tage“)
  const entries = $derived.by(() => {
    if (!visa) return [];
    const act = app.trip.travelers.filter(isActive);
    return countries.map(cc => {
      const gs = new Map<string, { kind: EntryKind; days?: number; names: string[]; nat: string }>();
      for (const p of act) {
        const nat = p.nat || "DE", e = entryFor(visa, nat, cc), k = `${nat}|${e.kind}|${e.days ?? ""}`;
        if (!gs.has(k)) gs.set(k, { ...e, names: [], nat });
        gs.get(k)!.names.push(p.name || "?");
      }
      return { cc, gs: [...gs.values()].filter(g => g.kind !== "home") };
    }).filter(x => x.gs.length);
  });
  const mixed = $derived(new Set(app.trip.travelers.filter(isActive).map(p => p.nat || "DE")).size > 1);
</script>

{#snippet persons(p: Point)}
  {@const ok = doneIds(p, done)}
  <div class="imp-persons">
    {#if meId && p.persons!.some(x => x.id === meId) && !access.readonly}
      <button class="btn sm" class:primary={!ok.includes(meId)} onclick={() => toggle(p, meId)}>{ok.includes(meId) ? `✓ ${t("imp.byMe")}` : `✓ ${verb(p)}`}</button>
    {/if}
    <span class="muted small">{t(isTask(p) ? "imp.donePersons" : "imp.readPersons", { a: ok.length, b: p.persons!.length })}</span>
    {#each p.persons! as x (x.id)}
      <button class="chip" class:on={ok.includes(x.id)} aria-pressed={ok.includes(x.id)} disabled={access.readonly} onclick={() => toggle(p, x.id)}>{ok.includes(x.id) ? "✓ " : ""}{x.name}</button>
    {/each}
    {#if !access.readonly && p.persons!.length > 1 && ok.length < p.persons!.length}<button class="linkbtn" onclick={() => edit(d => markDone(d, p))}>{t("imp.allPersons")}</button>{/if}
  </div>
{/snippet}

{#snippet body(p: Point)}
  <p>{text(p)}</p>
  {#if p.valid}<p class="imp-valid">🪪 {validText(p.valid)}</p>{/if}
  {#if links(p).length || p.hint?.fee}
    <p class="imp-links">
      {#each links(p) as l (l.url)}<a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}
      {#if p.hint?.fee && !access.readonly}{#if hasFee(p.hint)}<small class="muted">✓ {t("hint.feeAdded")}</small>{:else}<button class="linkbtn imp-fee" onclick={() => addFee(p.hint!)}>+ {t("hint.fee")}</button>{/if}{/if}
    </p>
  {/if}
  {#if p.persons}{@render persons(p)}{:else if !access.readonly}<div class="imp-persons"><button class="btn sm" onclick={() => edit(d => markDone(d, p))}>✓ {verb(p)}</button></div>{/if}
{/snippet}

{#if points.length || countries.length}
  <section class="imp" aria-labelledby="imp-h">
    <div class="imp-top">
      <h2 id="imp-h"><span aria-hidden="true">❗</span> {t("imp.title")}</h2>
      {#if open.length}<span class="imp-badge" aria-label={tn("imp.openN", open.length)}>{open.length}</span>{:else}<span class="imp-ok">✓ {t("imp.allDone")}</span>{/if}
      <button class="linkbtn imp-more" aria-expanded={more} onclick={() => (more = !more)}>{closed.length ? t("imp.doneN", { n: closed.length }) : t("imp.details")} {more ? "▴" : "▾"}</button>
    </div>

    {#each open as p (p.key)}
      {#if isUrgent(p) || unfolded[p.key]}
        <article class="imp-card imp-{p.kind}" class:imp-hard={p.kind === "warn" || p.level === "warning"} data-key={p.key}>
          <div class="imp-head"><span class="imp-ic" aria-hidden="true">{icon(p)}</span><b>{title(p)}</b>
            {#if !isUrgent(p)}<button class="linkbtn imp-fold" aria-label={t("imp.fold")} onclick={() => (unfolded[p.key] = false)}>▴</button>{/if}</div>
          {@render body(p)}
        </article>
      {:else}
        <button class="imp-line imp-{p.kind}" data-key={p.key} aria-expanded="false" onclick={() => (unfolded[p.key] = true)}>
          <span aria-hidden="true">{icon(p)}</span> <span class="imp-lt">{title(p)}</span> <span aria-hidden="true">▾</span>
        </button>
      {/if}
    {/each}

    {#if more}
      <div class="imp-details">
        {#if closed.length}
          <ul class="imp-closed">
            {#each closed as p (p.key)}
              <li><span aria-hidden="true">{icon(p)}</span> {title(p)}{#if !access.readonly} <button class="linkbtn" onclick={() => edit(d => reopen(d, p))}>{t("imp.reopen")}</button>{/if}</li>
            {/each}
          </ul>
        {/if}
        {#if entries.length}
          <ul class="imp-entries">
            {#each entries as x (x.cc)}
              <li><b>{flagOf(x.cc)} {countryName(x.cc)}</b>
                {#each x.gs as g (g.nat + g.kind)}<span>{#if mixed}{groupLabel(g.names, -1)} ({flagOf(g.nat)}):&nbsp;{/if}{t(ENT[g.kind], { n: g.days ?? 0 })}</span>{/each}
                {#if MIN_VALID[x.cc]}<span>🪪 {validText(MIN_VALID[x.cc])}</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if canCheck}<p class="small"><button class="linkbtn imp-check" onclick={() => void loadDocs()}>🪪 {t("imp.checkPass")}</button> <span class="muted">{t("imp.checkPassNote")}</span></p>{/if}
        <p class="muted small">{mixed ? t("hint.leadMixed") : t("hint.lead")}{#if visa?.asOf} {t("hint.visaSource", { d: visa.asOf.split("-").reverse().join(".") })}{/if}</p>
        <p class="small">{t("hint.general")}{#each GENERAL_LINKS as l (l.url)} <a href={l.url} target="_blank" rel="noopener noreferrer">{l.label} ↗</a>{/each}</p>
      </div>
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
  .imp-pass { border-inline-start-color: #d0342c; }
  .imp-valid { font-size: 13.5px; color: var(--ink-2); }
  .imp-head { display: flex; gap: 8px; align-items: baseline; }
  .imp-fold { margin-inline-start: auto; }
  .imp-line { display: flex; align-items: center; gap: 8px; width: 100%; text-align: start; padding: 8px 14px; border: 0; border-radius: 12px; background: var(--paper, #fff); box-shadow: var(--shadow); font: inherit; font-size: 14.5px; color: inherit; cursor: pointer; border-inline-start: 4px solid var(--warn, #d08a12); }
  .imp-line.imp-place { border-inline-start-color: var(--c-plan, #3b6fd8); }
  .imp-lt { flex: 1; font-weight: 600; }
  .imp-links { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13.5px; }
  .imp-persons { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 2px; }
  .imp-persons .chip.on { background: color-mix(in srgb, var(--ok, #2e8b57) 18%, transparent); }
  .imp-details { display: flex; flex-direction: column; gap: 6px; padding: 10px 14px; border-radius: 12px; background: var(--paper-2); font-size: 14px; }
  .imp-details p { margin: 0; }
  .imp-closed, .imp-entries { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; color: var(--ink-2); }
  .imp-entries li { display: flex; flex-wrap: wrap; gap: 2px 10px; }
</style>
