<script lang="ts">
  /*
   * Reisekatalog (#646, Entwurf mit Dani 02.11., Handy zuerst): Liste nach Entfernung ab dem Wohnort, in Bändern, mit
   * Filtern; Karte mit Route als Flussdiagramm (Flaggen, Verkehrsmittel) und Preis „~xy € p. P.“ inkl. Anreise, ohne
   * Touren. Detail mit Kosten nach Bereichen, Tagesplan und Touren. Ohne Wohnort: Land aus Zeitzone bzw. Sprache
   * (Hauptstadt), sonst Wohnort erfragen – nie fest ab Deutschland.
   */
  import { onMount } from "svelte";
  import { arrow, locale, t, tn, type Key } from "../i18n/index.svelte";
  import { eur } from "../calc";
  import { flagOf } from "../format";
  import { dir } from "../directory.svelte";
  import { myHome } from "../prefs";
  import { geo } from "../geo/geo.svelte";
  import { capitalOf, loadGeo } from "../geo/places";
  import { homeUi } from "../store.svelte";
  import { monthsText } from "../prefsView";
  import { startPlan } from "../planApp";
  import { FLY_KM, viewerCountry } from "../catalog/arrival";
  import { LENS, WHO, catalogBands, costRows, routeOf, cardOf, type CatalogCard, type CatalogFilter, type Origin, type RouteNode } from "../catalog/view";
  import { CATALOG_KINDS, persons, type CatalogEntry } from "../catalog/types";
  import type { Home } from "../home";
  import HomeInput from "./HomeInput.svelte";

  let entries = $state<CatalogEntry[]>([]);
  let filter = $state<CatalogFilter>({});
  let open = $state<"who" | "kind" | "month" | "len" | "budget" | null>(null);
  let picked = $state<Home | null>(null);
  let asking = $state(false);
  let sel = $state<string | null>(null);

  onMount(() => {
    void import("../catalog/seed").then(m => (entries = m.seedCatalog()));
    void loadGeo(geo, []);
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
  const bands = $derived(catalogBands(entries, origin, filter, { flyKm }));
  const card = $derived.by((): CatalogCard | null => { const e = sel && entries.find(x => x.id === sel); return e ? cardOf(e, origin, { flyKm, month: filter.month }) : null; });

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

  function show(id: string) { sel = id; scrollTo({ top: 0 }); }
  async function take(e: CatalogEntry) {
    if (e.source !== "idea" || !e.slug) return;
    const { PAGES } = await import("../seo/pages");
    const p = PAGES.find(x => x.slug === e.slug);
    if (!p) return;
    const fam = p.plan.fam?.split(",").map(f => f.split("-").map(Number)).map(([a, k]) => ({ adults: a || 1, kids: k || 0 }));
    homeUi.catalog = false;
    await startPlan({ place: p.plan.ziel, cc: p.plan.land, name: p.plan.name, ...(fam ? { fam } : { group: p.plan.gruppe }), idea: p.slug });
  }
</script>

{#snippet route(nodes: RouteNode[], big = false)}
  <ol class="cr-route" class:big aria-label={routeLabel(nodes)}>
    {#each nodes as n, i (i)}
      <li>
        {#if n.by}<span class="cr-leg" title={t(`cat.by.${n.by}` as Key)}><i></i><span class="cr-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-{n.by}" /></svg></span><i></i></span>{/if}
        <span class="cr-node"><span class="cr-flag" aria-hidden="true">{n.cc ? flagOf(n.cc) : "📍"}</span><span class="cr-name">{n.name}{#if big && n.nights}<small>{t("cat.d.nightsShort", { n: n.nights })}</small>{/if}</span></span>
      </li>
    {/each}
  </ol>
{/snippet}

<div class="kat">
  {#if card}
    {@const c = card}
    {@const rows = costRows(c.e, c.arrival)}
    <button class="linkbtn kat-back" onclick={() => (sel = null)}>{arrow() === "→" ? "←" : "→"} {t("cat.d.back")}</button>
    <div class="kat-hero" style="--k:var(--c-{KIND_TINT[c.e.kind]}); --ks:var(--c-{KIND_TINT[c.e.kind]}-s)">
      {@render route(routeOf(c.e, origin, c.arrival, true), true)}
    </div>
    <div class="kat-dh">
      <small class="muted">{t(`cat.kind.${c.e.kind}` as Key)}{c.km != null ? ` · ${c.km.toLocaleString(locale())} km` : ""}</small>
      <h1 class="home-title kat-h">{c.e.title}</h1>
      <span>{tn("n.nights", c.e.nights)} · {groupText(c.e)}{c.e.months.length ? ` · ${t("cat.good", { m: monthsText(c.e.months) })}` : ""}</span>
      <small class="muted">{byText(c.e)} · {t("cat.d.stand", { m: standText(c.e.stand) })}</small>
    </div>
    <section class="kat-box">
      <div class="kat-sum"><b>{origin ? t("cat.d.cost", { place: origin.name }) : t("cat.d.costNoHome")}</b><span class="kat-big num"><bdi>~{eur(c.pp)}</bdi></span></div>
      <ul class="kat-rows">
        {#each rows as r (r.key)}
          <li class:est={r.est}><span><b>{t(`cat.cost.${r.key}` as Key)}</b>{#if r.labels.length}<small class="muted">{r.labels.join(" · ")}</small>{/if}</span><span class="num"><bdi>~{eur(r.pp)}</bdi></span></li>
        {/each}
      </ul>
      <p class="muted small">{t("cat.d.note")}</p>
    </section>
    {#if c.e.source === "idea"}
      <div class="kat-take"><button class="btn primary" onclick={() => void take(c.e)}>{t("cat.d.take")}</button></div>
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
          <button class="kat-chip" class:on={active(k)} aria-expanded={open === k} onclick={() => (open = open === k ? null : k)}>{t(`cat.f.${k}` as Key)} ▾</button>
        {/each}
        {#if anyFilter}<button class="linkbtn kat-reset" onclick={() => { filter = {}; open = null; }}>{t("cat.f.reset")}</button>{/if}
      </div>
      {#if open}
        <div class="kat-opts">
          {#if open === "who"}{#each WHO as w (w)}<button class="kat-chip" class:on={filter.who?.includes(w)} onclick={() => toggle("who", w)}>{t(`cat.who.${w}` as Key)}</button>{/each}
          {:else if open === "kind"}{#each CATALOG_KINDS as w (w)}<button class="kat-chip" class:on={filter.kind?.includes(w)} onclick={() => toggle("kind", w)}>{t(`cat.kind.${w}` as Key)}</button>{/each}
          {:else if open === "len"}{#each LENS as w (w)}<button class="kat-chip" class:on={filter.len?.includes(w)} onclick={() => toggle("len", w)}>{t(`cat.len.${w}` as Key)}</button>{/each}
          {:else if open === "month"}
            <button class="kat-chip" class:on={!filter.month} onclick={() => (filter = { ...filter, month: undefined })}>{t("cat.f.any")}</button>
            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}<button class="kat-chip" class:on={filter.month === m} onclick={() => (filter = { ...filter, month: m })}>{monthName(m)}</button>{/each}
          {:else}
            <button class="kat-chip" class:on={!filter.budget} onclick={() => (filter = { ...filter, budget: undefined })}>{t("cat.f.any")}</button>
            {#each BUDGETS as b (b)}<button class="kat-chip" class:on={filter.budget === b} onclick={() => (filter = { ...filter, budget: b })}>{t("cat.budgetUpTo", { v: eur(b) })}</button>{/each}
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
            <button class="kat-card" onclick={() => show(c.e.id)}>
              <span class="kat-top" style="--k:var(--c-{KIND_TINT[c.e.kind]}); --ks:var(--c-{KIND_TINT[c.e.kind]}-s)">
                <span class="kat-kind"><span>{t(`cat.kind.${c.e.kind}` as Key)}</span>{#if c.km != null}<span>{c.km.toLocaleString(locale())} km</span>{/if}</span>
                {@render route(c.route)}
              </span>
              <span class="kat-body">
                <span class="kat-tl"><b>{c.e.title}</b><span class="kat-price"><b class="num"><bdi>~{eur(c.pp)}</bdi></b><small>{t("cat.pp")}</small></span></span>
                <span class="kat-meta">{tn("n.nights", c.e.nights)} · {groupText(c.e)}{c.e.months.length ? ` · ${monthsText(c.e.months)}` : ""}</span>
                <span class="kat-tags">
                  {#if c.arrival}<span class="kat-tag arr">{arrText(c)}</span>{/if}
                  {#if c.tours}<span class="kat-tag tour">{t("cat.tours", { v: eur(c.tours) })}</span>{/if}
                </span>
                <small class="muted">{byText(c.e)}</small>
              </span>
            </button>
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
  .kat-chip { flex: none; min-height: 40px; padding: 0 14px; border-radius: 99px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); font-weight: 600; font-size: 14px; white-space: nowrap; }
  .kat-chip.on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .kat-opts { display: flex; flex-wrap: wrap; gap: 8px; }
  .kat-reset { font-size: 14px; white-space: nowrap; }
  .kat-band { display: grid; gap: 12px; }
  .kat-band h2 { margin: 0; font-size: 19px; }
  .kat-band h2 small { font-size: 13px; font-weight: 500; }
  .kat-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
  .kat-card { display: flex; flex-direction: column; text-align: start; padding: 0; border-radius: 18px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); overflow: hidden; box-shadow: 0 1px 2px rgba(21,32,46,.06); }
  .kat-card:hover, .kat-card:focus-visible { box-shadow: var(--shadow); }
  .kat-top, .kat-hero { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; background: var(--ks); color: var(--k); }
  .kat-hero { border-radius: 18px; padding: 16px; }
  .kat-kind { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
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
  .kat-take .btn { flex: 1; min-height: 52px; font-size: 16px; }
</style>
