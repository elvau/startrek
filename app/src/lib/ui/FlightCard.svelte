<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { hhKey, isActive, type Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { calcOption, eur } from "../calc";
  import { dayShort, duration, time, dateDE } from "../format";
  import StatusBadge from "./StatusBadge.svelte";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const opt = $derived(r?.option);
  const out = $derived(opt?.legs?.find(l => l.dir === "out"));
  const back = $derived(opt?.legs?.find(l => l.dir === "back"));
  const vias = $derived(opt?.legs?.filter(l => l.dir === "via") ?? []);
  const pp = $derived(r && r.n ? r.net / r.n : 0);
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
      <span class="muted">{out?.carrier || opt?.label || ""}{out ? (out.stops ? ` · ${tn("n.stops", out.stops)}` : ` · ${t("fl.direct")}`) : ""}</span>
    </div>
    {#if out}
      <div class="bp-route">
        <div class="bp-ap"><b>{out.from}</b><span>{cities?.[1] || ""}</span></div>
        <div class="bp-line"><svg viewBox="0 0 24 24" style="transform:rotate(90deg)"><use href="#i-plane" /></svg><em>{duration(out.dep, out.arr)}</em></div>
        <div class="bp-ap r"><b>{out.to}</b><span>{cities?.[2] || ""}</span></div>
      </div>
      {#if r?.access}
        <div class="bp-acc">
          {#if r.access.missing}🚗 {t("fl.accessMissing", { ap: r.access.missing })}
          {:else}{#each r.access.lines as l}<span>🚗 {l.hh}: {l.a.info} · <b class="num">{eur(l.a.cost)}</b></span>{/each}{/if}
        </div>
      {/if}
      <div class="bp-legs">
        <div class="bp-leg"><b>{t("fl.out")} · {dayShort(out.dep)}</b><span>{time(out.dep)} → {time(out.arr)}</span></div>
        <!-- Rundreise: weitere Flüge dazwischen -->
        {#each vias as v, i (i)}<div class="bp-leg"><b>{v.from} → {v.to} · {dayShort(v.dep)}</b><span>{time(v.dep)} → {time(v.arr)}</span></div>{/each}
        {#if back}<div class="bp-leg"><b>{t("fl.back")}{vias.length ? ` ${back.from} → ${back.to}` : ""} · {dayShort(back.dep)}</b><span>{time(back.dep)} → {time(back.arr)}</span></div>{/if}
      </div>
    {:else}
      <h3 class="bp-name">{item.name || t("fl.new")}</h3>
    {/if}
  </div>
  <div class="bp-stub">
    <div class="price"><b class="num">{eur(pp)}</b><span>{r?.access?.cost ? t("fl.ppAccess") : t("simple.perPerson")}{opt?.detail ? `, ${opt.detail}` : ""}</span></div>
    <div class="price"><b class="num">{eur(r?.net || 0)}</b><span>{t("fl.for", { n: r?.n || 0 })}</span></div>
  </div>
</div>
{#if item.options.length > 1 && item.status !== "booked" && item.status !== "paid"}
  <div class="opts">
    <div class="opts-h"><span>{t("fl.compare")}</span>{#if opt?.source?.at}<span>{t("fl.priceFrom", { d: dateDE(opt.source.at) })}</span>{/if}</div>
    {#each item.options as o (o.id)}
      {@const c = calcOption(o, item, app.trip)}
      {@const diff = c.net - (r?.net || 0)}
      {@const lo = o.legs?.find(l => l.dir === "out")}
      <button class="opt" class:sel={o.id === opt?.id} onclick={e => choose(o.id, e)}>
        <i></i>
        <span>{o.label}<small>{lo ? `${time(lo.dep)} → ${time(lo.arr)} · ${duration(lo.dep, lo.arr)}` : ""}{o.detail ? ` · ${o.detail}` : ""}{c.access?.cost ? ` · ${t("fl.inclAccess", { v: eur(c.access.cost) })}` : ""}</small></span>
        <span class="num">{eur(c.net)} {#if o.id !== opt?.id && Math.round(diff)}<span class="d" class:down={diff < 0} class:up={diff > 0}>{diff > 0 ? "+" : "−"}{Math.abs(Math.round(diff))}</span>{/if}</span>
      </button>
    {/each}
  </div>
{/if}
