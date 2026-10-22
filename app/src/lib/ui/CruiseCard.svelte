<script lang="ts">
  // Kreuzfahrt (#516): Karte im Kapitel Unterkunft mit Route (Häfen, Seetage) und Kabinen
  import StayCompare from "./StayCompare.svelte";
  import StatusBadge from "./StatusBadge.svelte";
  import { arrow, locale, t, tn, type Key } from "../i18n/index.svelte";
  import { hhKey, noPrice, type Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { CABIN_ICON, cabinTotal, cruiseTitle, portTime, routeLine, withoutCabin } from "../cruise";
  import { fx } from "../currency.svelte";
  import { openFlightSearch } from "../flights/open.svelte";
  import { openStaySearch } from "../stays/open.svelte";
  import { openExplore } from "../activities/open.svelte";
  import { addDays, okDate } from "../calc/travel";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const opt = $derived(r?.option);
  const nn = $derived(r?.stay?.nights.length || 0);
  const ports = $derived((item.cruise?.ports || []).filter(p => p.sea || p.place?.trim()));
  const cabins = $derived(opt?.cabins || []);
  const unpriced = $derived(!!opt && noPrice(opt));
  const missing = $derived(withoutCabin(opt ?? undefined, app.trip));
  const pct = $derived(r && r.net ? Math.min(100, (r.paid / r.net) * 100) : 0);
  const sub = $derived([item.cruise?.ship, nn ? tn("n.nights", nn) : "", cabins.length ? tn("n.cabins", cabins.length) : ""].filter(Boolean).join(" · "));
  const nameOf = (id: string) => app.trip.travelers.find(x => x.id === id)?.name || "?";
  // wer zahlt: Familien der Bewohner, sonst die Namen
  const payers = (who: string[]) => [...new Set(who.map(id => app.trip.travelers.find(x => x.id === id)).filter(x => !!x).map(x => hhKey(x!)))].join(" · ");
  // Kabinenpreis in Euro (Anzeige in der Währung der App über eur)
  const cabinEur = (v: number) => v / (opt?.price.currency && opt.price.currency !== "EUR" ? app.trip.settings.rates[opt.price.currency] || fx.rates?.rates[opt.price.currency] || 1 : 1);
  const wd = (iso: string) => { try { return new Intl.DateTimeFormat(locale(), { weekday: "short" }).format(new Date(`${iso}T12:00`)); } catch { return ""; } };
  function stopTime(i: number) {
    const p = ports[i], tm = portTime(p);
    if (p.sea) return wd(p.date);
    const w = wd(p.date);
    if (tm.arr && tm.dep) return `${w} ${tm.arr}–${tm.dep}`;
    if (tm.dep) return `${w} ${t("cr.depAt", { t: tm.dep })}`;
    if (tm.arr) return `${w} ${t("cr.arrAt", { t: tm.arr })}`;
    return w;
  }
  // Anreise zum Abfahrtshafen, Hotelnacht davor, Landgänge (#518)
  const embark = $derived(ports.find(p => !p.sea && p.place?.trim()));
  const back = $derived([...ports].reverse().find(p => !p.sea && p.place?.trim()));
  function go(e: Event, what: "flight" | "hotel" | "tours") {
    e.stopPropagation();
    const a = embark?.date, b = back?.date;
    if (what === "flight") openFlightSearch({ ...(embark?.place ? { to: embark.place.trim() } : {}), ...(okDate(a) ? { depart: a } : {}), ...(okDate(b) ? { ret: b } : {}) });
    else if (what === "hotel") openStaySearch({ ...(embark?.place ? { place: embark.place.trim() } : {}), ...(okDate(a) ? { from: addDays(a!, -1), to: a } : {}) });
    else openExplore("tours");
  }
  const typeList = $derived(cabins.map(c => t(`cr.type.${c.type}` as Key)).join(", "));
  let shown = $state(false);
  $effect(() => { const tm = setTimeout(() => (shown = true), 300); return () => clearTimeout(tm); });
  // Vergleich nebeneinander, solange noch nicht gebucht
  const cmp = $derived(item.options.length > 1 && item.status !== "booked" && item.status !== "paid");
  function choose(id: string, e: Event) { e.stopPropagation(); if (!access.readonly) item.chosen = id; }
  function drop(id: string, e: Event) {
    e.stopPropagation();
    if (access.readonly || item.options.length < 2) return;
    item.options = item.options.filter(o => o.id !== id);
    if (item.chosen === id) item.chosen = undefined;
  }
</script>

<div class="stay cruise">
  <div class="stay-img cruise-img" aria-hidden="true">
    <svg viewBox="0 0 220 200" preserveAspectRatio="xMidYMax meet">
      <circle cx="170" cy="52" r="20" fill="#FFE7B0" opacity=".95" />
      <path d="M0 150 Q 55 140 110 150 T 220 146 V200 H0z" fill="#1B4A73" opacity=".9" />
      <path d="M30 124 H190 L172 150 H48 Z" fill="#F7F4EE" />
      <rect x="58" y="104" width="104" height="20" rx="3" fill="#F7F4EE" />
      <rect x="78" y="88" width="66" height="16" rx="3" fill="#F7F4EE" />
      <rect x="128" y="70" width="14" height="18" fill="#C4513C" />
      <g fill="#2B6F8F"><rect x="66" y="110" width="8" height="7" /><rect x="80" y="110" width="8" height="7" /><rect x="94" y="110" width="8" height="7" /><rect x="108" y="110" width="8" height="7" /><rect x="122" y="110" width="8" height="7" /><rect x="136" y="110" width="8" height="7" /><rect x="150" y="110" width="8" height="7" /></g>
      <path d="M40 134 H180" stroke="#2B6F8F" stroke-width="2" />
    </svg>
  </div>
  <div class="stay-b">
    <div class="stay-hd">
      <StatusBadge status={item.status} />
      <span class="muted">{[t("cr.label"), item.cruise?.line || item.booking?.provider].filter(Boolean).join(" · ")}</span>
    </div>
    <h3>{cruiseTitle(item)}</h3>
    {#if sub}<div class="stay-opt muted">{sub}</div>{/if}
    {#if ports.length}
      <div class="cr-route" aria-label={t("cr.route")}>
        {#each ports as p, i (i)}
          <div class="cr-p" class:end={i === 0 || i === ports.length - 1} class:seaday={p.sea}><b>{p.sea ? t("cr.sea") : p.place}</b>{p.date ? stopTime(i) : ""}</div>
        {/each}
      </div>
      <p class="cr-line muted small">🚢 {routeLine(item, arrow())}{#if cabins.length}<br />🛏 {t("cr.cabinsLine", { n: tn("n.cabins", cabins.length), list: typeList })}{/if}</p>
    {/if}
    {#if cabins.length}
      <div class="cr-cabins">
        {#each cabins as c (c.id)}
          <div class="cr-cab">
            <span class="ico" aria-hidden="true">{CABIN_ICON[c.type]}</span>
            <span><b>{t(`cr.type.${c.type}` as Key)}</b> · {tn("n.persons", c.who.length)}</span>
            <span class="amt num">{c.price ? eur(cabinEur(cabinTotal(c))) : "–"}<small>{payers(c.who)}</small></span>
            <span class="who">{c.who.map(nameOf).join(", ")}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if embark && !access.readonly}
      <div class="cr-go" aria-label={t("cr.go")}>
        <button type="button" class="chip cr-goflight" onclick={e => go(e, "flight")}>✈ {t("cr.flight")}</button>
        <button type="button" class="chip cr-gohotel" onclick={e => go(e, "hotel")}>🛏 {t("cr.hotel")}</button>
        {#if ports.some((p, i) => i > 0 && i < ports.length - 1 && !p.sea)}<button type="button" class="chip cr-gotours" onclick={e => go(e, "tours")}>🎡 {t("cr.tours")}</button>{/if}
      </div>
    {/if}
    {#if missing.length}<div class="warnline">⚠ {t("cr.noCabin", { list: missing.map(x => x.name || "?").join(", ") })}</div>{/if}
    <div class="stay-foot">
      <div class="pay">
        {#if item.status === "paid"}<span>{t("pay.full")}</span>
        {:else if r?.paid}<span>{t("pay.part", { a: eur(r.paid), b: eur(r.net) })}</span>
        {:else}<span>{t("pay.none")}</span>{/if}
        <div class="bar"><i style:width="{shown ? pct : 0}%"></i></div>
      </div>
      <div class="price r">
        {#if unpriced}<b>{t("stay.noPrice")}</b>{:else}<b class="num">{eur(r?.net || 0)}</b>{/if}
        {#if !unpriced && r?.n}<span>{t("pp", { v: eur((r?.net || 0) / r.n) })}</span>{/if}
      </div>
    </div>
  </div>
</div>

{#if cmp}
  <StayCompare {item} {r} nights={nn} onchoose={choose} ondrop={drop} />
{/if}

<style>
  .cruise-img { background: linear-gradient(170deg, #9FD3F0, #3E86B8 60%, #1E4E78); }
  .stay-b > * { min-width: 0; }
  .cr-route { display: flex; align-items: flex-start; overflow-x: auto; scrollbar-width: none; padding: 2px 0; }
  .cr-p { flex: none; display: flex; flex-direction: column; align-items: center; min-width: 64px; padding: 0 2px; font-size: 11.5px; color: var(--ink-2); text-align: center; position: relative; }
  .cr-p b { font-size: 12.5px; color: var(--ink); }
  .cr-p::before { content: ""; position: relative; z-index: 1; width: 10px; height: 10px; border-radius: 50%; background: var(--paper); border: 2.5px solid var(--a); margin-bottom: 4px; }
  .cr-p.end::before { background: var(--a); }
  .cr-p.seaday::before { border-style: dashed; border-color: var(--ink-3); }
  .cr-p.seaday b { color: var(--ink-3); font-weight: 600; }
  .cr-p + .cr-p::after { content: ""; position: absolute; top: 5px; inset-inline-end: 50%; width: 100%; border-top: 2px solid var(--a); opacity: .5; }
  .cr-line { display: none; margin: 0; }
  .cr-cabins { display: flex; flex-direction: column; gap: 6px; }
  .cr-cab { display: grid; grid-template-columns: auto 1fr auto; gap: 2px 10px; align-items: center; padding: 8px 10px; border-radius: 12px; background: var(--paper-2); border: 1px solid var(--line); font-size: 13.5px; }
  .cr-cab .ico { font-size: 18px; grid-row: span 2; }
  .cr-cab .who { font-size: 12.5px; color: var(--ink-2); }
  .cr-cab .amt { grid-row: span 2; text-align: end; font-weight: 700; }
  .cr-cab .amt small { display: block; font-weight: 500; color: var(--ink-2); font-size: 11.5px; }
  .cr-go { display: flex; flex-wrap: wrap; gap: 6px; }
  .cr-go .chip { cursor: pointer; }
  .warnline { font-size: 13px; color: var(--warn); font-weight: 600; }
  /* Handy zugeklappt: Route als Zeile statt Leiste und Kabinen */
  @media (max-width: 560px) {
    :global(.card[data-more]:not(.edit)) .cr-route, :global(.card[data-more]:not(.edit)) .cr-cabins, :global(.card[data-more]:not(.edit)) .cr-go { display: none; }
    :global(.card[data-more]:not(.edit)) .cr-line { display: block; }
  }
</style>
