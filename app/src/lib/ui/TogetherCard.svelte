<script lang="ts">
  /*
   * Gemeinsam planen (#173) im Kapitel der Reisenden: Termin finden (wer wann kann, beste Zeiträume) und Abstimmungen
   * über Termine, Angebote oder frei. Eintragen und abstimmen für jede Person (wie die übrigen Reisedaten); wer man
   * selbst ist, merkt sich das Gerät je Reise.
   */
  import { t, tn } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { dateDE, dayShort } from "../format";
  import Help from "./Help.svelte";
  import PollView from "./PollView.svelte";
  import { getLocalMe, setLocalMe, sharedVoting } from "../polls.svelte";
  import { addDay, addPoll, applyResult, bestPeriods, cycle, missing, newPoll, planDays, setAvail, tally, vote, voters, type Avail, type Period, type PollMode, type Vote } from "../together";

  const trip = $derived(app.trip);
  const people = $derived(voters(trip));
  const plan = $derived(trip.avail);
  const days = $derived(plan ? planDays(plan) : []);
  const best = $derived(plan ? bestPeriods(trip) : []);
  const entered = $derived(people.filter(x => plan?.by[x.id] && Object.keys(plan.by[x.id]).length).length);
  const nameOf = (id: string) => trip.travelers.find(x => x.id === id)?.name || "?";

  // neuer Planungszeitraum: ab heute in drei Wochen, acht Wochen lang, Nächte wie die Reise (sonst 7)
  let fFrom = $state(""), fTo = $state(""), fNights = $state(7);
  function startPlan() {
    const today = new Date().toISOString().slice(0, 10);
    const from = fFrom || (trip.from && trip.from > today ? addDay(trip.from, -14) : addDay(today, 21));
    const to = fTo && fTo > from ? fTo : addDay(from, 56);
    const n = trip.from && trip.to ? Math.max(1, Math.round((Date.parse(trip.to) - Date.parse(trip.from)) / 86400000)) : 7;
    trip.avail = { from, to, nights: fNights > 0 ? fNights : n, by: {} };
  }
  const SIGN: Record<Avail, string> = { yes: "✓", maybe: "~", no: "✕" };
  const tap = (id: string, d: string) => { if (!access.readonly) setAvail(trip, id, d, cycle(plan?.by[id]?.[d])); };

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

{#if people.length > 1}
<div class="tg">
  <h3>📅 {t("tg.title")} <Help k="avail" /></h3>
  {#if !plan}
    {#if !access.readonly}
      <div class="ed-row tg-new">
        <label class="f">{t("tg.from")}<input type="date" bind:value={fFrom} /></label>
        <label class="f">{t("tg.to")}<input type="date" bind:value={fTo} min={fFrom} /></label>
        <label class="f">{t("tg.nights")}<input class="n sm" type="number" min="1" max="60" bind:value={fNights} /></label>
        <button class="btn sm primary tg-start" onclick={startPlan}>{t("tg.start")}</button>
      </div>
    {/if}
  {:else}
    <div class="ed-row tg-head">
      <label class="f">{t("tg.from")}<input type="date" bind:value={plan.from} disabled={access.readonly} /></label>
      <label class="f">{t("tg.to")}<input type="date" bind:value={plan.to} min={plan.from} disabled={access.readonly} /></label>
      <label class="f">{t("tg.nights")}<input class="n sm" type="number" min="1" max="60" bind:value={plan.nights} disabled={access.readonly} /></label>
    </div>
    <p class="muted small">{t("tg.howTo")} <span class="tg-leg"><i class="yes">✓</i> {t("tg.yes")} <i class="maybe">~</i> {t("tg.maybeL")} <i class="no">✕</i> {t("tg.no")}</span></p>
    <div class="tg-grid" role="grid" aria-label={t("tg.title")}>
      <div class="tg-row tg-days" role="row">
        <span class="tg-name"></span>
        {#each days as d (d)}<span class="tg-d" role="columnheader" class:we={[0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())} title={dayShort(d)}>{d.slice(8, 10)}{d.slice(8, 10) === "01" || d === days[0] ? `.${d.slice(5, 7)}` : ""}</span>{/each}
      </div>
      {#each people as x (x.id)}
        <div class="tg-row" role="row">
          <span class="tg-name" title={x.name}>{x.name}</span>
          {#each days as d (d)}
            {@const a = plan.by[x.id]?.[d]}
            <button class="tg-c {a || ''}" role="gridcell" disabled={access.readonly} aria-label="{x.name}, {dayShort(d)}: {a ? t(`tg.${a === 'maybe' ? 'maybeL' : a}`) : t('tg.unset')}" onclick={() => tap(x.id, d)}>{a ? SIGN[a] : ""}</button>
          {/each}
        </div>
      {/each}
    </div>
    <p class="small tg-count">{t("tg.entered", { a: entered, n: people.length })}</p>
    {#if best.length}
      <ol class="tg-best">
        {#each best as r (r.from)}
          <li>
            <span><b>{dateDE(r.from)} – {dateDE(r.to)}</b> <span class="muted small">{tn("n.nights", plan.nights)} · {who(r)}</span></span>
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
  .tg-leg i, .tg-c { font-style: normal; }
  .tg-grid { overflow-x: auto; display: grid; gap: 2px; padding-bottom: 4px; }
  .tg-row { display: flex; gap: 2px; align-items: center; }
  .tg-name { position: sticky; inset-inline-start: 0; z-index: 1; flex: none; width: 76px; background: var(--paper); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tg-d { flex: none; width: 26px; text-align: center; font-size: 10.5px; color: var(--ink-3); }
  .tg-d.we { color: var(--ink-2); font-weight: 700; }
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
