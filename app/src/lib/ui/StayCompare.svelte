<script lang="ts">
  /*
   * Angebote einer Unterkunft vergleichen (#438): Buchstaben A, B, C wie auf der Karte, Entfernungen zum Zentrum, zu
   * Events und Erlebnissen mit Ort und zum Flughafen, dazu was die ganze Reise mit dem Angebot kostet (inkl. Verpflegung).
   * Liegen die Angebote nah beieinander, eine gemeinsame Karte (erst geladen, wenn sie ins Bild kommt), sonst je
   * Angebot ein kleines Kartenbild. Auf dem Handy eine Liste, die man je Angebot aufklappt.
   */
  import ExtLink from "./ExtLink.svelte";
  import MapView, { type MapPoint } from "./MapView.svelte";
  import { t, tn, type Key } from "../i18n/index.svelte";
  import type { Item } from "../model";
  import { access, app } from "../store.svelte";
  import { calcOption, eur, type ItemCalc } from "../calc";
  import { ensureGeo, geo } from "../geo/geo.svelte";
  import { hasCoords } from "../geo/maps";
  import { kmText } from "../geo/spots";
  import { distances, effectOf, letter, nearestTo, refPoints, spreadKm, NEAR_KM } from "../stays/compare";
  import { cachedSnap, mapSnap } from "./mapSnap";

  let { item, r, nights, onchoose, ondrop }: {
    item: Item; r: ItemCalc | undefined; nights: number;
    onchoose: (id: string, e: Event) => void; ondrop: (id: string, e: Event) => void;
  } = $props();

  $effect(() => { void ensureGeo(app.trip); });
  const refs = $derived.by(() => { void geo.world.length; void Object.keys(geo.packs).length; void Object.keys(geo.places).length; return refPoints(app.trip, geo, item).slice(0, 4); });
  const dist = $derived(distances(item.options, refs));
  const near = $derived(nearestTo(dist, refs));
  const located = $derived(item.options.filter(o => hasCoords(o.loc)).length);
  const together = $derived(located >= 2 && spreadKm(item.options) <= NEAR_KM);
  // ganze Reise je Angebot; aktuell gewähltes als Bezug
  const eff = $derived.by(() => { void geo.world.length; return Object.fromEntries(item.options.map(o => [o.id, effectOf(app.trip, item.id, o.id, geo)])); });
  const cur = $derived(r?.option ? eff[r.option.id] : undefined);
  const refIcon = (k: string) => (k === "center" ? "📍" : k === "airport" ? "✈" : "★");
  const refName = (x: (typeof refs)[number]) => (x.kind === "center" ? t("stc.center", { name: x.name }) : x.name.length > 26 ? x.name.slice(0, 25) + "…" : x.name);

  let open = $state<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? id === r?.option?.id;
  let broken = $state<Record<string, boolean>>({});

  // gemeinsame Karte erst laden, wenn der Vergleich ins Bild kommt
  let box = $state<HTMLElement>();
  let seen = $state(false);
  $effect(() => {
    if (!box || seen || !together) return;
    if (typeof IntersectionObserver === "undefined") { seen = true; return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { seen = true; io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(box);
    return () => io.disconnect();
  });
  const points = $derived<MapPoint[]>([
    ...item.options.flatMap((o, i) => hasCoords(o.loc) ? [{ id: o.id, lat: o.loc.lat, lon: o.loc.lon, kind: "stay" as const, label: `${letter(i)} · ${eur(calcOption(o, item, app.trip).net)}`, title: o.label }] : []),
    ...refs.map(x => ({ id: "ref:" + x.id, lat: x.lat, lon: x.lon, kind: x.kind === "airport" ? "airport" as const : "event" as const, label: `${refIcon(x.kind)} ${refName(x)}`, title: x.name }))
  ]);

  // weit auseinander: je Angebot ein Kartenbild mit dem Angebot in der Mitte
  const SW = 240, SH = 96;
  let snaps = $state<Record<string, string | null>>({});
  $effect(() => {
    if (together) return;
    let live = true;
    for (const o of item.options) {
      if (!hasCoords(o.loc)) continue;
      const v = { center: [o.loc.lon, o.loc.lat] as [number, number], zoom: 12 };
      const hit = cachedSnap(v, SW, SH);
      if (hit) { snaps[o.id] = hit; continue; }
      void mapSnap(v, SW, SH).then(u => { if (live) snaps[o.id] = u; });
    }
    return () => { live = false; };
  });
</script>

<div class="opts st-cmp" bind:this={box}>
  <div class="opts-h"><span>{t("fl.compare")}</span><span>{tn("n.offers", item.options.length)}</span></div>
  {#if together && seen}
    <div class="cmp-map"><MapView {points} selected={r?.option?.id ?? null} onselect={id => { if (!id.startsWith("ref:")) open[id] = true; }} /></div>
    <p class="muted small cmp-mapnote">{t("stc.mapNear", { km: kmText(spreadKm(item.options)) })}</p>
  {/if}
  <div class="cmp-row">
    {#each item.options as o, i (o.id)}
      {@const c = calcOption(o, item, app.trip)}
      {@const diff = c.net - (r?.net || 0)}
      {@const sel = o.id === r?.option?.id}
      {@const e = eff[o.id]}
      {@const d = dist[o.id]}
      <div class="cmp-t" class:sel class:open={isOpen(o.id)}>
        {#if !together && snaps[o.id]}<div class="cmp-snap" style="background-image:url({snaps[o.id]})" role="img" aria-label={t("stc.where", { name: o.label })}><span class="cmp-pin">{letter(i)}</span></div>
        {:else if o.stay?.image && !broken[o.id]}<img src={o.stay.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={() => (broken[o.id] = true)} />{:else}<div class="cmp-ph" aria-hidden="true">🏨</div>{/if}
        <div class="cmp-top">
          <span class="cmp-l" aria-hidden="true">{letter(i)}</span>
          <span class="cmp-nm"><b class="cmp-n">{o.label || t("ie.offerN", { n: i + 1 })}{#if o.source?.test} <span class="pill-test">{t("test.badge")}</span>{/if}</b>
            {#if o.source?.name}<small class="muted">{o.source.name}</small>{/if}</span>
        </div>
        <!-- Handy, zugeklappt: nur pro Person und Abstand -->
        <div class="cmp-lite num">
          {#if e && e.people > 1}<span>{t("perPerson", { v: eur(e.perPerson) })}</span>{/if}
          {#if sel}<span class="pill-n">✓ {t("st.chosen")}</span>{:else if e && cur && Math.round(e.total - cur.total)}<span class="d" class:down={e.total < cur.total} class:up={e.total > cur.total}>{e.total > cur.total ? "+" : "−"}{eur(Math.abs(e.total - cur.total) / Math.max(1, e.people))} {t("stc.pp")}</span>{/if}
        </div>
        <div class="cmp-more">
          <div class="facts">
            {#if o.stay?.stars}<span class="fact">{"★".repeat(o.stay.stars)}</span>{/if}
            {#if o.stay?.rating}<span class="fact">{t("stay.rating", { p: o.stay.rating })}</span>{/if}
            {#if o.stay?.board}<span class="fact">{t(`board.${o.stay.board}` as Key)}</span>{/if}
            {#each (o.stay?.facts || []).slice(0, 3) as f (f)}<span class="fact">{f}</span>{/each}
          </div>
          <div class="cmp-p">
            <b class="num">{eur(c.net)}</b>
            {#if !sel && Math.round(diff)}<span class="d" class:down={diff < 0} class:up={diff > 0}>{diff > 0 ? "+" : "−"}{eur(Math.abs(diff))}</span>{/if}
            {#if nights}<small class="muted">{t("perNight", { v: eur(c.net / nights) })}</small>{/if}
          </div>
          {#if refs.length}
            {#if d}
              <ul class="cmp-dist">
                {#each refs as x (x.id)}
                  <li class:best={near[x.id] === o.id}><span aria-hidden="true">{refIcon(x.kind)}</span> {refName(x)} {kmText(d[x.id])}{#if near[x.id] === o.id} · {t("stc.nearest")}{/if}</li>
                {/each}
              </ul>
            {:else}<small class="muted">{t("stc.noLoc")}</small>{/if}
          {/if}
          {#if e && e.total > 0}
            <div class="cmp-eff">
              <small class="muted">{t("stc.trip")}</small>
              <span class="cmp-eff-t"><b class="num">{eur(e.total)}</b>{#if e.people > 1}<span class="num">{t("perPerson", { v: eur(e.perPerson) })}</span>{/if}</span>
              {#if sel}<small class="muted">{t("stc.current")}</small>
              {:else if cur && Math.round(e.total - cur.total)}
                {@const dd = e.total - cur.total}
                {@const sg = dd > 0 ? "+" : "−"}
                <span class="d num" class:down={dd < 0} class:up={dd > 0}>{e.people > 1 ? t("stc.diff", { v: `${sg}${eur(Math.abs(dd))}`, p: `${sg}${eur(Math.abs(dd) / e.people)}` }) : t("stc.diff1", { v: `${sg}${eur(Math.abs(dd))}` })}</span>
              {/if}
              {#if cur && Math.round(e.food - cur.food) && !sel}
                {@const fd = e.food - cur.food}
                <small class="cmp-food">{t("stc.food", { v: `${fd > 0 ? "+" : "−"}${eur(Math.abs(fd))}` })}</small>
              {/if}
            </div>
          {/if}
          <div class="cmp-a">
            {#if sel}<span class="pill-n">✓ {t("st.chosen")}</span>
            {:else}<button class="btn sm primary cmp-pick" disabled={access.readonly} onclick={ev => onchoose(o.id, ev)}>{t("fs.pick")}</button>{/if}
            {#if o.source?.url}<ExtLink cls="btn sm" href={o.source.url} sponsored={o.source.sponsored} inside track={[o.source.name, "stay"]} onclick={ev => ev.stopPropagation()}>↗</ExtLink>{/if}
            {#if !access.readonly}<button class="btn sm cmp-x" title={t("ie.dropOffer")} aria-label={t("ie.dropOffer")} onclick={ev => ondrop(o.id, ev)}>×</button>{/if}
          </div>
        </div>
        <button type="button" class="linkbtn cmp-tg" aria-expanded={isOpen(o.id)} onclick={ev => { ev.stopPropagation(); open[o.id] = !isOpen(o.id); }}>{isOpen(o.id) ? t("stc.less") : t("stc.more")}</button>
      </div>
    {/each}
  </div>
</div>

<style>
  .cmp-map { height: 230px; border-radius: 14px; overflow: hidden; border: 1px solid var(--line); }
  .cmp-map :global(.mapbox) { height: 100%; }
  .cmp-mapnote { margin: -2px 0 0; }
  .cmp-top { display: flex; gap: 8px; align-items: flex-start; }
  .cmp-nm { display: flex; flex-direction: column; min-width: 0; }
  .cmp-l { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; background: var(--a); }
  .cmp-snap { width: 100%; aspect-ratio: 240 / 96; border-radius: 10px; background: var(--paper-2) center / cover; display: grid; place-items: center; }
  .cmp-pin { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; background: var(--a); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, .3); }
  .cmp-more { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .cmp-dist { list-style: none; margin: 0; padding: 0; display: grid; gap: 1px; font-size: 12.5px; color: var(--ink-2); }
  .cmp-dist li.best { color: var(--good); font-weight: 700; }
  .cmp-eff { border-radius: 10px; background: var(--paper-2); padding: 6px 9px; display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; }
  .cmp-eff-t { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; flex-wrap: wrap; }
  .cmp-eff-t b { font-size: 16px; }
  .cmp-food { color: var(--ink-2); }
  .cmp-lite, .cmp-tg { display: none; }
  @media (max-width: 600px) {
    .st-cmp :global(.cmp-row) { grid-auto-flow: row; grid-auto-columns: auto; overflow: visible; scroll-snap-type: none; }
    .cmp-t:not(.open) .cmp-more, .cmp-t:not(.open) :is(img, .cmp-ph, .cmp-snap) { display: none; }
    .cmp-t:not(.open) .cmp-lite { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
    .cmp-tg { display: inline; align-self: flex-start; font-size: 13px; padding: 0; }
    .cmp-map { height: 190px; }
  }
</style>
