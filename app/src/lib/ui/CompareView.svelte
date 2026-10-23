<script lang="ts">
  /*
   * Vergleichsansicht (#430): Varianten eines Vergleichs kompakt nebeneinander, zum Lesen. Desktop: Spalten je Variante;
   * Handy: Kapitel untereinander, Varianten als Balken (#433, Fassung B). Bearbeitet wird nur am Rand: „Diese nehmen“,
   * „Bearbeiten“ (öffnet die Planung), umbenennen, aus dem Vergleich nehmen, Variante hinzufügen.
   */
  import { i18n, t, tn, type Key } from "../i18n/index.svelte";
  import SearchLoading from "./SearchLoading.svelte";
  import { addVariant, allTrips, app, editTrip, goHome, openTrip, splitCompare, switchTrip, takeVariant, tripFor } from "../store.svelte";
  import { eur } from "../calc";
  import { flagOf, range } from "../format";
  import { ccOf, loadGeo } from "../geo/places";
  import { geo } from "../geo/geo.svelte";
  import { cheapestId, column, explain, rowMin, rowSpread, sameTrip, shownRows, type Col, type RowKey } from "../compareView";
  import { isArchived, leaveCompare, pickedOf, variantLabel } from "../variants";
  import { addPoll, mergedVotes, newPoll, variantPoll, variantStand } from "../together";
  import { remoteVotes, vetoesNow } from "../polls.svelte";
  import { without } from "../without";
  import PollView from "./PollView.svelte";
  import { runWhatIf, whatIfRun } from "../watch.svelte";
  import { addDay, daysBetween } from "../together";
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
  /** archiviert (#429/#433): nach „Diese nehmen“ die anderen Varianten, bis sie wiederhergestellt werden */
  const archivedOf = (v: V) => isArchived({ id: v.id, cmp: v.tr.cmp }, picked);
  const nArchived = $derived(all.filter(archivedOf).length);
  // nach „Diese nehmen“: gewählte zuerst, die anderen eingeklappt (nicht gelöscht)
  const list = $derived(picked ? [all.find(v => v.id === picked.id)!, ...all.filter(v => v.id !== picked.id && (showAll || !archivedOf(v)))] : all.filter(v => showAll || !archivedOf(v)));
  const cols = $derived(list.map(v => v.col));
  // Ziele und Fahrzeit nur, wenn eine Variante eine Kreuzfahrt oder Rundreise an Land hat (#520)
  const facts = $derived(cols.some(c => c.facts));
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

  // umentscheiden: frühere Wahl aufheben, die anderen archivieren (nicht löschen, #433)
  async function take(v: V) { await takeVariant(v.id); showAll = false; }
  /** Wahl zurücknehmen: alle Varianten wieder sichtbar */
  async function untake(v: V) {
    await editTrip(v.id, tr => { if (tr.cmp) delete tr.cmp.chosen; });
    for (const o of all) if (o.tr.cmp?.archived) await editTrip(o.id, tr => { if (tr.cmp) delete tr.cmp.archived; });
  }
  /* ---------- Abstimmung über die Varianten (#432) ---------- */
  // liegt in einer Variante; die wird im Hintergrund zur offenen Reise, damit Stimmen, „Wer bist du?“ und „Ohne mich“ greifen
  const host = $derived(all.find(v => { const p = variantPoll(v.tr); return p && !p.closed; }) ?? all.find(v => variantPoll(v.tr)));
  $effect(() => { if (host && app.trip.id !== host.id) switchTrip(host.id, "Vergleich: Abstimmung"); });
  const vpoll = $derived(host && app.trip.id === host.id ? variantPoll(app.trip) : undefined);
  const stand = $derived(vpoll ? variantStand(vpoll, mergedVotes(vpoll, remoteVotes(vpoll)), app.trip) : undefined);
  /** „Ohne mich“ je Variante (#439): wer, und was es für die anderen an dieser Variante bedeutet */
  const vetoFx = $derived.by(() => {
    const out: Record<string, { names: string; after: number; before: number }> = {};
    if (!vpoll) return out;
    const now = vetoesNow(vpoll);
    for (const o of vpoll.options) {
      const v = all.find(x => x.id === o.tripId), ids = now[o.id] || [];
      if (!v || !ids.length) continue;
      const w = without(v.tr, ids, undefined, geo);
      out[v.id] = { names: ids.map(x => v.tr.travelers.find(y => y.id === x)?.name || "?").join(", "), after: w.after.perPerson, before: w.before.perPerson };
    }
    return out;
  });
  const canPoll = $derived(all.some(v => v.edit) && all.filter(v => !archivedOf(v)).length > 1);
  function startPoll() {
    // in der geteilten Variante mit den meisten Mitgliedern (dort stimmen alle ab), sonst in der ersten bearbeitbaren
    const h = all.filter(v => v.edit).sort((a, b) => Number(b.cloud) - Number(a.cloud) || b.members.length - a.members.length)[0];
    if (!h) return;
    const p = newPoll(t("cmpv.pollQ", { title }), "variants", all.filter(v => !archivedOf(v)).map(v => ({ label: v.label, tripId: v.id })), "one");
    void editTrip(h.id, tr => addPoll(tr, p));
  }
  function removePoll() {
    if (!vpoll || !confirm(t("poll.removeQ"))) return;
    app.trip.polls = (app.trip.polls || []).filter(p => p.id !== vpoll.id);
    if (!app.trip.polls.length) delete app.trip.polls;
  }
  async function restore(v: V) { await editTrip(v.id, tr => { if (tr.cmp) delete tr.cmp.archived; }); }
  async function rename(v: V) {
    const x = prompt(t("tm.renameVarQ"), v.label)?.trim();
    if (x) await editTrip(v.id, tr => { if (tr.cmp) tr.cmp.label = x.slice(0, 60); });
  }
  async function remove(v: V) {
    if (confirm(t("cmpv.removeQ", { x: v.label }))) await editTrip(v.id, leaveCompare);
  }
  /* ---------- „Was wäre wenn …“ (#430): Variante mit anderem Zeitraum, Abflughafen oder Nächten, Preise neu gesucht ---------- */
  let wi = $state<{ base: string; from: string; to: string; airport: string } | null>(null);
  const airportOf = (tr: Trip) => tr.items.find(i => i.cat === "flights")?.options.find(o => o.legs?.length)?.legs?.find(l => l.dir === "out")?.from || "";
  function openWhatIf() {
    const b = (picked && all.find(v => v.id === picked.id)) || first;
    if (b) wi = { base: b.id, from: b.tr.from || "", to: b.tr.to || "", airport: airportOf(b.tr) };
  }
  const wiBase = $derived(wi ? all.find(v => v.id === wi!.base) : undefined);
  const wiNights = $derived(wi?.from && wi.to ? daysBetween(wi.from, wi.to) : 0);
  function setBase(id: string) { const b = all.find(v => v.id === id); if (b && wi) wi = { base: id, from: b.tr.from || "", to: b.tr.to || "", airport: airportOf(b.tr) }; }
  function nights(d: number) { if (wi?.from && wi.to && wiNights + d >= 1) wi.to = addDay(wi.to, d); }
  async function goWhatIf() {
    if (!wi || !wiBase) return;
    const b = wiBase.tr, parts = [
      wi.from !== b.from || wi.to !== b.to ? range(wi.from, wi.to) : "",
      wi.airport && wi.airport.toUpperCase() !== airportOf(b) ? t("whatif.from", { x: wi.airport.toUpperCase() }) : ""
    ].filter(Boolean);
    if (!parts.length) { wi = null; return; }
    await runWhatIf(wi.base, { from: wi.from, to: wi.to, ...(wi.airport ? { airport: wi.airport } : {}) }, `${wiBase.label} · ${parts.join(" · ")}`);
    wi = null;
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
      {#if first?.edit}· <button class="linkbtn cv-add" onclick={add}>+ {t("cmpv.add")}</button>
        · <button class="linkbtn cv-whatif" onclick={openWhatIf} aria-expanded={!!wi}>⚡ {t("whatif.title")}</button>{/if}
      {#if all.some(v => v.edit)}· <button class="linkbtn cv-split" onclick={split}>✂ {t("cmpv.split")}</button>{/if}</p>

    {#if wi}
      <div class="cv-wi" role="group" aria-label={t("whatif.title")}>
        <p class="small muted">{t("whatif.hint")}</p>
        <div class="ed-row">
          {#if all.length > 1}<label class="f">{t("whatif.base")}<select value={wi.base} onchange={e => setBase(e.currentTarget.value)}>{#each all.filter(v => v.edit) as v (v.id)}<option value={v.id}>{v.label}</option>{/each}</select></label>{/if}
          <label class="f">{t("imp.rev.from")}<input class="wi-from" type="date" bind:value={wi.from} /></label>
          <label class="f">{t("imp.rev.to")}<input class="wi-to" type="date" bind:value={wi.to} /></label>
          <span class="f">{t("whatif.nights")}<span class="qf-step"><button type="button" onclick={() => nights(-1)} disabled={wiNights <= 1} aria-label={t("step.less", { what: t("whatif.nights") })}>−</button><b class="num qf-n">{wiNights}</b><button type="button" onclick={() => nights(1)} aria-label={t("step.more", { what: t("whatif.nights") })}>+</button></span></span>
          <label class="f">{t("whatif.airport")}<input class="wi-ap" maxlength="3" size="4" bind:value={wi.airport} placeholder="DUS" /></label>
        </div>
        <p class="fu-acts">
          <button class="btn sm primary wi-go" class:busy={whatIfRun.busy} disabled={whatIfRun.busy || !wi.from || !wi.to || wi.to <= wi.from} onclick={goWhatIf}>{whatIfRun.busy ? t("whatif.busy") : t("whatif.go")}</button>
          <button class="btn sm" onclick={() => (wi = null)}>{t("cancel")}</button>
        </p>
      </div>
    {/if}
    {#if whatIfRun.busy}<SearchLoading kind="flights" cards={0} steps={[t("whatif.busy"), t("load.flights.2"), t("load.stay.1")]} />{/if}
    {#if whatIfRun.msg}<p class="small cv-wi-msg" role="status">{whatIfRun.msg}</p>{/if}
    <div class="chips cv-mode" role="group" aria-label={t("cmpv.rows")}>
      <button class="chip sm" class:on={!diffMode} aria-pressed={!diffMode} onclick={() => (onlyDiff = false)}>{t("cmpv.all")}</button>
      <button class="chip sm" class:on={diffMode} aria-pressed={diffMode} onclick={() => (onlyDiff = true)}>{t("cmpv.diff")}</button>
    </div>
    {#if picked}
      <p class="cv-picked">✓ {t("cmpv.pickedNote", { x: all.find(v => v.id === picked.id)?.label || "" })}
        {#if nArchived}<button class="linkbtn cv-others" onclick={() => (showAll = !showAll)}>{showAll ? t("cmpv.hideOthers") : tn("cmpv.archivedN", nArchived)}</button>{/if}</p>
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
            {#if stand?.byTrip[v.id]}<small class="cv-votes">🗳 {tn("poll.forN", stand.byTrip[v.id].for)}{stand.byTrip[v.id].veto ? ` · ✕ ${stand.byTrip[v.id].veto}` : ""}</small>{/if}
            {#if vetoFx[v.id]}{@const f = vetoFx[v.id]}<small class="cv-veto">✕ {t("cmpv.vetoFx", { names: f.names, after: eur(f.after), before: eur(f.before) })}</small>{/if}
            <span class="cv-acts">
              {#if v.edit}
                {#if picked?.id === v.id}<button class="btn sm cv-untake" onclick={() => untake(v)}>✓ {t("cmpv.taken")}</button>
                {:else}<button class="btn sm primary cv-take" onclick={() => take(v)}>{t("cmpv.take")}</button>{/if}
                {#if archivedOf(v)}<button class="btn sm cv-restore" onclick={() => restore(v)}>↩ {t("cmpv.restore")}</button>{/if}
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
      <!-- Kreuzfahrt gegen Rundreise an Land (#520): Ziele und Fahrzeit an Land -->
      {#if facts}
        <div class="cv-row cv-facts" role="row" data-row="places">
          <div class="cv-lab" role="rowheader"><b>{t("cl.places")}</b></div>
          {#each list as v (v.id)}<div class="cv-cell" role="cell">{v.col.facts ? tn("cl.placesN", v.col.facts.places) : "–"}</div>{/each}
        </div>
        <div class="cv-row cv-facts" role="row" data-row="moving">
          <div class="cv-lab" role="rowheader"><b>{t("cl.moving")}</b></div>
          {#each list as v (v.id)}<div class="cv-cell" role="cell">{v.col.facts ? (v.col.facts.hours ? t("cl.hours", { h: v.col.facts.hours }) : v.col.facts.cruise ? t("cl.atSea") : "–") : "–"}</div>{/each}
        </div>
      {/if}
    </div>
    {#if !rows.length}<p class="muted">{t("cmpv.noDiff")}</p>{/if}

    <!-- Handy: Kapitel untereinander, Varianten als Balken -->
    <div class="cv-mob">
      <div class="cv-sum">
        {#each list as v (v.id)}
          <div class="cv-s" class:win={picked?.id === v.id}><span aria-hidden="true">{flag(v)}</span><b class="num">{eur(v.col.total)}</b><small>{t("perPerson", { v: eur(v.col.perPerson) })}</small><small class="cv-sl">{v.label}</small>
            {#if facts && v.col.facts}<small class="cv-facts-m">{tn("cl.placesN", v.col.facts.places)} · {v.col.facts.hours ? t("cl.hours", { h: v.col.facts.hours }) : v.col.facts.cruise ? t("cl.atSea") : "–"}</small>{/if}</div>
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
          {#if v.edit && archivedOf(v)}<button class="btn sm cv-restore" onclick={() => restore(v)}>{flag(v)} ↩ {t("cmpv.restore")}</button>{/if}
          <button class="btn sm cv-edit" onclick={() => openTrip(v.id, "Vergleich")}>{flag(v)} {v.edit ? t("cmpv.edit") : t("cmpv.open")}</button>
        {/each}
      </div>
    </div>
    <!-- Abstimmung über die Varianten (#432), direkt unter dem Vergleich -->
    {#if vpoll}
      <section class="cv-poll" aria-label={t("cmpv.poll")}><PollView p={vpoll} onremove={removePoll} /></section>
    {:else if canPoll}
      <p class="cv-poll-start"><button class="btn sm" onclick={startPoll}>🗳 {t("cmpv.pollStart")}</button> <small class="muted">{t("cmpv.pollHint")}</small></p>
    {/if}
    <AppFooter home />
  </div>
</section>

<style>
  .cv-back { align-self: flex-start; padding: 0; font-weight: 600; }
  .cv-title { margin: 6px 0 2px; }
  .cv-meta { margin: 0 0 10px; color: var(--ink-2); }
  .cv-mode { margin-bottom: 10px; }
  .cv-picked { margin: 0 0 10px; font-weight: 600; color: var(--good); }
  .cv-votes { color: var(--idea); font-weight: 700; }
  .cv-wi { border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; margin: 0 0 12px; text-align: start; background: var(--paper); }
  .cv-wi .ed-row { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; }
  .cv-wi-msg { color: var(--warn); text-align: start; }
  .cv-veto { color: #C4452E; }
  .cv-poll { margin: 16px 0; text-align: start; }
  .cv-poll-start { margin: 16px 0; text-align: start; }
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
  .cv-acts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: auto; padding-top: 8px; }
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
