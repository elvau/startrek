<script lang="ts">
  /*
   * Gemeinsam planen (#173) im Kapitel der Reisenden: Termin finden (wer wann kann, beste Zeiträume) und Abstimmungen
   * über Termine, Angebote oder frei. Eintragen und abstimmen für jede Person (wie die übrigen Reisedaten); wer man
   * selbst ist, merkt sich das Gerät je Reise.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { cloud, cloudSelf, cloudTrip, cloudVotes, saveMySelf } from "../cloud/cloud.svelte";
  import { travelerOf } from "../claims";
  import { memberState, mergedAvail, selfRows } from "../self";
  import { dateDE, dayShort } from "../format";
  import Help from "./Help.svelte";
  import PollView from "./PollView.svelte";
  import Deciders from "./Deciders.svelte";
  import PlanCfg from "./PlanCfg.svelte";
  import { calBase, calState, ensureCal, fitWhy, regionLabel } from "../calendarApp.svelte";
  import { defaultCfg, fits, fittingStarts, isWeekend, usefulDays, type DaysCfg } from "../datefit";
  import { getLocalMe, setLocalMe, sharedVoting } from "../polls.svelte";
  import { addDay, addPoll, applyResult, bestPeriods, cycle, grownUps, missing, newPoll, notDeciding, planDays, planError, setAvail, tally, vote, voters, type Avail, type Period, type PollMode, type Vote } from "../together";

  const trip = $derived(app.trip);
  const people = $derived(voters(trip));
  // Begleitung (#567): reist mit, trägt aber nichts ein
  const others = $derived(notDeciding(trip));
  const plan = $derived(trip.avail);
  const days = $derived(plan ? planDays(plan) : []);
  // selbst Eingetragenes (#571): eigene Zeile über das eigene Konto, auch mit „nur ansehen“; für andere gesperrt
  const ct = $derived(cloudTrip(trip.id));
  const claims = $derived(ct?.claims || {});
  const selfs = $derived(cloudSelf.trip === trip.id ? cloudSelf.byUid : {});
  const myUid = $derived(ct && cloud.user ? cloud.user.uid : "");
  const mine = $derived(myUid ? travelerOf(trip, myUid, claims)?.id : undefined);
  const by = $derived(mergedAvail(trip, selfs, claims));
  const locked = $derived(selfRows(trip, selfs, claims));
  const entered = $derived(people.filter(x => by[x.id] && Object.keys(by[x.id]).length).length);
  const canTap = (id: string) => id === mine || (!access.readonly && !locked.has(id));
  // „Was noch fehlt“ für die eigene Person in einer geteilten Reise
  const voted = (pid: string) => !!(myUid && Object.keys(cloudVotes.byUid[myUid]?.[pid] || {}).length) || !!(mine && Object.keys(trip.polls?.find(p => p.id === pid)?.votes[mine] || {}).length);
  const todo = $derived(mine && myUid ? memberState(trip, myUid, selfs, claims, voted) : null);
  const nameOf = (id: string) => trip.travelers.find(x => x.id === id)?.name || "?";

  // neuer Planungszeitraum: ab heute in drei Wochen, acht Wochen lang, Nächte wie die Reise (sonst 7)
  // erst eingeklappt mit Erklärung: die Felder sehen sonst wie das Reisedatum aus
  let draft = $state<DaysCfg & { from: string; to: string; nights: number }>({ from: "", to: "", nights: 7 }), fOpen = $state(false);
  const fErr = $derived(planError(draft.from, draft.to, draft.nights));
  const pErr = $derived(plan ? planError(plan.from, plan.to, plan.nights) : "");
  // Feiertage und Ferien der Familien (#568): sofort mit Regionen, Daten kommen nach
  $effect(() => { void ensureCal(trip); });
  const ctx = $derived(calState.ctx ?? calBase(trip));
  function openForm() {
    const today = new Date().toISOString().slice(0, 10);
    const from = trip.from && trip.from > today ? addDay(trip.from, -14) : addDay(today, 21);
    const n = trip.from && trip.to ? Math.max(1, Math.round((Date.parse(trip.to) - Date.parse(trip.from)) / 86400000)) : 7;
    draft = { from, to: addDay(from, 56), nights: n, ...defaultCfg(ctx) };
    fOpen = true;
  }
  function startPlan() {
    if (fErr) return;
    const { from, to, nights, ...cfg } = $state.snapshot(draft);
    fOpen = false;
    trip.avail = { ...Object.fromEntries(Object.entries(cfg).filter(([k, v]) => v != null && !(k === "days" && v === "all") && !(k === "ferien" && v === "take"))), from, to: to > from ? to : addDay(from, 56), nights: nights > 0 ? nights : 7, by: {} };
  }
  let cfgOpen = $state(false);
  // passende Zeiträume (#568): mit Einschränkungen nur diese, das Raster zeigt nur ihre Tage
  const filtered = $derived(!!plan && (plan.days === "weekend" || !!plan.school || (!!plan.ferien && plan.ferien !== "take")));
  const okFn = $derived(plan && filtered ? (from: string, to: string) => fits(from, to, plan, ctx).ok : undefined);
  const starts = $derived(plan && filtered ? fittingStarts(days, plan.nights, plan.to, plan, ctx) : null);
  const useful = $derived(starts && plan ? usefulDays(starts, plan.nights) : null);
  const off = (d: string) => !!useful && !useful.has(d);
  const anyPub = (d: string) => Object.keys(ctx.regions).map(r => ctx.marks[r]?.[d]?.pub).find(Boolean);
  /** Spalten des Rasters: Tage, unpassende am Stück als ein schmaler Trenner (#569) */
  type Col = { d: string; gap?: undefined; mm: boolean } | { gap: number; d: string; to: string };
  const cols = $derived.by(() => {
    const out: Col[] = [];
    let lastMonth = "";
    for (const d of days) {
      if (off(d)) {
        const l = out[out.length - 1];
        if (l?.gap) { l.gap++; l.to = d; } else out.push({ gap: 1, d, to: d });
        continue;
      }
      out.push({ d, mm: d.slice(5, 7) !== lastMonth });
      lastMonth = d.slice(5, 7);
    }
    return out;
  });
  const ferienRegions = $derived(Object.keys(ctx.regions).filter(r => Object.values(ctx.marks[r] || {}).some(m => m.school)));
  const best = $derived(plan ? bestPeriods({ ...trip, avail: { ...plan, by } }, 3, okFn) : []);
  const SIGN: Record<Avail, string> = { yes: "✓", maybe: "~", no: "✕" };
  function tap(id: string, d: string) {
    if (!canTap(id)) return;
    const next = cycle(by[id]?.[d]);
    if (id === mine) {
      const a = { ...(by[id] || {}) };
      if (next) a[d] = next; else delete a[d];
      void saveMySelf(trip.id, { a });
    }
    if (!access.readonly) setAvail(trip, id, d, next);
  }

  /* ---------- Ziehen mit der Maus (#569): links ✓, rechts ✕; einzelner Klick wie bisher ---------- */
  let drag = $state<{ id: string; v: Avail; start: string; changes: Record<string, Avail>; moved: boolean } | null>(null);
  let skipClick = false;
  const fine = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
  const shown = (id: string, d: string) => (drag?.id === id && d in drag.changes ? drag.changes[d] : by[id]?.[d]);
  function dragStart(e: PointerEvent, id: string, d: string) {
    if (e.pointerType !== "mouse" || (e.button !== 0 && e.button !== 2) || !canTap(id) || off(d)) return;
    drag = { id, v: e.button === 2 ? "no" : "yes", start: d, changes: {}, moved: false };
    if (e.button === 2) drag.changes[d] = "no";
    window.addEventListener("pointerup", dragEnd, { once: true });
  }
  function dragOver(id: string, d: string) {
    if (!drag || drag.id !== id) return;
    drag.moved = true;
    // alle Tage zwischen Start und hier (schnelles Ziehen überspringt sonst Kästchen), unpassende nicht
    const [a, b] = drag.start < d ? [drag.start, d] : [d, drag.start];
    for (let x = a; x <= b; x = addDay(x, 1)) if (!off(x)) drag.changes[x] = drag.v;
  }
  function dragEnd() {
    const g = drag;
    drag = null;
    if (!g || (!g.moved && g.v === "yes")) return;
    // der Klick nach dem Loslassen (nur wenn auf demselben Kästchen) soll nicht noch einmal umschalten
    skipClick = true;
    setTimeout(() => (skipClick = false), 0);
    applyDays(g.id, g.changes);
  }
  function click(id: string, d: string) {
    if (skipClick) { skipClick = false; return; }
    tap(id, d);
  }
  /** mehrere Tage einer Person auf einmal setzen (eigene Zeile über das Konto, sonst in der Reise) */
  function applyDays(id: string, changes: Record<string, Avail | undefined>) {
    if (!canTap(id) || !Object.keys(changes).length) return;
    if (id === mine) {
      const a = { ...(by[id] || {}) };
      for (const [d, v] of Object.entries(changes)) { if (v) a[d] = v; else delete a[d]; }
      void saveMySelf(trip.id, { a });
    }
    if (!access.readonly) for (const [d, v] of Object.entries(changes)) setAvail(trip, id, d, v);
  }

  /* ---------- Ansicht je Wochenende (#569): Raster oder Termine, auf dem Gerät gemerkt ---------- */
  let view = $state<"grid" | "blocks">((() => { try { return localStorage.getItem("rk2-tgview") === "blocks" ? "blocks" : "grid"; } catch { return "grid"; } })());
  function setView(v: "grid" | "blocks") { view = v; try { localStorage.setItem("rk2-tgview", v); } catch { /* egal */ } }
  /** Termine ohne Überschneidung in zeitlicher Reihenfolge, mit Grund */
  const blocks = $derived.by(() => {
    if (!plan || !starts) return [];
    const out: { from: string; to: string; why: string }[] = [];
    for (const st of starts) {
      if (out.length && st < out[out.length - 1].to) continue;
      const to = addDay(st, plan.nights);
      out.push({ from: st, to, why: fitWhy(fits(st, to, plan, ctx), ctx) });
    }
    return out;
  });
  let forId = $state("");
  const writer = $derived(mine || (people.some(x => x.id === forId && canTap(x.id)) ? forId : people.find(x => canTap(x.id))?.id || ""));
  function blockOf(id: string, from: string, to: string): Avail | undefined {
    const vs = new Set<Avail | undefined>();
    for (let d = from; d <= to; d = addDay(d, 1)) vs.add(by[id]?.[d]);
    return vs.size === 1 ? [...vs][0] : undefined;
  }
  function setBlock(id: string, from: string, to: string, v: Avail | undefined) {
    const ch: Record<string, Avail | undefined> = {};
    for (let d = from; d <= to; d = addDay(d, 1)) ch[d] = v;
    applyDays(id, ch);
  }
  function blockState(from: string, to: string) {
    let yes = 0, maybe = 0;
    for (const x of people) { const v = new Set<Avail | undefined>(); for (let d = from; d <= to; d = addDay(d, 1)) v.add(by[x.id]?.[d]); if (v.has("no") || v.has(undefined)) continue; if (v.has("maybe")) maybe++; else yes++; }
    return { yes, maybe };
  }

  function takeDates(r: Period) { trip.from = r.from; trip.to = r.to; }
  function pollDates() {
    const p = newPoll(t("poll.whenQ"), "dates", best.map(r => ({ label: `${dateDE(r.from)} – ${dateDE(r.to)}`, from: r.from, to: r.to })));
    addPoll(trip, p);
  }
  const who = (r: Period) => r.yes.length + r.maybe.length === people.length && !r.maybe.length
    ? t("tg.all", { n: people.length })
    : [t("tg.of", { a: r.yes.length + r.maybe.length, n: people.length }), r.no.length ? t("tg.without", { names: r.no.map(nameOf).join(", ") }) : "",
      r.maybe.length ? t("tg.maybe", { names: r.maybe.map(nameOf).join(", ") }) : "", r.open.length ? t("tg.open", { names: r.open.map(nameOf).join(", ") }) : ""].filter(Boolean).join(" · ");

  /* ---------- Abstimmen ---------- */
  const polls = $derived(trip.polls || []);
  let me = $state("");
  $effect(() => {
    const v = getLocalMe(trip.id);
    const guess = cloud.user?.name ? people.find(x => cloud.user!.name!.split(" ")[0] === x.name.split(" ")[0])?.id : undefined;
    me = people.some(x => x.id === v) ? v : guess || people[0]?.id || "";
  });
  function setMe(v: string) { me = v; setLocalMe(trip.id, v); }
  // „Ich bin“: auf dem Gerät; in geteilten Reisen stimmt jede Person mit dem eigenen Konto (nur alte 👍-Abstimmungen brauchen es noch)
  const showMe = $derived(!access.readonly && (!sharedVoting() || polls.some(p => !p.mode && !p.closed)));
  const VOTES: { v: Vote; s: string; k: "poll.up" | "poll.meh" | "poll.down" }[] = [{ v: 1, s: "👍", k: "poll.up" }, { v: 0, s: "😐", k: "poll.meh" }, { v: -1, s: "👎", k: "poll.down" }];

  let nq = $state(""), nopts = $state(""), adding = $state(false), nmode = $state<PollMode>("one"), nmiles = $state(10), ndue = $state("");
  function addFreePoll() {
    const opts = nopts.split("\n").map(s => s.trim()).filter(Boolean);
    if (!nq.trim() || opts.length < 2) return;
    const p = newPoll(nq, "free", opts.map(label => ({ label })), nmode);
    if (nmode === "miles") p.miles = Math.max(1, Math.min(p.options.length * 5, nmiles || 10));
    if (ndue) p.due = ndue;
    addPoll(trip, p);
    nq = ""; nopts = ""; ndue = ""; nmode = "one"; adding = false;
  }
  function removePoll(id: string) {
    if (!confirm(t("poll.removeQ"))) return;
    trip.polls = (trip.polls || []).filter(p => p.id !== id);
    if (!trip.polls.length) delete trip.polls;
  }
</script>

{#if grownUps(trip).length > 1}
<div class="tg">
  {#if todo?.who}
    {@const open = [todo.dates === false ? t("self.todoDates") : "", todo.polls ? tn("self.todoPolls", todo.polls) : "", !todo.home ? t("self.todoHome") : ""].filter(Boolean)}
    <p class="tg-todo small" class:done={!open.length}>{t("self.you", { name: todo.who.name })} {open.length ? t("self.todo", { list: open.join(" · ") }) : `✓ ${t("self.allDone")}`}</p>
  {/if}
  <Deciders />
  <h3>📅 {t("tg.title")} <Help k="avail" /></h3>
  {#if !plan}
    <p class="muted small tg-lead">{t("tg.lead")}</p>
    {#if !access.readonly}
      {#if !fOpen}
        <button class="btn sm tg-open" onclick={openForm}>{t("tg.begin")}</button>
      {:else}
        <div class="ed-row tg-new">
          <label class="f">{t("tg.from")}<input type="date" bind:value={draft.from} /></label>
          <label class="f">{t("tg.to")}<input type="date" bind:value={draft.to} min={draft.from} /></label>
          {#if draft.days !== "weekend"}<label class="f">{t("tg.nights")}<input class="n sm" type="number" min="1" max="60" bind:value={draft.nights} /></label>{/if}
        </div>
        <PlanCfg cfg={draft} {ctx} onextend={() => (draft.to = addDay(draft.to, 182))} />
        {#if fErr}<p class="warnline small tg-err">{t(fErr === "order" ? "tg.errOrder" : "tg.errNights")}</p>{/if}
        <button class="btn sm primary tg-start" disabled={!!fErr} onclick={startPlan}>{t("tg.start")}</button>
      {/if}
    {/if}
  {:else}
    <div class="ed-row tg-head">
      <label class="f">{t("tg.from")}<input type="date" bind:value={plan.from} disabled={access.readonly} /></label>
      <label class="f">{t("tg.to")}<input type="date" bind:value={plan.to} min={plan.from} disabled={access.readonly} /></label>
      {#if plan.days !== "weekend"}<label class="f">{t("tg.nights")}<input class="n sm" type="number" min="1" max="60" bind:value={plan.nights} disabled={access.readonly} /></label>{/if}
    </div>
    <p class="small tg-cfg"><span class="muted">{[plan.days === "weekend" ? `${t("tg.daysWe")} · ${tn("n.nights", plan.nights)}` : t("tg.daysAll"), plan.school ? t("tg.school") : "", plan.bridges ? t("tg.bridges") : "",
      plan.ferien === "avoid" ? `${t("tg.ferien")}: ${t("tg.ferAvoid")}` : plan.ferien === "only" ? `${t("tg.ferien")}: ${t("tg.ferOnly")}` : ""].filter(Boolean).join(" · ")}</span>
      <button class="linkbtn small tg-cfg-edit" onclick={() => (cfgOpen = !cfgOpen)} aria-expanded={cfgOpen}>{cfgOpen ? t("done") : access.readonly ? t("tg.daysShow") : t("tg.daysEdit")}</button></p>
    {#if cfgOpen}<PlanCfg cfg={plan} {ctx} ro={access.readonly} onextend={() => (plan.to = addDay(plan.to, 182))} />{/if}
    {#if pErr}<p class="warnline small tg-err">{t(pErr === "order" ? "tg.errOrder" : "tg.errNights")}</p>{/if}
    <p class="muted small">{t("tg.howTo")} <span class="tg-leg"><i class="yes">✓</i> {t("tg.yes")} <i class="maybe">~</i> {t("tg.maybeL")} <i class="no">✕</i> {t("tg.no")}</span></p>
    {#if plan.days === "weekend" && blocks.length}
      <div class="seg tg-view" role="group" aria-label={t("tg.view")}>
        <button type="button" class:on={view === "grid"} aria-pressed={view === "grid"} onclick={() => setView("grid")}>{t("tg.viewGrid")}</button>
        <button type="button" class:on={view === "blocks"} aria-pressed={view === "blocks"} onclick={() => setView("blocks")}>{t("tg.viewBlocks")}</button>
      </div>
    {/if}
    {#if view === "blocks" && plan.days === "weekend" && blocks.length}
      <!-- je Termin für alle Tage auf einmal (gleiche Daten wie das Raster) -->
      {#if !mine}<label class="f tg-for">{t("tg.for")}<select value={forId} onchange={e => (forId = e.currentTarget.value)}>{#each people.filter(x => canTap(x.id)) as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>{/if}
      <div class="tg-blocks">
        {#each blocks as b (b.from)}
          {@const st = blockState(b.from, b.to)}
          {@const cur = blockOf(writer, b.from, b.to)}
          <div class="tg-block">
            <div class="tg-bh"><b>{dayShort(b.from)} – {dayShort(b.to)}</b><span class="muted small">{t("tg.blockSum", { y: st.yes, m: st.maybe })}</span></div>
            {#if b.why}<span class="small tg-bwhy">{b.why}</span>{/if}
            <div class="tg-bbtn">
              {#each [["yes", "✓", "tg.yes"], ["maybe", "~", "tg.maybeL"], ["no", "✕", "tg.no"]] as const as [v, sg, k] (v)}
                <button type="button" class="tg-bv {v}" class:on={cur === v} aria-pressed={cur === v} disabled={!writer || !canTap(writer)} onclick={() => setBlock(writer, b.from, b.to, cur === v ? undefined : v)}>{sg} {t(k)}</button>
              {/each}
            </div>
            <span class="tg-bar" aria-hidden="true"><i class="y" style="width:{(st.yes / Math.max(1, people.length)) * 100}%"></i><i class="m" style="width:{(st.maybe / Math.max(1, people.length)) * 100}%"></i></span>
          </div>
        {/each}
      </div>
    {:else}
    <div class="tg-grid" class:compact={!!useful} role="grid" aria-label={t("tg.title")}>
      {#each ferienRegions as r (r)}
        <div class="tg-row tg-fer" aria-hidden="true">
          <span class="tg-name">{regionLabel(r)}</span>
          {#each cols as c (c.d)}{#if c.gap !== undefined}<span class="tg-gap"></span>{:else}<span class="tg-f" class:on={!!ctx.marks[r]?.[c.d]?.school} title={ctx.marks[r]?.[c.d]?.school || ""}></span>{/if}{/each}
        </div>
      {/each}
      <div class="tg-row tg-days" role="row">
        <span class="tg-name"></span>
        {#each cols as c (c.d)}
          {#if c.gap !== undefined}<span class="tg-gap" title={t("tg.gap", { a: dayShort(c.d), b: dayShort(c.to) })}></span>
          {:else}
            {@const h = anyPub(c.d)}
            <span class="tg-d" role="columnheader" class:we={isWeekend(c.d)} class:hol={!!h} title="{dayShort(c.d)}{h ? ` · ${h}` : ''}">{c.d.slice(8, 10)}{#if c.mm}<small>.{c.d.slice(5, 7)}</small>{/if}</span>
          {/if}
        {/each}
      </div>
      {#each people as x (x.id)}
        <div class="tg-row" role="row">
          <span class="tg-name" class:me={x.id === mine} title={locked.has(x.id) && x.id !== mine ? t("self.ownRow", { name: x.name }) : x.name}>{x.name}{#if locked.has(x.id) && x.id !== mine} 🔒{/if}</span>
          {#each cols as c (c.d)}
            {#if c.gap !== undefined}<span class="tg-gap" aria-hidden="true"></span>
            {:else}
              {@const d = c.d}
              {@const a = shown(x.id, d)}
              <button class="tg-c {a || ''}" class:we={isWeekend(d) || !!anyPub(d)} role="gridcell" disabled={!canTap(x.id)} aria-label="{x.name}, {dayShort(d)}: {a ? t(`tg.${a === 'maybe' ? 'maybeL' : a}`) : t('tg.unset')}"
                oncontextmenu={e => e.preventDefault()} onpointerdown={e => dragStart(e, x.id, d)} onpointerenter={() => dragOver(x.id, d)} onclick={() => click(x.id, d)}>{a ? SIGN[a] : ""}</button>
            {/if}
          {/each}
        </div>
      {/each}
    </div>
    {#if fine}<p class="muted small tg-draghint">{t("tg.dragHint")}</p>{/if}
    {/if}
    {#if others.length}<p class="muted small tg-others">{t("dec.notEntering", { list: others.map(x => x.name).join(", ") })}</p>{/if}
    <p class="small tg-count">{t("tg.entered", { a: entered, n: people.length })}</p>
    {#if best.length}
      <ol class="tg-best">
        {#each best as r (r.from)}
          {@const why = fitWhy(fits(r.from, r.to, plan, ctx), ctx)}
          <li>
            <span><b>{dateDE(r.from)} – {dateDE(r.to)}</b> <span class="muted small">{tn("n.nights", plan.nights)} · {who(r)}{#if why}<br />{why}{/if}</span></span>
            {#if !access.readonly}<button class="btn sm tg-take" onclick={() => takeDates(r)} disabled={trip.from === r.from && trip.to === r.to}>{trip.from === r.from && trip.to === r.to ? `✓ ${t("tg.taken")}` : t("tg.take")}</button>{/if}
          </li>
        {/each}
      </ol>
      {#if best.length > 1 && !access.readonly}<button class="linkbtn tg-poll" onclick={pollDates}>🗳 {t("tg.toPoll")}</button>{/if}
    {:else if entered}
      <p class="muted small">{t("tg.noneYet")}</p>
    {/if}
    {#if !access.readonly}<button class="linkbtn danger small tg-reset" onclick={() => { if (confirm(t("tg.resetQ"))) delete trip.avail; }}>{t("tg.reset")}</button>{/if}
  {/if}

  <h3 class="tg-polls">🗳 {t("poll.title")} <Help k="polls" /></h3>
  {#if polls.length}
    {#if showMe}
      <label class="f tg-me">{t("poll.me")}<select value={me} onchange={e => setMe(e.currentTarget.value)}>{#each people as x (x.id)}<option value={x.id}>{x.name}</option>{/each}</select></label>
    {/if}
    {#each polls as p (p.id)}
      {#if p.mode}
        <PollView {p} onremove={() => removePoll(p.id)} />
      {:else}
      {@const rows = tally(p, trip)}
      {@const miss = missing(trip, p)}
      <article class="poll" class:closed={!!p.closed} data-poll={p.id}>
        <header><b>{p.q}</b>{#if p.closed}<span class="poll-done">✓ {t("poll.closed")}</span>{/if}</header>
        <ul>
          {#each p.options as o (o.id)}
            {@const r = rows.find(x => x.id === o.id)!}
            {@const mine = p.votes[me]?.[o.id]}
            <li class:win={p.result === o.id}>
              <span class="poll-l">{o.label}</span>
              <span class="poll-n small muted">👍 {r.up} · 😐 {r.meh} · 👎 {r.down}</span>
              {#if !p.closed && !access.readonly && me}
                <span class="poll-v">{#each VOTES as b (b.v)}<button class="chip sm" class:on={mine === b.v} aria-pressed={mine === b.v} aria-label={t(b.k)} onclick={() => vote(p, me, o.id, mine === b.v ? undefined : b.v)}>{b.s}</button>{/each}</span>
              {/if}
            </li>
          {/each}
        </ul>
        {#if !p.closed}
          <p class="small muted">{miss.length ? t("poll.missing", { names: miss.map(x => x.name).join(", ") }) : t("poll.allVoted")}</p>
          {#if !access.readonly && rows[0] && (rows[0].up || rows[0].meh)}
            <p class="fu-acts">
              <button class="btn sm primary poll-apply" onclick={() => applyResult(trip, p, rows[0].id)}>{p.kind === "dates" ? t("poll.applyDates", { x: rows[0].label }) : p.kind === "offers" ? t("poll.applyOffer", { x: rows[0].label }) : t("poll.close", { x: rows[0].label })}</button>
            </p>
          {/if}
        {/if}
        {#if !access.readonly}<button class="linkbtn danger small" onclick={() => removePoll(p.id)}>{t("poll.remove")}</button>{/if}
      </article>
      {/if}
    {/each}
  {/if}
  {#if !access.readonly}
    {#if adding}
      <div class="tg-add">
        <label class="f">{t("poll.q")}<input class="poll-q" bind:value={nq} maxlength="200" placeholder={t("poll.qPh")} /></label>
        <label class="f">{t("poll.opts")}<textarea class="poll-opts" rows="3" bind:value={nopts} placeholder={t("poll.optsPh")}></textarea></label>
        <div class="ed-row small">
          <label class="f">{t("poll.mode")}<select class="poll-mode" bind:value={nmode}>{#each ["one", "multi", "miles"] as const as m (m)}<option value={m}>{t(`poll.mode.${m}`)}</option>{/each}</select></label>
          {#if nmode === "miles"}<label class="f">{t("poll.milesEach")}<input class="n sm poll-miles" type="number" min="1" max="40" bind:value={nmiles} /></label>{/if}
          <label class="f">{t("poll.due")}<input class="poll-due" type="date" bind:value={ndue} /></label>
        </div>
        <p class="small muted">{t(`poll.modeHint.${nmode}`)}</p>
        <p class="fu-acts"><button class="btn sm primary poll-add" disabled={!nq.trim() || nopts.split("\n").filter(s => s.trim()).length < 2} onclick={addFreePoll}>{t("poll.start")}</button>
          <button class="btn sm" onclick={() => (adding = false)}>{t("cancel")}</button></p>
      </div>
    {:else}
      <button class="btn sm poll-new" onclick={() => (adding = true)}>+ {t("poll.new")}</button>
    {/if}
  {/if}
</div>
{/if}

<style>
  .tg { display: flex; flex-direction: column; gap: 8px; padding: 16px 18px; border-top: 1px dashed var(--line); }
  .tg h3 { margin: 6px 0 0; font-size: 15px; }
  .tg p { margin: 0; }
  .tg-leg { white-space: nowrap; }
  .tg-todo { padding: 8px 12px; border-radius: 10px; background: var(--warn-soft); color: var(--ink); }
  .tg-todo.done { background: var(--good-soft); }
  .tg-name.me { font-weight: 700; }
  .tg-leg i, .tg-c { font-style: normal; }
  .tg-grid { overflow-x: auto; display: grid; gap: 2px; padding-bottom: 4px; }
  .tg-row { display: flex; gap: 2px; align-items: center; }
  .tg-name { position: sticky; inset-inline-start: 0; z-index: 1; flex: none; width: 76px; background: var(--paper); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tg-d { flex: none; width: 26px; text-align: center; font-size: 10.5px; color: var(--ink-3); }
  .tg-d.we { color: var(--ink); font-weight: 700; background: color-mix(in srgb, var(--ink) 7%, transparent); border-radius: 4px; }
  .tg-d.hol { color: var(--warn); font-weight: 800; }
  .tg-gap { flex: none; width: 8px; align-self: stretch; margin-inline: 2px; border-radius: 2px; background: repeating-linear-gradient(135deg, var(--line) 0 3px, transparent 3px 6px); }
  .tg-d small { font-size: 9px; }
  .tg-c.we:not(.yes):not(.maybe):not(.no) { background: color-mix(in srgb, var(--ink) 8%, var(--paper-2)); }
  .tg-fer .tg-name { font-size: 10.5px; color: var(--ink-3); }
  .tg-f { flex: none; width: 26px; height: 6px; border-radius: 2px; }
  .tg-f.on { background: #5A7FB8; }
  /* Handy: unpassende Tage ganz weg (kompakt), sonst schmal */
  @media (max-width: 640px) { .tg-c { width: 30px; height: 30px; } .tg-d, .tg-f { width: 30px; } }
  .tg-view { align-self: flex-start; display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .tg-view button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; min-height: 36px; background: var(--paper); color: var(--ink-2); border: 0; cursor: pointer; }
  .tg-view button.on { background: var(--a); color: #fff; }
  .tg-for { max-width: 260px; }
  .tg-blocks { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .tg-block { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; }
  .tg-bh { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .tg-bwhy { color: var(--warn); }
  .tg-bbtn { display: flex; gap: 6px; }
  .tg-bv { all: unset; box-sizing: border-box; flex: 1; min-height: 44px; display: grid; place-items: center; border-radius: 10px; border: 1px solid var(--line); background: var(--paper-2); font-size: 13px; font-weight: 600; cursor: pointer; }
  .tg-bv:disabled { opacity: .5; cursor: default; }
  .tg-bv.yes.on { background: color-mix(in srgb, var(--good) 22%, var(--paper)); color: var(--good); border-color: var(--good); }
  .tg-bv.maybe.on { background: color-mix(in srgb, var(--warn) 18%, var(--paper)); color: var(--warn); border-color: var(--warn); }
  .tg-bv.no.on { background: color-mix(in srgb, #C4452E 16%, var(--paper)); color: #C4452E; border-color: #C4452E; }
  .tg-bar { display: flex; height: 6px; border-radius: 99px; overflow: hidden; background: var(--line); }
  .tg-bar .y { background: var(--good); }
  .tg-bar .m { background: var(--warn); }
  .tg-cfg { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .tg-cfg-edit { padding: 0; }
  .tg-c { all: unset; box-sizing: border-box; flex: none; width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line); background: var(--paper-2); display: grid; place-items: center; font-size: 13px; cursor: pointer; }
  .tg-c:focus-visible { outline: 2px solid var(--a); }
  .tg-c.yes, .tg-leg .yes { background: color-mix(in srgb, var(--good) 22%, var(--paper)); color: var(--good); border-color: var(--good); }
  .tg-c.maybe, .tg-leg .maybe { background: color-mix(in srgb, var(--warn) 18%, var(--paper)); color: var(--warn); border-color: var(--warn); }
  .tg-c.no, .tg-leg .no { background: color-mix(in srgb, #C4452E 16%, var(--paper)); color: #C4452E; border-color: #C4452E; }
  .tg-leg i { display: inline-grid; place-items: center; width: 18px; height: 18px; border-radius: 4px; border: 1px solid; margin-inline: 6px 2px; }
  .tg-best { margin: 0; padding-inline-start: 18px; display: grid; gap: 6px; }
  .tg-best li { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .tg-reset, .tg-poll { align-self: flex-start; padding: 0; }
  .tg-me { max-width: 240px; }
  .poll { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .poll.closed { opacity: .8; }
  .poll header { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .poll-done { font-size: 12px; color: var(--good); font-weight: 700; }
  .poll ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .poll li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; }
  .poll li.win .poll-l { font-weight: 700; color: var(--good); }
  .poll-v { grid-column: 1 / -1; display: flex; gap: 6px; }
  .tg-add { display: flex; flex-direction: column; gap: 8px; }
  .poll-new { align-self: flex-start; }
</style>
