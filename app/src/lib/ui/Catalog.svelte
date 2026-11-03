<script lang="ts">
  import { ask, tell } from "./ask.svelte";
  /*
   * Reisekatalog (#646, Entwurf mit Dani 02.11., Handy zuerst): Liste nach Entfernung ab dem Wohnort, in Bändern, mit
   * Filtern; Karte mit Route als Flussdiagramm (Flaggen, Verkehrsmittel) und Preis „~xy € p. P.“ inkl. Anreise, ohne
   * Touren. Detail mit Kosten nach Bereichen, Tagesplan und Touren. Ohne Wohnort: Land aus Zeitzone bzw. Sprache
   * (Hauptstadt), sonst Wohnort erfragen – nie fest ab Deutschland.
   * Veröffentlichte Reisen (#644) kommen ohne Konto über die REST-Schnittstelle dazu; mit preview zeigt die Ansicht nur
   * diesen Eintrag (Karte wie in der Liste und Detail), ohne Übernehmen und Melden.
   */
  import { onMount } from "svelte";
  import { arrow, locale, t, tn, type Key } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import { flagOf } from "../format";
  import { dir } from "../directory.svelte";
  import { myHome } from "../prefs";
  import { airportData, ensureAirports, geo } from "../geo/geo.svelte";
  import { airportsNear } from "../geo/locations";
  import { capitalOf, kmBetween, loadGeo } from "../geo/places";
  import { homeUi } from "../store.svelte";
  import { monthsText } from "../prefsView";
  import { app, newTrip } from "../store.svelte";
  import { travelersFrom, tagGroups } from "../directory.svelte";
  import { groupTravelers, nextAnimal, placeholderTravelers } from "../placeholders";
  import { applyPeople } from "../people";
  import { countryName } from "../geo/locations";
  import { hhKey, type Traveler } from "../model";
  import { takeEntry, type Start, type TourMode } from "../catalog/take";
  import { FLY_KM, viewerCountry } from "../catalog/arrival";
  import { LENS, WHO, catalogBands, costRows, routeOf, cardOf, type CatalogCard, type CatalogFilter, type Origin, type RouteNode } from "../catalog/view";
  import { CATALOG_KINDS, persons, type CatalogEntry } from "../catalog/types";
  import type { Home } from "../home";
  import HomeInput from "./HomeInput.svelte";
  import CatalogMap from "./CatalogMap.svelte";
  import { warmMap } from "./mapSnap";
  import { cloud, withdrawEntry } from "../cloud/cloud.svelte";
  import { fetchCatalog, fetchStats } from "../catalog/publish";
  import { applyStats, arrivalTable, ARRIVAL_DOC, type PricePoint } from "../catalog/prices";
  import { bugDialog } from "../bugs/app.svelte";

  let { preview }: { preview?: CatalogEntry } = $props();
  let loaded = $state<CatalogEntry[]>([]);
  /** Eintrag → Konto, das ihn veröffentlicht hat (eigene erkennen) */
  let owners = $state<Record<string, string>>({});
  /** geprüfte Preise je Eintrag und Anreise-Tabelle (#652) */
  let stats = $state<Record<string, PricePoint[]>>({});
  const flights = $derived(arrivalTable(stats[ARRIVAL_DOC] || []));
  const entries = $derived(preview ? [preview] : loaded.map(e => (stats[e.id] ? applyStats(e, stats[e.id], filter.month) : e)));
  let filter = $state<CatalogFilter>({});
  let open = $state<"who" | "kind" | "month" | "len" | "budget" | null>(null);
  let picked = $state<Home | null>(null);
  let asking = $state(false);
  let sel = $state<string | null>(null);

  onMount(() => {
    if (!preview) {
      void import("../catalog/seed").then(m => (loaded = [...m.seedCatalog(), ...loaded]));
      if (cloud.configured) void fetchCatalog().then(list => {
        owners = Object.fromEntries(list.map(x => [x.entry.id, x.uid]));
        loaded = [...loaded.filter(e => e.source !== "user"), ...list.map(x => x.entry)];
      }).catch(() => {});
      if (cloud.configured) void fetchStats().then(s => (stats = s)).catch(() => {});
      if (homeUi.catalogSel) { sel = homeUi.catalogSel; homeUi.catalogSel = null; }
    }
    void loadGeo(geo, []);
    void ensureAirports().catch(() => {});
    // Kartenbibliothek und Stil schon laden, während die Liste aufgebaut wird
    warmMap();
  });

  const flyKm = $derived(dir.prefs?.flyKm || FLY_KM);
  // Startort: gewählt, Wohnort aus dem Konto, sonst Hauptstadt des Landes (Zeitzone, Sprache), sonst keiner
  const guessCc = $derived(viewerCountry({ home: myHome(dir), prefsCc: dir.prefs?.plzCc, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, lang: typeof navigator !== "undefined" ? navigator.language : undefined }));
  const origin = $derived.by((): Origin | null => {
    const h = picked || myHome(dir);
    if (h && h.lat != null && h.lon != null) return { lat: h.lat, lon: h.lon, cc: h.cc || guessCc || undefined, name: h.ort || h.plz };
    void geo.world.length;
    // Hauptstadt, sonst größte Stadt des Landes (z. B. fehlt Bern in den Ortsdaten)
    const w = guessCc ? geo.world.find(x => x.k === guessCc) : undefined;
    const c = guessCc ? capitalOf(geo, guessCc) || (w?.cities[0] ? { name: w.cities[0][0], lat: w.cities[0][1], lon: w.cities[0][2] } : null) : null;
    return c ? { lat: c.lat, lon: c.lon, cc: guessCc!, name: c.name } : null;
  });
  const exact = $derived(!!(picked || myHome(dir)?.lat));
  const bands = $derived(catalogBands(entries, origin, filter, { flyKm, flights }));
  const card = $derived.by((): CatalogCard | null => { const e = preview || (sel && entries.find(x => x.id === sel)); return e ? cardOf(e, origin, { flyKm, flights, month: filter.month }) : null; });
  const mine = (e: CatalogEntry) => e.source === "user" && !!cloud.user && owners[e.id] === cloud.user.uid;
  /** Melden (#649): geht wie ein Fehlerbericht an Dani, mit der Kennung des Eintrags */
  function report(e: CatalogEntry) { bugDialog.text = t("cat.reportText", { id: e.id }); bugDialog.open = true; }
  async function withdraw(e: CatalogEntry) {
    if (!await ask(t("pub.withdrawQ"))) return;
    try {
      await withdrawEntry(e.id);
      loaded = loaded.filter(x => x.id !== e.id);
      sel = null;
      if (app.trip.pub?.id === e.id) delete app.trip.pub;
    } catch { void tell(t("pub.err")); }
  }

  function pickHome(h: Home) { picked = h; asking = false; }
  function toggle<T>(k: "who" | "kind" | "len", v: T) {
    const cur = (filter[k] as T[] | undefined) || [];
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    filter = { ...filter, [k]: next.length ? next : undefined };
  }
  const active = (k: keyof CatalogFilter) => { const v = filter[k]; return Array.isArray(v) ? v.length > 0 : v != null; };
  const anyFilter = $derived((["who", "kind", "month", "len", "budget"] as const).some(active));
  const BUDGETS = [500, 750, 1000, 1500, 2000, 3000];
  const monthName = (m: number) => new Date(2026, m - 1, 1).toLocaleDateString(locale(), { month: "short" });
  const standText = (s: string) => new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" });
  const groupText = (e: CatalogEntry) => { const kids = e.group.children + e.group.infants; return [tn("n.persons", persons(e)), kids ? tn("n.kids", kids) : ""].filter(Boolean).join(" · "); };
  const bandSub = (b: string) => (b === "near" ? t("cat.band.nearSub", { km: flyKm.toLocaleString(locale()) }) : t(`cat.band.${b}Sub` as Key));
  const arrText = (c: CatalogCard) => !c.arrival ? "" : c.arrival.preNight ? t("cat.arr.night", { v: eur(c.arrival.pp) }) : c.arrival.mode === "flight" ? t("cat.arr.plane", { v: eur(c.arrival.pp) }) : t("cat.arr.ground", { v: eur(c.arrival.pp) });
  const byText = (e: CatalogEntry) => (e.source === "user" && e.by ? t("cat.byUser", { name: e.by }) : t("cat.byIdea"));
  const routeLabel = (r: RouteNode[]) => `${t("cat.route")}: ${r.map(n => (n.by ? `${t(`cat.by.${n.by}` as Key)} → ` : "") + n.name).join(", ")}`;
  const KIND_TINT: Record<string, string> = { stay: "stay", round: "attractions", road: "misc", event: "trav", package: "pkg", cruise: "flights" };

  /** Ziel(e) für das Bild: Orte ohne direkte Wiederholung, Flaggen je Land */
  const dests = (e: CatalogEntry) => e.stops.filter((s, i) => i === 0 || s.place !== e.stops[i - 1].place).filter((s, i, a) => i === 0 || i < a.length - 1 || s.place !== a[0].place);
  const destFlags = (e: CatalogEntry) => [...new Set(dests(e).map(s => s.cc).filter((c): c is string => !!c))].map(flagOf).join(" ");
  /** Karte statt Bild (Dani, 02.11.): Stationen und das Zielland (dessen Städte bis 1.200 km um die Stationen) */
  const stopPts = (e: CatalogEntry) => e.stops.filter(s => s.lat != null && s.lon != null).map(s => ({ lat: s.lat!, lon: s.lon! }));
  const areaOf = (e: CatalogEntry) => {
    void geo.world.length;
    const st = stopPts(e), ccs = new Set(e.stops.map(s => s.cc).filter(Boolean));
    return geo.world.filter(w => ccs.has(w.k)).flatMap(w => w.cities.map(c => ({ lat: c[1], lon: c[2] })))
      .filter(c => st.some(p => kmBetween(p, c) <= 1200));
  };
  /** Beschriftung im Flussdiagramm: Start, Ziel bzw. Ziele, zurück */
  const capOf = (nodes: RouteNode[], i: number) => {
    const n = nodes[i];
    if (n.home) return i === 0 ? t("cat.start") : t("cat.ret");
    const first = nodes.findIndex(x => !x.home);
    return i === first ? (nodes.filter(x => !x.home).length > 1 ? t("cat.goals") : t("cat.goal")) : "";
  };
  /**
   * Mögliche Startpunkte (Dani, 02.11.): mit Flug die eigenen Flughäfen aus den Vorlieben bzw. die nächsten großen
   * Flughäfen am Startort (Städte), sonst der Startort selbst
   */
  const startsOf = (c: CatalogCard): string[] => {
    if (!origin) return [];
    if (c.arrival?.mode !== "flight") return [origin.name];
    void airportData.airports.length;
    const own = dir.prefs?.airports?.length ? dir.prefs.airports.map(code => airportData.airports.find(a => a[0] === code)?.[2] || code) : [];
    const near = own.length ? own : airportsNear(airportData, origin, 150, 4).map(a => apLabel(a.name, a.city));
    const out = [...new Set(near)].slice(0, 3);
    return out.length ? out : [origin.name];
  };
  /** kurzer Name eines Flughafens: „Leipzig/Halle“ (liegt in Schkeuditz), sonst die Stadt („Köln“), bei „Bâle / Mulhouse“ der Name ohne Zusätze („Basel“) */
  const apLabel = (name: string, city?: string) => {
    if (name.length <= 14 && !name.includes(" ")) return name;
    if (city && !city.includes("/")) return city;
    return name.replace(/\b(EuroAirport|Airport|International|Flughafen)\b/g, "").split(/[–-]/)[0].trim() || name;
  };
  const startIcon = (c: CatalogCard) => (c.route.find(n => !n.home)?.by || "car");
  function show(id: string) { sel = id; scrollTo({ top: 0 }); }
  // Übernehmen (#647): wer reist, wann, welche Touren; Anreise je Familie ab ihrem Wohnort
  let taking = $state(false);
  let who = $state<string>("like");
  let start = $state("");
  let mode = $state<TourMode>("all");
  let off = $state<string[]>([]);
  $effect(() => { void sel; taking = false; who = "like"; start = ""; mode = "all"; off = []; });
  function travelersFor(e: CatalogEntry): Traveler[] {
    if (who === "me" && dir.me) return travelersFrom([dir.me]);
    const g = dir.groups.find(x => x.id === who);
    if (g) return tagGroups(travelersFrom(g.memberIds), [g]);
    const kids = e.group.children + e.group.infants;
    return kids && e.group.adults <= 4 ? placeholderTravelers([{ animal: nextAnimal(), adults: e.group.adults, kids }]) : groupTravelers(e.group.adults, kids);
  }
  function take(e: CatalogEntry) {
    const travelers = travelersFor(e);
    // Wohnorte der Familien aus den gespeicherten Personen
    const homes: Record<string, Start> = {};
    for (const x of travelers) {
      const h = x.personId ? dir.people.find(p => p.id === x.personId)?.home : undefined;
      if (h?.lat != null && h.lon != null && !homes[hhKey(x)]) homes[hhKey(x)] = { lat: h.lat, lon: h.lon, name: h.ort || h.plz };
    }
    const from = start || undefined;
    const r = takeEntry(e, {
      travelers, homes, origin: origin ? { lat: origin.lat, lon: origin.lon, name: startsOfEntry(e)[0] || origin.name } : null, from, flyKm, flights,
      tours: e.tours.length ? mode : "none", picked: e.tours.map(x => x.name).filter(n => !off.includes(n)),
      tx: (k, v) => t(`cat.x.${k}` as Key, k === "detail" ? { m: standText(e.stand) } : v)
    });
    homeUi.catalog = false;
    newTrip({ name: e.title, place: e.stops[0]?.place || "", ...(from ? { from, to: r.to } : {}), travelers, items: r.items });
    if (e.stops[0]?.cc) app.trip.country = countryName(e.stops[0].cc);
    if (Object.keys(r.days).length) app.trip.days = r.days;
    // Herkunft für die Preisprüfung (#652): startet in der Reise von selbst, sobald der Reisebeginn feststeht
    app.trip.catalog = { id: e.id, stand: e.stand, rel: r.rel };
    applyPeople(app.trip, dir.people);
    app.home = false;
    scrollTo({ top: 0 });
  }
  const startsOfEntry = (e: CatalogEntry) => (card && card.e.id === e.id ? startsOf(card) : []);
</script>

{#snippet starts(c: CatalogCard)}
  <span class="kat-start"><small>{t("cat.start")}</small><span class="cr-ico" title={t(`cat.by.${startIcon(c)}` as Key)}><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-{startIcon(c)}" /></svg></span><span><span aria-hidden="true">{origin?.cc ? flagOf(origin.cc) : ""}</span> {startsOf(c).join(" · ")}</span></span>
{/snippet}

{#snippet cardInner(c: CatalogCard)}
  <span class="kat-pic" style="--k:var(--c-{KIND_TINT[c.e.kind]}); --ks:var(--c-{KIND_TINT[c.e.kind]}-s)">
    <CatalogMap stops={stopPts(c.e)} area={areaOf(c.e)} />
    <span class="kat-dest"><span><span aria-hidden="true">{destFlags(c.e)}</span> {dests(c.e).map(s => s.place).join(" · ")}</span>
      <small>{t(`cat.kind.${c.e.kind}` as Key)}{c.km != null ? ` · ${c.km.toLocaleString(locale())} km` : ""}</small></span>
  </span>
  {#if c.e.stops.length > 1}<span class="kat-way" style="--k:var(--c-{KIND_TINT[c.e.kind]})">{@render route(routeOf(c.e, null, c.arrival))}</span>{/if}
  {#if startsOf(c).length}{@render starts(c)}{/if}
  <span class="kat-body">
    <span class="kat-tl"><b>{c.e.title}</b><span class="kat-price"><b class="num"><bdi>~{eur(c.pp)}</bdi></b><small>{startsOf(c).length ? t("cat.ppFrom", { place: startsOf(c)[0] }) : t("cat.pp")}</small></span></span>
    <span class="kat-meta">{tn("n.nights", c.e.nights)} · {groupText(c.e)}{c.e.months.length ? ` · ${monthsText(c.e.months)}` : ""}</span>
    <span class="kat-tags">
      {#if c.arrival}<span class="kat-tag arr">{arrText(c)}</span>{/if}
      {#if c.tours}<span class="kat-tag tour">{t("cat.tours", { v: eur(c.tours) })}</span>{/if}
      {#each c.e.warn || [] as w (w)}<span class="kat-tag warn">{t(`cat.warn.${w}` as Key)}</span>{/each}
    </span>
    <small class="muted">{byText(c.e)}</small>
  </span>
{/snippet}

{#snippet route(nodes: RouteNode[], big = false)}
  <ol class="cr-route" class:big aria-label={routeLabel(nodes)}>
    {#each nodes as n, i (i)}
      <li>
        {#if n.by}<span class="cr-leg" title={t(`cat.by.${n.by}` as Key)}><i></i><span class="cr-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-{n.by}" /></svg></span><i></i></span>{/if}
        <span class="cr-node" class:home={n.home}><span class="cr-flag" aria-hidden="true">{n.cc ? flagOf(n.cc) : "📍"}</span><span class="cr-name">{#if capOf(nodes, i)}<small class="cr-cap">{capOf(nodes, i)}</small>{/if}{n.name}{#if big && n.nights}<small>{t("cat.d.nightsShort", { n: n.nights })}</small>{/if}</span></span>
      </li>
    {/each}
  </ol>
{/snippet}

<div class="kat">
  {#if card}
    {@const c = card}
    {@const rows = costRows(c.e, c.arrival)}
    {#if preview}
      <div class="kat-card kat-prev">{@render cardInner(c)}</div>
    {:else}
      <button class="linkbtn kat-back" onclick={() => (sel = null)}>{arrow() === "→" ? "←" : "→"} {t("cat.d.back")}</button>
      <div class="kat-pic big" style="--k:var(--c-{KIND_TINT[c.e.kind]}); --ks:var(--c-{KIND_TINT[c.e.kind]}-s)">
        <CatalogMap stops={stopPts(c.e)} area={areaOf(c.e)} w={720} h={360} />
        <span class="kat-dest"><span aria-hidden="true">{destFlags(c.e)}</span> {dests(c.e).map(s => s.place).join(" · ")}</span>
      </div>
    {/if}
    {#if c.e.stops.length > 1}<div class="kat-way" style="--k:var(--c-{KIND_TINT[c.e.kind]})">{@render route(routeOf(c.e, null, c.arrival), true)}</div>{/if}
    {#if !preview && startsOf(c).length}<div style="--k:var(--c-{KIND_TINT[c.e.kind]})">{@render starts(c)}</div>{/if}
    <div class="kat-dh">
      <small class="muted">{t(`cat.kind.${c.e.kind}` as Key)}{c.km != null ? ` · ${c.km.toLocaleString(locale())} km` : ""}</small>
      <h1 class="home-title kat-h">{c.e.title}</h1>
      <span>{tn("n.nights", c.e.nights)} · {groupText(c.e)}{c.e.months.length ? ` · ${t("cat.good", { m: monthsText(c.e.months) })}` : ""}</span>
      <small class="muted">{byText(c.e)} · {t("cat.d.stand", { m: standText(c.e.stand) })}{c.e.checked ? ` · ${t("cat.checked", { n: c.e.checked })}` : ""}</small>
      {#if c.e.warn?.length}<span class="kat-tags">{#each c.e.warn as w (w)}<span class="kat-tag warn">{t(`cat.warn.${w}` as Key)}</span>{/each}</span>{/if}
      {#if c.e.summary}<p class="kat-sumtext">{c.e.summary}</p>{/if}
    </div>
    <section class="kat-box">
      <div class="kat-sum"><b>{origin ? t("cat.d.cost", { place: startsOf(c)[0] || origin.name }) : t("cat.d.costNoHome")}</b><span class="kat-big num"><bdi>~{eur(c.pp)}</bdi></span></div>
      <ul class="kat-rows">
        {#each rows as r (r.key)}
          <li class:est={r.est}><span><b>{t(`cat.cost.${r.key}` as Key)}</b>{#if r.labels.length}<small class="muted">{r.labels.join(" · ")}</small>{/if}</span><span class="num"><bdi>~{eur(r.pp)}</bdi></span></li>
        {/each}
      </ul>
      <p class="muted small">{t("cat.d.note")}</p>
    </section>
    {#if !preview && mine(c.e)}
      <div class="kat-own"><span class="kat-tag mine">{t("cat.mine")}</span><button class="linkbtn kat-withdraw" onclick={() => withdraw(c.e)}>{t("pub.withdraw")}</button></div>
    {/if}
    {#if !preview}
      {#if !taking}
        <div class="kat-take"><button class="btn primary" onclick={() => (taking = true)}>{t("cat.d.take")}</button></div>
      {:else}
        <section class="kat-box kat-form">
          <h2>{t("cat.d.take")}</h2>
          <fieldset><legend>{t("cat.t.who")}</legend>
            <div class="kat-opts">
              <button class="chip kat-chip" class:on={who === "like"} onclick={() => (who = "like")}>{t("cat.t.like", { g: groupText(c.e) })}</button>
              {#if dir.me}<button class="chip kat-chip" class:on={who === "me"} onclick={() => (who = "me")}>{t("cat.t.me")}</button>{/if}
              {#each dir.groups as g (g.id)}<button class="chip kat-chip" class:on={who === g.id} onclick={() => (who = g.id)}>{g.name}</button>{/each}
            </div>
          </fieldset>
          <label class="kat-when">{t("cat.t.when")}<input type="date" bind:value={start} /></label>
          {#if c.e.tours.length}
            <fieldset><legend>{t("cat.t.tours")}</legend>
              <div class="kat-modes" role="radiogroup">
                {#each (c.e.days.length ? ["all", "tours", "pick", "none"] : ["tours", "pick", "none"]) as m (m)}
                  <label><input type="radio" name="kat-mode" value={m} checked={mode === m || (m === "tours" && mode === "all" && !c.e.days.length)} onchange={() => (mode = m as TourMode)} /> {t(`cat.t.${m === "tours" ? "only" : m}` as Key)}</label>
                {/each}
              </div>
              {#if mode === "pick"}
                <ul class="kat-tours">
                  {#each c.e.tours as x (x.name)}<li><label><input type="checkbox" checked={!off.includes(x.name)} onchange={() => (off = off.includes(x.name) ? off.filter(n => n !== x.name) : [...off, x.name])} /> {x.name}</label>{#if x.pp}<span class="num"><bdi>~{eur(x.pp)}</bdi></span>{/if}</li>{/each}
                </ul>
              {/if}
            </fieldset>
          {/if}
          <p class="muted small">{t("cat.t.note")}</p>
          <div class="kat-take"><button class="btn primary" onclick={() => take(c.e)}>{t("cat.t.go")}</button></div>
        </section>
      {/if}
    {/if}
    {#if !preview && c.e.source === "user" && !mine(c.e) && cloud.configured}
      <button class="linkbtn kat-report" onclick={() => report(c.e)}>⚑ {t("cat.report")}</button>
    {/if}
    {#if c.e.days.length}
      <section class="kat-sec">
        <h2>{t("cat.d.plan")}</h2>
        <ol class="kat-days">
          {#each c.e.days as d (d.n)}
            <li><span class="kat-dn">{t("cat.d.day", { n: d.n })}</span><span><b>{d.title || d.notes[0]?.text || ""}</b>{#each c.e.tours.filter(x => x.day === d.n) as x (x.name)}<small class="kat-tour-tag">{x.name}</small>{/each}</span></li>
          {/each}
        </ol>
      </section>
    {/if}
    {#if c.e.tours.length}
      <section class="kat-sec">
        <h2>{t("cat.d.tours")} <small class="muted">{t("cat.d.toursSum", { v: eur(c.tours) })}</small></h2>
        <ul class="kat-tours">
          {#each c.e.tours as x (x.name)}<li><span>{x.name}{#if x.day}<small class="muted">{t("cat.d.day", { n: x.day })}</small>{/if}</span>{#if x.pp}<span class="num"><bdi>~{eur(x.pp)}</bdi></span>{/if}</li>{/each}
        </ul>
      </section>
    {/if}
  {:else}
    <div class="kat-head">
      <button class="linkbtn kat-home" onclick={() => (homeUi.catalog = false)}>{arrow() === "→" ? "←" : "→"} {t("home.toStart")}</button>
      <h1 class="home-title">{t("cat.title")}</h1>
      {#if origin && !asking}
        <button class="kat-from" onclick={() => (asking = true)}><span aria-hidden="true">{origin.cc ? flagOf(origin.cc) : "📍"}</span> {t("cat.from", { place: origin.name })} <span class="muted">· {t("cat.change")}</span></button>
        {#if !exact}<small class="muted">{t("cat.guess", { place: origin.name })}</small>{/if}
      {:else if asking}
        <HomeInput cls="f kat-homein" value={{ cc: picked?.cc || myHome(dir)?.cc || guessCc || undefined }} onpick={pickHome} />
      {:else}
        <p class="muted">{t("cat.noHome")}</p>
        <button class="btn" onclick={() => (asking = true)}>{t("cat.setHome")}</button>
      {/if}
      <div class="kat-chips" role="toolbar">
        {#each ["who", "kind", "month", "len", "budget"] as const as k (k)}
          <button class="chip kat-chip" class:on={active(k)} aria-expanded={open === k} onclick={() => (open = open === k ? null : k)}>{t(`cat.f.${k}` as Key)} ▾</button>
        {/each}
        {#if anyFilter}<button class="linkbtn kat-reset" onclick={() => { filter = {}; open = null; }}>{t("cat.f.reset")}</button>{/if}
      </div>
      {#if open}
        <div class="kat-opts">
          {#if open === "who"}{#each WHO as w (w)}<button class="chip kat-chip" class:on={filter.who?.includes(w)} onclick={() => toggle("who", w)}>{t(`cat.who.${w}` as Key)}</button>{/each}
          {:else if open === "kind"}{#each CATALOG_KINDS as w (w)}<button class="chip kat-chip" class:on={filter.kind?.includes(w)} onclick={() => toggle("kind", w)}>{t(`cat.kind.${w}` as Key)}</button>{/each}
          {:else if open === "len"}{#each LENS as w (w)}<button class="chip kat-chip" class:on={filter.len?.includes(w)} onclick={() => toggle("len", w)}>{t(`cat.len.${w}` as Key)}</button>{/each}
          {:else if open === "month"}
            <button class="chip kat-chip" class:on={!filter.month} onclick={() => (filter = { ...filter, month: undefined })}>{t("cat.f.any")}</button>
            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<button class="chip kat-chip" class:on={filter.month === m} onclick={() => (filter = { ...filter, month: m })}>{monthName(m)}</button>{/each}
          {:else}
            <button class="chip kat-chip" class:on={!filter.budget} onclick={() => (filter = { ...filter, budget: undefined })}>{t("cat.f.any")}</button>
            {#each BUDGETS as b (b)}<button class="chip kat-chip" class:on={filter.budget === b} onclick={() => (filter = { ...filter, budget: b })}>{t("cat.budgetUpTo", { v: eur(b) })}</button>{/each}
          {/if}
        </div>
      {/if}
      <p class="muted small">{origin ? t("cat.sortNote") : t("cat.sortNoHome")}</p>
    </div>

    {#each bands as b, bi (bi)}
      <section class="kat-band">
        {#if b.band}<h2>{t(`cat.band.${b.band}` as Key)} <small class="muted">{bandSub(b.band)}</small></h2>{/if}
        <div class="kat-grid">
          {#each b.cards as c (c.e.id)}
            <button class="kat-card" onclick={() => show(c.e.id)}>{@render cardInner(c)}</button>
          {/each}
        </div>
      </section>
    {:else}
      {#if entries.length}<p class="muted">{t("cat.empty")}</p>{/if}
    {/each}
  {/if}
</div>

<style>
  .kat { display: grid; gap: 18px; text-align: start; min-width: 0; }
  .kat > * { min-width: 0; }
  .kat-head { display: grid; gap: 10px; justify-items: start; }
  .kat-head .home-title { margin: 0; }
  .kat-from { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-weight: 600; }
  .kat-chips { display: flex; gap: 8px; overflow-x: auto; max-width: 100%; padding-bottom: 2px; scrollbar-width: none; }
  .kat-chips::-webkit-scrollbar { display: none; }
  /* Auswahl wie überall: globaler Chip (#664), hier nur nicht umbrechen */
  .kat-chip { flex: none; white-space: nowrap; }
  .kat-opts { display: flex; flex-wrap: wrap; gap: 8px; }
  .kat-reset { font-size: 14px; white-space: nowrap; }
  .kat-band { display: grid; gap: 12px; }
  .kat-band h2 { margin: 0; font-size: 19px; }
  .kat-band h2 small { font-size: 13px; font-weight: 500; }
  .kat-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
  .kat-card { display: flex; flex-direction: column; text-align: start; padding: 0; border-radius: 18px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); overflow: hidden; box-shadow: 0 1px 2px rgba(21,32,46,.06); }
  .kat-card:hover, .kat-card:focus-visible { box-shadow: var(--shadow); }
  /* Karte mit dem Zielland, Ziel darüber; bis das Kartenbild da ist, die Farbe der Reiseart */
  .kat-pic { position: relative; display: block; aspect-ratio: 5 / 2; background: var(--ks); overflow: hidden; }
  .kat-pic.big { border-radius: 18px; aspect-ratio: 2 / 1; }
  .kat-dest { position: absolute; inset-inline: 0; bottom: 0; display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; padding: 24px 14px 10px; background: linear-gradient(transparent, rgba(10,20,35,.72)); color: #fff; font-size: 20px; font-weight: 800; line-height: 1.2; text-shadow: 0 1px 3px rgba(0,0,0,.35); }
  .kat-dest small { flex: none; font-size: 12px; font-weight: 700; opacity: .95; padding-bottom: 3px; }
  .kat-pic.big .kat-dest { font-size: 26px; padding: 40px 16px 14px; }
  .kat-way { display: block; padding: 10px 14px 0; color: var(--k); }
  .kat-start { display: flex; align-items: center; gap: 8px; padding: 10px 14px 0; color: var(--k); font-size: 13px; font-weight: 600; }
  .kat-start > small { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); }
  .kat-start > span:last-child { color: var(--ink); }
  .kat-start .cr-ico { width: 24px; height: 24px; flex: none; }
  .kat-body { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px 14px; }
  .kat-tl { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .kat-tl > b { font-size: 17px; line-height: 1.25; overflow-wrap: anywhere; }
  .kat-price { display: flex; flex-direction: column; align-items: flex-end; flex: none; }
  .kat-price b { font-size: 22px; font-weight: 800; }
  .kat-price small { font-size: 12px; color: var(--ink-2); }
  .kat-meta { font-size: 14px; }
  .kat-tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .kat-tag { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 10px; }
  .kat-tag.arr { color: var(--c-flights); background: var(--c-flights-s); }
  .kat-tag.tour { color: var(--c-attractions); background: var(--c-attractions-s); }
  .kat-tag.warn { color: var(--warn); background: var(--warn-soft); border: 1px dashed var(--warn); }
  /* Route als Flussdiagramm: Flagge und Ort, dazwischen das Verkehrsmittel */
  .cr-route { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; row-gap: 8px; }
  .cr-route li { display: flex; align-items: center; }
  .cr-leg { display: flex; align-items: center; }
  .cr-leg i { width: 10px; border-top: 2px dotted currentColor; opacity: .7; }
  .cr-ico { width: 26px; height: 26px; border-radius: 50%; background: currentColor; display: flex; align-items: center; justify-content: center; }
  .cr-ico svg { width: 15px; height: 15px; color: var(--paper); }
  .cr-node { display: flex; align-items: center; gap: 5px; background: var(--paper); color: var(--ink); border-radius: 14px; padding: 3px 9px 3px 6px; font-size: 12px; font-weight: 600; white-space: nowrap; box-shadow: 0 1px 2px rgba(21,32,46,.12); }
  .cr-flag { font-size: 16px; line-height: 1; }
  .cr-name { display: flex; flex-direction: column; line-height: 1.15; }
  .cr-name small { font-size: 11px; font-weight: 500; color: var(--ink-2); }
  .cr-name .cr-cap { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-2); }
  .cr-node.home { background: var(--paper-2); box-shadow: none; border: 1px solid var(--line); }
  .big .cr-node { font-size: 13px; padding: 5px 10px 5px 7px; }
  .big .cr-flag { font-size: 18px; }
  .big .cr-ico { width: 30px; height: 30px; }
  :global([dir="rtl"]) .cr-ico svg { transform: scaleX(-1); }
  .kat-back { justify-self: start; font-size: 15px; }
  .kat-dh { display: grid; gap: 4px; }
  .kat-h { margin: 0; font-size: clamp(28px, 8vw, 44px); overflow-wrap: anywhere; }
  .kat-box { display: grid; gap: 10px; padding: 16px; border-radius: 18px; border: 1px solid var(--line); background: var(--paper); }
  .kat-sum { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .kat-big { font-size: 28px; font-weight: 800; }
  .kat-rows, .kat-tours, .kat-days { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
  .kat-rows li, .kat-tours li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-top: 1px solid var(--line); }
  .kat-rows li > span:first-child, .kat-tours li > span:first-child { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .kat-sec { display: grid; gap: 8px; }
  .kat-sec h2 { margin: 0; font-size: 20px; }
  .kat-sec h2 small { font-size: 13px; font-weight: 500; }
  .kat-days { gap: 8px; }
  .kat-days li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--paper); }
  .kat-days li > span:last-child { display: flex; flex-direction: column; gap: 4px; }
  .kat-dn { flex: none; min-width: 52px; font-size: 13px; font-weight: 700; color: var(--ink-2); }
  .kat-tour-tag { align-self: flex-start; font-size: 12px; font-weight: 600; color: var(--c-attractions); background: var(--c-attractions-s); padding: 2px 8px; border-radius: 10px; }
  .kat-tours li { padding: 10px 0; }
  .kat-rows .num, .kat-tours .num { white-space: nowrap; }
  /* nicht schwebend: unten schweben schon 🐞 und KI */
  .kat-take { display: flex; }
  .kat-form { gap: 14px; }
  .kat-form h2 { margin: 0; font-size: 19px; }
  .kat-form fieldset { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
  .kat-form legend { font-weight: 700; margin-bottom: 8px; padding: 0; }
  .kat-when { display: grid; gap: 6px; font-weight: 700; }
  .kat-when input { min-height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); padding: 0 12px; font: inherit; font-weight: 500; }
  .kat-modes { display: grid; gap: 4px; }
  .kat-modes label, .kat-form .kat-tours label { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  .kat-modes input, .kat-form .kat-tours input { width: 20px; height: 20px; accent-color: var(--ink); }
  .kat-take .btn { flex: 1; min-height: 52px; font-size: 16px; }
  .kat-sumtext { margin: 6px 0 0; line-height: 1.45; overflow-wrap: anywhere; }
  .kat-own { display: flex; align-items: center; gap: 12px; }
  .kat-tag.mine { color: var(--good); background: var(--paper-2); border: 1px solid var(--good); }
  .kat-withdraw, .kat-report { justify-self: start; min-height: 44px; font-size: 14px; }
  .kat-prev { pointer-events: none; }
</style>
