<script lang="ts">
  /*
   * Kreuzfahrten vergleichen (#520): Angebote A, B, C eines Kreuzfahrt-Postens, jedes mit eigener Route. Je Angebot
   * Reederei und Schiff, Route, Nächte, Häfen und Seetage, Kabinen, Preis mit Nebenkosten (Trinkgeld, Pakete an Bord),
   * pro Person und was die ganze Reise pro Person kostet (mit Anreise, Hotelnacht, Ausflügen, Verpflegung).
   * Desktop als Tabelle, Handy als Liste. Klick wählt das Angebot; Route und Tagesplan folgen dem gewählten.
   */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import type { CabinType, Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { calcOption, eur } from "../calc";
  import { geo } from "../geo/geo.svelte";
  import { effectOf, letter } from "../stays/compare";
  import { CABIN_ICON, cruiseFacts, syncCruise } from "../cruise";
  import { openCruise } from "../cruises/open.svelte";

  let { item }: { item: Item } = $props();
  const sel = $derived(calc.T.items[item.id]?.option?.id);
  // je Angebot rechnen, als wäre es gewählt (eigener Zeitraum und eigene Kabinen)
  const rows = $derived.by(() => {
    void geo.world.length;
    return item.options.map((o, i) => {
      const tmp: Item = JSON.parse(JSON.stringify(item));
      tmp.chosen = o.id;
      syncCruise(tmp);
      const c = calcOption(tmp.options[i], tmp, app.trip);
      const f = cruiseFacts(item, o);
      const types = [...new Set((o.cabins || []).map(x => x.type))] as CabinType[];
      const e = effectOf(app.trip, item.id, o.id, geo);
      return { o, i, c, f, types, cabins: o.cabins?.length || 0, extra: Math.max(0, c.net - (c.base ?? c.net)), pp: c.n ? c.net / c.n : 0, e };
    });
  });
  const cur = $derived(rows.find(r => r.o.id === sel) || rows[0]);
  const best = $derived(Math.min(...rows.map(r => r.e.perPerson)));
  const d = (v: number) => Math.round(v);
  function choose(id: string, e: Event) {
    e.stopPropagation();
    if (access.readonly) return;
    item.chosen = id;
    syncCruise(item);
  }
  const cabinText = (r: (typeof rows)[number]) => r.types.length ? `${r.cabins} × ${r.types.map(x => `${CABIN_ICON[x]} ${t(`cr.type.${x}` as Key)}`).join(", ")}` : "–";
  const facts = (r: (typeof rows)[number]) => [r.f.nights ? tn("n.nights", r.f.nights) : "", r.f.harbours ? tn("n.ports", r.f.harbours) : "", r.f.sea ? tn("n.seaDays", r.f.sea) : ""].filter(Boolean).join(" · ");
</script>

<div class="opts cc" role="table" aria-label={t("fl.compare")}>
  <div class="opts-h"><span>{t("fl.compare")}</span><span>{tn("n.offers", item.options.length)}</span></div>
  <div class="cc-row cc-head" role="row">
    <span></span><span>{t("cc.ship")}</span><span>{t("cc.route")}</span><span>{t("cc.cabins")}</span>
    <span class="r">{t("cc.extras")}</span><span class="r">{t("cc.total")}</span><span class="r">{t("cc.pp")}</span><span class="r">{t("cc.trip")}</span>
  </div>
  {#each rows as r (r.o.id)}
    {@const diff = r.c.net - (cur?.c.net || 0)}
    {@const dd = r.e.perPerson - (cur?.e.perPerson || 0)}
    <button class="cc-row opt" class:sel={r.o.id === sel} role="row" disabled={access.readonly} onclick={ev => choose(r.o.id, ev)}>
      <span class="cmp-l" aria-hidden="true">{letter(r.i)}</span>
      <span class="cc-ship"><b>{[r.f.line, r.f.ship].filter(Boolean).join(" · ") || r.o.label || t("ie.offerN", { n: r.i + 1 })}</b>
        {#if r.o.id === sel}<small class="cc-sel">✓ {t("st.chosen")}</small>{/if}</span>
      <span class="cc-route">{r.f.route || "–"}<small>{facts(r)}</small></span>
      <span class="cc-cab">{cabinText(r)}</span>
      <span class="num r cc-x"><small class="cc-k">{t("cc.extras")}</small>{r.extra ? eur(r.extra) : "–"}</span>
      <span class="num r cc-sum"><small class="cc-k">{t("cc.total")}</small><b>{eur(r.c.net)}</b>{#if r.o.id !== sel && d(diff)} <span class="d" class:down={diff < 0} class:up={diff > 0}>{diff > 0 ? "+" : "−"}{Math.abs(d(diff))}</span>{/if}</span>
      <span class="num r cc-pp"><small class="cc-k">{t("cc.pp")}</small>{eur(r.pp)}</span>
      <span class="num r cc-trip" class:best={rows.length > 1 && d(r.e.perPerson) === d(best)}><small class="cc-k">{t("cc.trip")}</small>{eur(r.e.perPerson)}{#if r.o.id !== sel && d(dd)} <span class="d" class:down={dd < 0} class:up={dd > 0}>{dd > 0 ? "+" : "−"}{Math.abs(d(dd))}</span>{/if}</span>
    </button>
  {/each}
  <p class="muted small cc-hint">{t("cc.hint")}</p>
  {#if !access.readonly}<div class="cc-add"><button type="button" class="btn sm cc-more" onclick={e => { e.stopPropagation(); openCruise(item.id); }}>🔎 {t("cc.more")}</button></div>{/if}
</div>

<style>
  .cc-row { display: grid; grid-template-columns: 22px minmax(0, 1.1fr) minmax(0, 1.6fr) minmax(0, 1fr) 76px 96px 70px 92px; gap: 8px; align-items: start; text-align: start; width: 100%; }
  .cc-head { font-size: 12px; font-weight: 700; color: var(--ink-2); padding: 4px 10px; }
  .r { text-align: end; }
  .cc-ship, .cc-route { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .cc-route small, .cc-ship small { color: var(--ink-2); }
  .cc-sel { color: var(--a) !important; font-weight: 700; }
  .cc-trip.best { color: var(--good); font-weight: 700; }
  .cc-k { display: none; }
  .cc-row .d { margin-inline-start: 4px; }
  .cmp-l { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; background: var(--ink-3); }
  .cc-row.sel .cmp-l { background: var(--a); }
  .cc-hint { margin: 6px 2px 0; }
  .cc-add { display: flex; gap: 8px; margin-top: 6px; }
  /* Handy: je Angebot ein Block, Beträge mit Beschriftung */
  @media (max-width: 760px) {
    .cc-head { display: none; }
    .cc-row { grid-template-columns: 26px 1fr 1fr; }
    .cc-route, .cc-cab { grid-column: 2 / 4; }
    .cc-x, .cc-sum, .cc-pp, .cc-trip { grid-column: span 1; text-align: start; }
    .cc-x { grid-column: 2; } .cc-sum { grid-column: 3; } .cc-pp { grid-column: 2; } .cc-trip { grid-column: 3; }
    .cc-k { display: block; font-size: 11.5px; color: var(--ink-2); }
  }
</style>
