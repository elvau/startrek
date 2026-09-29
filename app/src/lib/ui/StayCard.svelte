<script lang="ts">
  import { t, tn, type Key } from "../i18n/index.svelte";
  import { BOARDS, type Board, type Item } from "../model";
  import { access, app, calc } from "../store.svelte";
  import { eur } from "../calc";
  import { dateDE } from "../format";
  import StatusBadge from "./StatusBadge.svelte";

  let { item }: { item: Item } = $props();
  const r = $derived(calc.T.items[item.id]);
  const s = $derived(r?.option?.stay);
  const sc = $derived(r?.stay);
  const nn = $derived(sc ? sc.nights.length : s?.nights || r?.option?.price.qty || 0);
  // Gäste, die nicht alle Nächte da sind
  const partial = $derived(sc ? Object.entries(sc.w).filter(([, w]) => w < sc.nights.length).map(([id, w]) => `${app.trip.travelers.find(x => x.id === id)?.name || "?"} ${tn("n.nights", w)}`) : []);
  const absent = $derived(sc ? sc.nights.filter(x => !sc.occ[x]).length : 0);
  const pct = $derived(r && r.net ? Math.min(100, (r.paid / r.net) * 100) : 0);
  /** Verpflegung am gewählten Angebot setzen (die Verpflegung unter „Sonstiges“ folgt automatisch) */
  function setBoard(b: Board | "") {
    const o = item.options.find(x => x.id === r?.option?.id);
    if (!o) return;
    o.stay = { ...(o.stay || {}), board: b || undefined };
  }
  let imgFailed = $state(false);
  let shown = $state(false);
  $effect(() => { const tm = setTimeout(() => (shown = true), 300); return () => clearTimeout(tm); });
</script>

<div class="stay">
  <div class="stay-img" aria-hidden="true">
    <!-- Bild der Unterkunft vom Anbieter (Trivago), sonst die Zeichnung -->
    {#if s?.image && !imgFailed}<img class="stay-photo" src={s.image} alt="" loading="lazy" referrerpolicy="no-referrer" onerror={() => (imgFailed = true)} />{/if}
    <svg viewBox="0 0 220 200" preserveAspectRatio="xMidYMax slice"><circle cx="160" cy="60" r="22" fill="#FFE7B0" opacity=".9" /><path d="M0 150 Q 60 120 120 140 T 220 130 V200 H0z" fill="#2B6F8F" opacity=".75" /><rect x="40" y="80" width="70" height="80" rx="4" fill="#F7EDE2" /><rect x="52" y="94" width="14" height="14" fill="#E9A15A" /><rect x="84" y="94" width="14" height="14" fill="#E9A15A" /><rect x="52" y="120" width="14" height="14" fill="#E9A15A" /><rect x="84" y="120" width="14" height="14" fill="#E9A15A" /><path d="M34 82 L75 58 L116 82z" fill="#C4513C" /></svg>
  </div>
  <div class="stay-b">
    <div class="stay-hd">
      <StatusBadge status={item.status} />
      {#if item.booking?.provider}<span class="muted">{item.booking.provider}{item.booking.cancelUntil ? ` · ${t("stay.freeCancel", { d: dateDE(item.booking.cancelUntil) })}` : ""}</span>{/if}
    </div>
    <h3>{item.name || t("stay.new")}</h3>
    {#if r?.option?.label && r.option.label !== item.name}<div class="stay-opt">{r.option.label}{r.option.source?.name ? ` · ${r.option.source.name}` : ""}{item.options.length > 1 ? ` · ${tn("n.offers", item.options.length)}` : ""}</div>{/if}
    {#if item.from && item.to}<div class="muted">{t("range.fromTo", { a: dateDE(item.from), b: dateDE(item.to) })} · {tn("n.nights", nn)}{r?.stay ? ` · ${t("stay.upTo", { g: tn("n.guests", r.stay.maxOcc) })}` : ""}</div>{/if}
    <div class="facts">
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
      <div class="nights" class:in={shown}>
        {#each Array(Math.min(nn, 31)) as _, i}
          {@const x = sc?.nights[i]}
          <span style="transition-delay:{i * 60}ms" class:empty={x && !sc?.occ[x]} title={x ? `${dateDE(x)}: ${tn("n.guests", sc?.occ[x] || 0)}` : ""}><svg width="13" height="13"><use href="#i-moon" /></svg></span>
        {/each}
      </div>
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
        <span>{nn ? t("perNight", { v: eur((r?.net || 0) / nn) }) : ""}{nn && r?.n ? ` · ${t("pp", { v: eur((r?.net || 0) / nn / r.n) })}` : ""}</span>
      </div>
    </div>
  </div>
</div>
