<script lang="ts">
  /*
   * Vergleichsansicht (#430): Varianten eines Vergleichs kompakt nebeneinander, zum Lesen. Desktop: Spalten je Variante;
   * Handy: Kapitel untereinander, Varianten als Balken (#433, Fassung B). Bearbeitet wird nur am Rand: „Diese nehmen“,
   * „Bearbeiten“ (öffnet die Planung), umbenennen, aus dem Vergleich nehmen, Variante hinzufügen.
   */
  import { i18n, t, tn, type Key } from "../i18n/index.svelte";
  import { addVariant, allTrips, app, editTrip, goHome, openTrip, splitCompare, switchTrip, tripFor } from "../store.svelte";
  import { eur } from "../calc";
  import { flagOf, range } from "../format";
  import { ccOf, loadGeo } from "../geo/places";
  import { geo } from "../geo/geo.svelte";
  import { cheapestId, column, explain, rowMin, rowSpread, sameTrip, shownRows, type Col, type RowKey } from "../compareView";
  import { leaveCompare, pickedOf, variantLabel } from "../variants";
  import TopNav from "./TopNav.svelte";
  import AiMark from "./AiMark.svelte";
  import AppFooter from "./AppFooter.svelte";
  import type { Trip } from "../model";

  const id = $derived(app.compare || "");
  type V = { id: string; tr: Trip; label: string; col: Col; edit: boolean; cloud: boolean; members: string[] };
  const all = $derived<V[]>(allTrips().map(m => ({ m, tr: tripFor(m.id) })).filter(x => x.tr?.cmp?.id === id)
    .map(({ m, tr }) => ({ id: m.id, tr: tr!, label: variantLabel(tr!), col: column(tr!), edit: m.role !== "viewer", cloud: m.cloud, members: m.members || [] }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.lang, { numeric: true })));
  const picked = $derived(pickedOf(all.map(v => ({ id: v.id, cmp: v.tr.cmp }))));
  let showAll = $state(false);
  // nach „Diese nehmen“: gewählte zuerst, die anderen eingeklappt (nicht gelöscht)
  const list = $derived(picked ? [all.find(v => v.id === picked.id)!, ...(showAll ? all.filter(v => v.id !== picked.id) : [])] : all);
  const cols = $derived(list.map(v => v.col));
  const low = $derived(cheapestId(all.map(v => v.col)));
  const ref = $derived(all.find(v => v.id === low)?.col);
  // Varianten derselben Reise (Juni statt Juli): standardmäßig nur Unterschiede
  let onlyDiff = $state<boolean | null>(null);
  const diffMode = $derived(onlyDiff ?? sameTrip(all.map(v => v.tr)));
  const rows = $derived(shownRows(cols, diffMode && cols.length > 1));
  const first = $derived(all[0]);
  const sameDates = $derived(all.every(v => v.tr.from === first?.tr.from && v.tr.to === first?.tr.to));
  const title = $derived(first?.tr.cmp?.title || "");

  $effect(() => { if (all.length) loadGeo(geo, []); });
  // aufgelöst (nur noch eine oder keine Variante): zurück zur Startseite
  $effect(() => { if (app.compare && all.length < 2 && allTrips().length) goHome(); });

  const flag = (v: V) => { const cc = v.tr.country && geo.world.length ? ccOf(geo, v.tr.country) : null; return cc ? flagOf(cc) : "📍"; };
  const where = (v: V) => [v.tr.place, v.tr.country].filter(Boolean).join(", ");
  const signed = (x: number) => `${x > 0 ? "+" : "−"}${eur(Math.abs(x))}`;
  const rowName = (k: RowKey) => (k === "hidden" ? t("cmpv.hidden") : t(`ch.${k}.label` as Key));
  const cellNote = (k: RowKey, c: Col) => {
    if (cols.length < 2) return "";
    const d = c.cells[k].sum - rowMin(cols, k);
    return d < 1 ? (rowSpread(cols, k) >= 1 ? t("cmpv.atMin") : "") : `+${eur(d)}`;
  };
  const why = (v: V) => {
    if (!ref || v.id === low) return "";
    const e = explain(ref, v.col);
    return e.parts.slice(0, 3).map(([k, d]) => `${rowName(k)} ${signed(d)}`).join(" · ");
  };
  const maxOf = (k: RowKey) => Math.max(1, ...cols.map(c => c.cells[k].sum));

  async function take(v: V) {
    const at = new Date().toISOString();
    // umentscheiden: frühere Wahl an anderen Varianten aufheben
    for (const o of all) if (o.id !== v.id && o.tr.cmp?.chosen) await editTrip(o.id, tr => { if (tr.cmp) delete tr.cmp.chosen; });
    await editTrip(v.id, tr => { if (tr.cmp) tr.cmp.chosen = at; });
    showAll = false;
  }
  async function untake(v: V) { await editTrip(v.id, tr => { if (tr.cmp) delete tr.cmp.chosen; }); }
  async function rename(v: V) {
    const x = prompt(t("tm.renameVarQ"), v.label)?.trim();
    if (x) await editTrip(v.id, tr => { if (tr.cmp) tr.cmp.label = x.slice(0, 60); });
  }
  async function remove(v: V) {
    if (confirm(t("cmpv.removeQ", { x: v.label }))) await editTrip(v.id, leaveCompare);
  }
  function add() {
    // Kopie der gewählten bzw. ersten Variante
    const base = picked?.id || first?.id;
    if (!base) return;
    switchTrip(base, "Vergleich");
    addVariant();
  }
  let menu = $state<string | null>(null);
  // Vergleich trennen: alle wieder eigene Reisen, danach zurück zur Startseite (Effekt oben)
  async function split() {
    if (confirm(t("cmpv.splitQ", { title, n: all.length }))) await splitCompare(id);
  }
</script>

<TopNav home />
<section class="start cmpv" data-ch="hero">
  <div class="home-in">
    <button class="linkbtn cv-back" onclick={goHome}>← {t("cmpv.back")}</button>
    <h1 class="home-title cv-title">{first?.cloud ? "☁ " : ""}{title}</h1>
    <p class="cv-meta">{[sameDates && first?.tr.from ? range(first.tr.from, first.tr.to) : "", first ? tn("n.persons", first.col.people) : "", first?.members.length ? t("home.with", { names: first.members.join(", ") }) : ""].filter(Boolean).join(" · ")}
      {#if first?.edit}· <button class="linkbtn cv-add" onclick={add}>+ {t("cmpv.add")}</button>{/if}
      {#if all.some(v => v.edit)}· <button class="linkbtn cv-split" onclick={split}>✂ {t("cmpv.split")}</button>{/if}</p>

    <div class="chips cv-mode" role="group" aria-label={t("cmpv.rows")}>
      <button class="chip sm" class:on={!diffMode} aria-pressed={!diffMode} onclick={() => (onlyDiff = false)}>{t("cmpv.all")}</button>
      <button class="chip sm" class:on={diffMode} aria-pressed={diffMode} onclick={() => (onlyDiff = true)}>{t("cmpv.diff")}</button>
    </div>
    {#if picked}
      <p class="cv-picked">✓ {t("cmpv.pickedNote", { x: all.find(v => v.id === picked.id)?.label || "" })}
        <button class="linkbtn cv-others" onclick={() => (showAll = !showAll)}>{showAll ? t("cmpv.hideOthers") : tn("cmpv.showOthers", all.length - 1)}</button></p>
    {/if}

    <!-- Desktop: Spalten je Variante -->
    <div class="cv-table" style="--n: {list.length}" role="table" aria-label={title}>
      <div class="cv-row cv-head" role="row">
        <div class="cv-lab" role="rowheader"><small class="muted">{tn("home.variants", all.length)}</small></div>
        {#each list as v (v.id)}
          <div class="cv-cell cv-var" class:win={picked?.id === v.id} role="columnheader" data-var={v.id}>
            <span class="cv-name"><span aria-hidden="true">{flag(v)}</span> <b>{v.label}</b>{#if v.tr.ai}<span class="ht-ai"><AiMark title={t("home.aiTag")} /></span>{/if}</span>
            <small class="muted">{[where(v), !sameDates && v.tr.from ? range(v.tr.from, v.tr.to) : ""].filter(Boolean).join(" · ")}</small>
            <b class="cv-total num">{eur(v.col.total)}</b>
            <small>{t("perPerson", { v: eur(v.col.perPerson) })}{#if v.id === low} · <span class="cv-low">{t("home.cheapest")}</span>{:else if ref} · <span class="cv-more">{signed(v.col.total - ref.total)}</span>{/if}</small>
            {#if why(v)}<small class="cv-why">{why(v)}</small>{/if}
            <span class="cv-acts">
              {#if v.edit}
                {#if picked?.id === v.id}<button class="btn sm cv-untake" onclick={() => untake(v)}>✓ {t("cmpv.taken")}</button>
                {:else}<button class="btn sm primary cv-take" onclick={() => take(v)}>{t("cmpv.take")}</button>{/if}
              {/if}
              <button class="btn sm cv-edit" onclick={() => openTrip(v.id, "Vergleich")}>{v.edit ? t("cmpv.edit") : t("cmpv.open")}</button>
              {#if v.edit}
                <span class="cv-more-wrap">
                  <button class="btn sm cv-menu" aria-label={t("cmpv.more")} aria-expanded={menu === v.id} onclick={() => (menu = menu === v.id ? null : v.id)}>⋯</button>
                  {#if menu === v.id}
                    <span class="cv-pop">
                      <button class="linkbtn cv-rename" onclick={() => { menu = null; void rename(v); }}>✎ {t("cmpv.rename")}</button>
                      <button class="linkbtn cv-remove" onclick={() => { menu = null; void remove(v); }}>{t("cmpv.remove")}</button>
                    </span>
                  {/if}
                </span>
              {/if}
            </span>
          </div>
        {/each}
      </div>
      {#each rows as k (k)}
        <div class="cv-row" class:hidden-row={k === "hidden"} role="row" data-row={k}>
          <div class="cv-lab" role="rowheader"><b>{rowName(k)}</b>{#if k === "hidden"}<small class="muted">{t("cmpv.hiddenSub")}</small>{/if}</div>
          {#each list as v (v.id)}
            {@const c = v.col.cells[k]}
            {@const note = cellNote(k, v.col)}
            <div class="cv-cell" role="cell">
              <b class="num" class:cv-min={note === t("cmpv.atMin")}>{eur(c.sum)}</b>
              {#if c.names.length}<small class="muted">{c.names.slice(0, 3).join(" · ")}</small>{/if}
              {#if note}<small class={note.startsWith("+") ? "cv-more" : "cv-low"}>{note}</small>{/if}
            </div>
          {/each}
        </div>
      {/each}
    </div>
    {#if !rows.length}<p class="muted">{t("cmpv.noDiff")}</p>{/if}

    <!-- Handy: Kapitel untereinander, Varianten als Balken -->
    <div class="cv-mob">
      <div class="cv-sum">
        {#each list as v (v.id)}
          <div class="cv-s" class:win={picked?.id === v.id}><span aria-hidden="true">{flag(v)}</span><b class="num">{eur(v.col.total)}</b><small>{t("perPerson", { v: eur(v.col.perPerson) })}</small><small class="cv-sl">{v.label}</small></div>
        {/each}
      </div>
      {#each rows as k (k)}
        <article class="cv-ch" class:hidden-row={k === "hidden"} data-row={k}>
          <header><b>{rowName(k)}</b>{#if cols.length > 1}<small class="muted">{t("cmpv.spread", { v: eur(rowSpread(cols, k)) })}</small>{/if}</header>
          {#each list as v (v.id)}
            {@const c = v.col.cells[k]}
            {@const m = cols.length > 1 && c.sum - rowMin(cols, k) < 1 && rowSpread(cols, k) >= 1}
            <div class="cv-bar">
              <span class="cv-bl"><span aria-hidden="true">{flag(v)}</span> <small>{c.names.slice(0, 2).join(" · ") || v.label}</small></span>
              <b class="num" class:cv-min={m}>{eur(c.sum)}</b>
              <span class="cv-track" aria-hidden="true"><span class:cv-min={m} style="width: {Math.round((c.sum / maxOf(k)) * 100)}%"></span></span>
            </div>
          {/each}
        </article>
      {/each}
      <div class="cv-mob-acts">
        {#each list as v (v.id)}
          {#if v.edit && picked?.id !== v.id}<button class="btn sm primary cv-take" onclick={() => take(v)}>{flag(v)} {t("cmpv.takeShort")}</button>{/if}
          <button class="btn sm cv-edit" onclick={() => openTrip(v.id, "Vergleich")}>{flag(v)} {v.edit ? t("cmpv.edit") : t("cmpv.open")}</button>
        {/each}
      </div>
    </div>
    <AppFooter home />
  </div>
</section>

<style>
  .cv-back { align-self: flex-start; padding: 0; font-weight: 600; }
  .cv-title { margin: 6px 0 2px; }
  .cv-meta { margin: 0 0 10px; color: var(--ink-2); }
  .cv-mode { margin-bottom: 10px; }
  .cv-picked { margin: 0 0 10px; font-weight: 600; color: var(--good); }
  .cv-table, .cv-mob, .cv-picked, .cv-mode { text-align: start; }
  .cv-mode { justify-content: center; }
  .cv-table { display: grid; overflow-x: auto; border-radius: 18px; border: 1px solid var(--glass-line); background: var(--paper); box-shadow: 0 20px 50px -24px rgba(14, 36, 56, .45); }
  .cv-row { display: grid; grid-template-columns: 150px repeat(var(--n), minmax(210px, 1fr)); border-top: 1px solid var(--line); }
  .cv-head { border-top: 0; }
  .cv-lab, .cv-cell { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; min-width: 0; }
  .cv-lab { border-inline-end: 1px solid var(--line); justify-content: flex-start; }
  .cv-head .cv-lab { justify-content: flex-end; }
  .cv-var.win { background: color-mix(in srgb, var(--good) 8%, transparent); }
  .cv-name { display: flex; align-items: center; gap: 6px; font-size: 15px; }
  .cv-total { font-size: 22px; font-weight: 800; margin-top: 4px; }
  .cv-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .cv-more-wrap { position: relative; }
  .cv-pop { position: absolute; z-index: 5; top: 100%; inset-inline-start: 0; display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; background: var(--paper); border: 1px solid var(--line); box-shadow: 0 10px 30px -12px rgba(14, 36, 56, .4); white-space: nowrap; }
  .cv-pop .linkbtn { padding: 0; text-align: start; }
  .cv-why { color: var(--ink-2); }
  .cv-low, .cv-min { color: var(--good); font-weight: 700; }
  .cv-more { color: var(--warn); font-weight: 700; }
  .hidden-row { background: repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in srgb, var(--warn) 10%, transparent) 8px 16px); }
  .cv-mob { display: none; }
  .cv-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
  .cv-s { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px; border-radius: 14px; background: var(--paper); border: 1px solid var(--glass-line); text-align: center; min-width: 0; }
  .cv-s.win { border-color: var(--good); }
  .cv-sl { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); }
  .cv-ch { display: grid; gap: 8px; padding: 12px 14px; border-radius: 16px; background: var(--paper); border: 1px solid var(--glass-line); }
  .cv-ch header { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .cv-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; }
  .cv-bl { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cv-track { grid-column: 1 / -1; height: 6px; border-radius: 99px; background: var(--paper-2); overflow: hidden; }
  .cv-track span { display: block; height: 100%; border-radius: 99px; background: var(--a); }
  .cv-track span.cv-min { background: var(--good); }
  .cv-mob-acts { display: flex; flex-wrap: wrap; gap: 6px; }
  @media (max-width: 720px) {
    .cv-table { display: none; }
    .cv-mob { display: grid; gap: 10px; }
  }
</style>
