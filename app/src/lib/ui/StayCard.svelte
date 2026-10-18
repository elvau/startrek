<script lang="ts">
  import StayCompare from "./StayCompare.svelte";
  import { autoName, t, tn, type Key } from "../i18n/index.svelte";
  import { BOARDS, type Board, type Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { dateDE } from "../format";
  import StatusBadge from "./StatusBadge.svelte";
  import { cluster, groupLabel } from "../groups";
  import { openPrivStay } from "../stays/open.svelte";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const s = $derived(r?.option?.stay);
  const sc = $derived(r?.stay);
  const nn = $derived(sc ? sc.nights.length : s?.nights || r?.option?.price.qty || 0);
  // Gäste, die nicht alle Nächte da sind
  const partial = $derived(sc ? cluster(Object.entries(sc.w).filter(([, w]) => w < sc.nights.length), (a, b) => a[1] === b[1])
    .map(g => `${groupLabel(g.map(([id]) => app.trip.travelers.find(x => x.id === id)?.name || "?"), -1)} ${tn("n.nights", g[0][1])}`) : []);
  const absent = $derived(sc ? sc.nights.filter(x => !sc.occ[x]).length : 0);
  const pct = $derived(r && r.net ? Math.min(100, (r.paid / r.net) * 100) : 0);
  /** Verpflegung am gewählten Angebot setzen (die Verpflegung unter „Sonstiges“ folgt automatisch) */
  function setBoard(b: Board | "") {
    const o = item.options.find(x => x.id === r?.option?.id);
    if (!o) return;
    o.stay = { ...(o.stay || {}), board: b || undefined };
  }
  // Vergleich nebeneinander, solange noch nicht gebucht
  const cmp = $derived(item.options.length > 1 && item.status !== "booked" && item.status !== "paid");
  function choose(id: string, e: Event) {
    e.stopPropagation();
    if (!access.readonly) item.chosen = id;
  }
  function drop(id: string, e: Event) {
    e.stopPropagation();
    if (access.readonly || item.options.length < 2) return;
    item.options = item.options.filter(o => o.id !== id);
    if (item.chosen === id) item.chosen = undefined;
  }
  let imgFailed = $state(false);
  let shown = $state(false);
  $effect(() => { const tm = setTimeout(() => (shown = true), 300); return () => clearTimeout(tm); });
</script>

<div class="stay" class:priv={!!item.private}>
  {#if item.private}
  <!-- privat bzw. schon vorhanden (#233): Haus mit Herz statt Hotelbild -->
  <div class="stay-img priv-img" aria-hidden="true">
    <svg viewBox="0 0 120 110"><path d="M14 52 L60 14 L106 52" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" /><rect x="26" y="48" width="68" height="54" rx="6" fill="var(--paper)" stroke="currentColor" stroke-width="4" /><path d="M60 88 C 44 76 46 62 54 62 C 58 62 60 66 60 66 C 60 66 62 62 66 62 C 74 62 76 76 60 88 Z" fill="currentColor" /></svg>
  </div>
  {:else}
  <div class="stay-img" aria-hidden="true">
    <!-- Bild der Unterkunft vom Anbieter (Trivago), sonst die Zeichnung -->
    {#if s?.image && !imgFailed}<img class="stay-photo" src={s.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={() => (imgFailed = true)} />{/if}
    <svg viewBox="0 0 220 200" preserveAspectRatio="xMidYMax slice"><circle cx="160" cy="60" r="22" fill="#FFE7B0" opacity=".9" /><path d="M0 150 Q 60 120 120 140 T 220 130 V200 H0z" fill="#2B6F8F" opacity=".75" /><rect x="40" y="80" width="70" height="80" rx="4" fill="#F7EDE2" /><rect x="52" y="94" width="14" height="14" fill="#E9A15A" /><rect x="84" y="94" width="14" height="14" fill="#E9A15A" /><rect x="52" y="120" width="14" height="14" fill="#E9A15A" /><rect x="84" y="120" width="14" height="14" fill="#E9A15A" /><path d="M34 82 L75 58 L116 82z" fill="#C4513C" /></svg>
  </div>
  {/if}
  <div class="stay-b">
    <div class="stay-hd">
      <StatusBadge status={item.status} />
      {#if item.booking?.provider}<span class="muted">{item.booking.provider}{item.booking.cancelUntil ? ` · ${t("stay.freeCancel", { d: dateDE(item.booking.cancelUntil) })}` : ""}</span>{/if}
    </div>
    <h3>{autoName(item.name) || t("stay.new")}</h3>
    {#if !item.private && r?.option?.label && r.option.label !== autoName(item.name)}<div class="stay-opt">{r.option.label}{r.option.source?.name ? ` · ${r.option.source.name}` : ""}{item.options.length > 1 ? ` · ${tn("n.offers", item.options.length)}` : ""}</div>{/if}
    {#if item.from && item.to}<div class="muted">{t("range.fromTo", { a: dateDE(item.from), b: dateDE(item.to) })} · {tn("n.nights", nn)}{r?.stay ? ` · ${tn("stay.upTo", r.stay.maxOcc)}` : ""}</div>{/if}
    {#if item.private}
      <p class="muted small priv-line">📍 {[item.private.place, item.private.country].filter(Boolean).join(", ")}{#if app.trip.place === item.private.place}{` · ${t("priv.destLine")}`}{/if}
        {#if !access.readonly}<button class="linkbtn priv-edit" onclick={e => { e.stopPropagation(); openPrivStay(item.id); }}>{t("priv.edit")} ›</button>{/if}</p>
    {/if}
    <div class="facts">
      {#if item.private}<span class="fact">🏠 {t("priv.label")}</span>{/if}
      {#if s?.stars}<span class="fact">{"★".repeat(s.stars)}</span>{/if}
      {#if s?.rating}<span class="fact">{t("stay.rating", { p: s.rating })}</span>{/if}
      {#each s?.facts || [] as f}<span class="fact">{f}</span>{/each}
      {#if r?.option}
        <!-- Verpflegung der Unterkunft: danach richtet sich die Verpflegung unter „Sonstiges“ -->
        <label class="fact board-fact" class:unknown={!s?.board} title={t("board.title")}>🍽
          <select value={s?.board || ""} disabled={access.readonly} aria-label={t("board.title")} onchange={e => setBoard(e.currentTarget.value as Board | "")}>
            {#if !s?.board}<option value="">{t("board.unknown")}</option>{/if}
            {#each BOARDS as b (b)}<option value={b}>{t(`board.${b}` as Key)}</option>{/each}
          </select>
        </label>
      {/if}
    </div>
    {#if nn}
      <div class="nights-n" title={tn("n.nights", nn)}><b class="num">{nn}</b> × <svg width="14" height="14" aria-hidden="true"><use href="#i-moon" /></svg></div>
    {/if}
    {#if sc?.over}<div class="warnline">⚠ {t("stay.over", { g: sc.maxOcc, c: r?.option?.price.capacity ?? "?" })}</div>{/if}
    {#if absent}<div class="warnline">⚠ {t("stay.empty", { n: tn("n.nights", absent) })}</div>{/if}
    {#if partial.length}<div class="muted">{t("stay.partial", { list: partial.join(", ") })}</div>{/if}
    <div class="stay-foot">
      <div class="pay">
        {#if item.status === "paid"}<span>{t("pay.full")}</span>
        {:else if r?.paid}<span>{t("pay.part", { a: eur(r.paid), b: eur(r.net) })}</span>
        {:else}<span>{t("pay.none")}</span>{/if}
        <div class="bar"><i style:width="{shown ? pct : 0}%"></i></div>
      </div>
      <div class="price r">
        <b class="num">{eur(r?.net || 0)}</b>
        {#if item.private && !r?.net}<span class="priv-free">{t("priv.free")}</span>
        {:else}<span>{nn ? t("perNight", { v: eur((r?.net || 0) / nn) }) : ""}{nn && r?.n ? ` · ${t("pp", { v: eur((r?.net || 0) / nn / r.n) })}` : ""}</span>{/if}
      </div>
    </div>
  </div>
</div>

{#if cmp}
  <StayCompare {item} {r} nights={nn} onchoose={choose} ondrop={drop} />
{/if}
