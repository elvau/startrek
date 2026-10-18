<script lang="ts">
  import { arrow, autoName, t, tn } from "../i18n/index.svelte";
  import { hhKey, isActive, type Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { calcOption, eur } from "../calc";
  import { dayShort, legDuration, time, dateDE } from "../format";
  import StatusBadge from "./StatusBadge.svelte";
  import { focusHousehold } from "./hhFocus.svelte";
  import { tourHead } from "./flightHead";
  import { effectOf, flightFacts, letter } from "../stays/compare";
  import { geo } from "../geo/geo.svelte";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const opt = $derived(r?.option);
  const out = $derived(opt?.legs?.find(l => l.dir === "out"));
  const back = $derived(opt?.legs?.find(l => l.dir === "back"));
  const vias = $derived(opt?.legs?.filter(l => l.dir === "via") ?? []);
  // Rundreise: Kopf zeigt die ganze Route und alle Airlines, keine Städte aus dem Postennamen
  const tour = $derived(tourHead(opt?.legs));
  const pp = $derived(r && r.n ? r.net / r.n : 0);
  // Vergleich (#441): ganze Reise je Angebot, pro Person
  const cmpOn = $derived(item.options.length > 1 && item.status !== "booked" && item.status !== "paid");
  const eff = $derived.by(() => { void geo.world.length; return cmpOn ? Object.fromEntries(item.options.map(o => [o.id, effectOf(app.trip, item.id, o.id, geo)])) : {}; });
  const legLine = (l: { dep: string; arr: string; minutes?: number }) => `${dayShort(l.dep.slice(0, 10))} ${time(l.dep)} ${arrow()} ${time(l.arr)}${l.minutes ? ` · ${Math.floor(l.minutes / 60)}:${String(l.minutes % 60).padStart(2, "0")} h` : ""}`;
  // Städte nur aus Namen wie „Flug Düsseldorf – Split“
  const cities = $derived(item.name.match(/^\S+\s+(.+?)\s+[–-]\s+(.+)$/));
  // wer fliegt, wie im Artefakt: Familie(n) mit Personenzahl, bei mehreren Familien ohne Auswahl „Alle“
  const who = $derived.by(() => {
    const act = app.trip.travelers.filter(isActive);
    const ppl = item.participants ? act.filter(x => item.participants!.includes(x.id)) : act;
    const hhs = [...new Set(ppl.map(hhKey))];
    if (!item.participants) return new Set(act.map(hhKey)).size > 1 ? `${t("all")} · ${t("persShort", { n: ppl.length })}` : "";
    return `${hhs.join(", ")} · ${t("persShort", { n: ppl.length })}`;
  });

  // Anfahrt antippen: zu den Einstellungen der Familie (ohne Wohnort: die erste ohne)
  function toAccess(hh: string, e: Event) {
    e.stopPropagation();
    focusHousehold(hh);
  }
  const noHome = $derived([...new Set(app.trip.travelers.filter(isActive).map(hhKey))].find(h => !app.trip.households?.[h]?.geo) || "");

  function choose(id: string, e: Event) {
    e.stopPropagation();
    if (access.readonly) return;
    item.chosen = id;
  }
</script>

<div class="bp">
  <div class="bp-main">
    <div class="bp-hd">
      <StatusBadge status={item.status} extra={item.options.length > 1 ? ` · ${tn("n.offers", item.options.length)}` : ""} />
      {#if who}<span class="bp-who">{who}{item.follow && opt?.id.startsWith("follow:") ? ` · ${opt.label}` : ""}</span>{/if}
      <span class="muted">{tour ? tour.carriers.join(" / ") : out?.carrier || opt?.label || ""}{out && !tour ? (out.stops ? ` · ${tn("n.stops", out.stops)}` : ` · ${t("fl.direct")}`) : ""}</span>
    </div>
    {#if out}
      <div class="bp-route">
        <div class="bp-ap"><b>{out.from}</b><span>{tour ? "" : cities?.[1] || ""}</span></div>
        <div class="bp-line"><svg viewBox="0 0 24 24" style="transform:rotate(90deg)"><use href="#i-plane" /></svg><em>{tour ? tour.chain.slice(1, -1).join(` ${arrow()} `) : legDuration(out)}</em></div>
        <div class="bp-ap r"><b>{tour ? tour.chain[tour.chain.length - 1] : out.to}</b><span>{tour ? "" : cities?.[2] || ""}</span></div>
      </div>
      {#if r?.access}
        <div class="bp-acc">
          {#if r.access.missing}
            {#if access.readonly}<span>🚗 {t("fl.accessMissing", { ap: r.access.missing })}</span>
            {:else}<button class="bp-acc-l" title={t("fl.accessEdit")} onclick={e => toAccess(noHome, e)}>🚗 {t("fl.accessMissing", { ap: r.access.missing })} <i aria-hidden="true">›</i></button>{/if}
          {:else}{#each r.access.lines as l}
            {#if access.readonly}<span>🚗 {l.hh}: {l.a.info} · <b class="num">{eur(l.a.cost)}</b></span>
            {:else}<button class="bp-acc-l" title={t("fl.accessEdit")} onclick={e => toAccess(l.hh, e)}>🚗 {l.hh}: {l.a.info} · <b class="num">{eur(l.a.cost)}</b> <i aria-hidden="true">›</i></button>{/if}
          {/each}{/if}
        </div>
      {/if}
      <div class="bp-legs">
        <div class="bp-leg"><b>{t("fl.out")} · {dayShort(out.dep)}</b><span>{time(out.dep)} {arrow()} {time(out.arr)}</span></div>
        <!-- Rundreise: weitere Flüge dazwischen -->
        {#each vias as v, i (i)}<div class="bp-leg"><b>{v.from} {arrow()} {v.to} · {dayShort(v.dep)}</b><span>{time(v.dep)} {arrow()} {time(v.arr)}</span></div>{/each}
        {#if back}<div class="bp-leg"><b>{t("fl.back")}{vias.length ? ` ${back.from} ${arrow()} ${back.to}` : ""} · {dayShort(back.dep)}</b><span>{time(back.dep)} {arrow()} {time(back.arr)}</span></div>{/if}
      </div>
    {:else}
      <h3 class="bp-name">{autoName(item.name) || t("fl.new")}</h3>
    {/if}
  </div>
  <div class="bp-stub">
    <div class="price"><b class="num">{eur(pp)}</b><span>{r?.access?.cost ? t("fl.ppAccess") : t("simple.perPerson")}{opt?.detail ? `, ${opt.detail}` : ""}</span></div>
    <div class="price"><b class="num">{eur(r?.net || 0)}</b><span>{t("fl.for", { n: r?.n || 0 })}</span></div>
  </div>
</div>
{#if cmpOn}
  <div class="opts">
    <div class="opts-h"><span>{t("fl.compare")}</span>{#if opt?.source?.at}<span>{t("fl.priceFrom", { d: dateDE(opt.source.at) })}</span>{/if}</div>
    {#each item.options as o, i (o.id)}
      {@const c = calcOption(o, item, app.trip)}
      {@const diff = c.net - (r?.net || 0)}
      {@const f = flightFacts(o)}
      {@const e = eff[o.id]}
      {@const cur = opt ? eff[opt.id] : undefined}
      {@const dd = e && cur ? e.total - cur.total : 0}
      <button class="opt fl-cmp" class:sel={o.id === opt?.id} onclick={ev => choose(o.id, ev)}>
        <span class="cmp-l" aria-hidden="true">{letter(i)}</span>
        <span>{o.label}{#if o.source?.test} <span class="pill-test">{t("test.badge")}</span>{/if}
          {#if f.out}<small>🛫 {legLine(f.out)}</small>{:else if o.legs?.[0]}<small>{time(o.legs[0].dep)} {arrow()} {time(o.legs[0].arr)} · {legDuration(o.legs[0])}</small>{/if}
          {#if f.back}<small>🛬 {legLine(f.back)}</small>{/if}
          <small>{f.stops ? tn("n.stops", f.stops) : t("fl.direct")}{f.bag ? ` · ${t(f.bag === "checked" ? "fl.bagChecked" : f.bag === "cabin" ? "fl.bagCabin" : "fl.bagPersonal")}` : ""}{o.detail ? ` · ${o.detail}` : ""}{c.access?.cost ? ` · ${t("fl.inclAccess", { v: eur(c.access.cost) })}` : ""}</small></span>
        <span class="num fl-cmp-p">{eur(c.net)} {#if o.id !== opt?.id && Math.round(diff)}<span class="d" class:down={diff < 0} class:up={diff > 0}>{diff > 0 ? "+" : "−"}{Math.abs(Math.round(diff))}</span>{/if}
          {#if e && e.people > 1 && o.id !== opt?.id && Math.round(dd)}<small class="d" class:down={dd < 0} class:up={dd > 0}>{t("fl.tripPP", { v: `${dd > 0 ? "+" : "−"}${eur(Math.abs(dd) / e.people)}` })}</small>{/if}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .fl-cmp { align-items: start; }
  .fl-cmp > span:nth-child(2) { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .fl-cmp .cmp-l { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 12px; font-weight: 800; color: #fff; background: var(--a); }
  .fl-cmp-p { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
  .fl-cmp:not(.sel) .cmp-l { background: var(--ink-3); }
</style>
