<script lang="ts">
  /*
   * Eine Abstimmung in den neuen Arten (#432): eine Stimme, mehrere Stimmen oder Meilen-Wahl, je Möglichkeit
   * „✕ Ohne mich“, Frist. Planerin stellt Art, Meilen und Frist ein und übernimmt das Ergebnis.
   */
  import { t, tn, type Key } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { cloudTrip } from "../cloud/cloud.svelte";
  import { dateDE } from "../format";
  import { applyResult, dueSoon, maxMiles, mergedVotes, milesLeft, milesOf, missing, pollOpen, tallyMode, VETO, type Poll, type PollMode } from "../together";
  import { ackNotes, cast, myNotes, myVote, myVoter, remoteVotes, sharedVoting, vetoesNow, whoAsk, whyOf } from "../polls.svelte";
  import { applyOption, without } from "../without";
  import { eur } from "../calc";
  import { geo } from "../geo/geo.svelte";
  import VetoDialog from "./VetoDialog.svelte";

  let { p, onremove }: { p: Poll; onremove: () => void } = $props();
  const trip = $derived(app.trip);
  const remote = $derived(remoteVotes(p));
  const votes = $derived(mergedVotes(p, remote));
  const rows = $derived(tallyMode(p, votes));
  const open = $derived(pollOpen(p));
  const soon = $derived(dueSoon(p));
  const me = $derived(myVoter());
  const mine = $derived(myVote(p) || {});
  const miss = $derived(missing(trip, p, remote));
  const left = $derived(p.mode === "miles" ? milesLeft(p, mine) : 0);
  const ct = $derived(cloudTrip(trip.id));
  const nameOf = (k: string) => k.startsWith("u:") ? ct?.memberNames[k.slice(2)] || "?" : trip.travelers.find(x => x.id === k)?.name || "?";
  const MODES: PollMode[] = ["one", "multi", "miles"];
  let busy = $state(false);
  async function act(o: string, a: "for" | "veto" | "more" | "less") {
    if (busy) return;
    busy = true;
    try { await cast(p, o, a); } finally { busy = false; }
  }
  const canVote = $derived(open && !!me && (sharedVoting() || !access.readonly));

  /* ---------- „✕ Ohne mich“ (#439) ---------- */
  let vetoFor = $state<string | null>(null);
  const why = $derived(whyOf(p));
  const out = $derived(vetoesNow(p));
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${eur(Math.abs(v))}`;
  /** Folgen je Möglichkeit, wenn alle mit „Ohne mich“ (ggf. mit Familie) wegfallen */
  const effects = $derived(Object.fromEntries(p.options.filter(o => out[o.id]?.length).map(o => [o.id, without(trip, out[o.id], tr => applyOption(tr, p, o.id), geo)])));
  const vetoName = (k: string, o: string) => `${nameOf(k)}${why[k]?.[o]?.f ? ` (${t("veto.withFamily")})` : ""}${why[k]?.[o]?.r ? `: „${why[k][o].r}“` : ""}`;
  function veto(o: string, v: number) {
    // zurücknehmen ohne Rückfrage, sonst erst das Fenster
    if (v === VETO) void act(o, "veto"); else vetoFor = o;
  }
  const notes = $derived(open ? myNotes(p) : []);
  /** Ergebnis übernehmen: wer bei der Möglichkeit nicht dabei wäre, wird nach Rückfrage auf „nicht dabei“ gestellt */
  function take(id: string, label: string) {
    const ids = out[id] || [];
    if (ids.length) {
      if (!confirm(t("veto.applyQ", { x: label, names: ids.map(x => trip.travelers.find(y => y.id === x)?.name || "?").join(", ") }))) return;
      for (const x of trip.travelers) if (ids.includes(x.id)) x.active = false;
    }
    applyResult(trip, p, id);
  }
</script>

<article class="poll pv" class:closed={!open} data-poll={p.id}>
  <header>
    <b>{p.q}</b>
    <span class="pv-mode">{t(`poll.mode.${p.mode}` as Key)}{p.mode === "miles" ? ` · ${tn("poll.miles", milesOf(p))}` : ""}{p.due ? ` · ${t("poll.until", { d: dateDE(p.due) })}` : ""}</span>
    {#if p.closed}<span class="poll-done">✓ {t("poll.closed")}</span>{:else if !open}<span class="poll-done">{t("poll.over")}</span>{/if}
  </header>

  {#if !access.readonly && !p.closed}
    <div class="pv-set ed-row small">
      <label class="f">{t("poll.mode")}<select value={p.mode} onchange={e => (p.mode = e.currentTarget.value as PollMode)}>{#each MODES as m (m)}<option value={m}>{t(`poll.mode.${m}` as Key)}</option>{/each}</select></label>
      {#if p.mode === "miles"}<label class="f">{t("poll.milesEach")}<input class="n sm pv-miles" type="number" min="1" max={maxMiles(p)} value={milesOf(p)} onchange={e => (p.miles = Math.max(1, Math.min(maxMiles(p), +e.currentTarget.value || 1)))} /></label>{/if}
      <label class="f">{t("poll.due")}<input class="pv-due" type="date" value={p.due || ""} onchange={e => { if (e.currentTarget.value) p.due = e.currentTarget.value; else delete p.due; }} /></label>
    </div>
  {/if}

  {#if open && sharedVoting() && !me}
    <p class="small pv-who">{t("poll.whoFirst")} <button class="linkbtn" onclick={() => (whoAsk.open = true)}>{t("who.title")}</button></p>
  {/if}

  {#if notes.length}
    <div class="pv-notes" role="status">
      {#each notes as n (n.option)}
        <p>ℹ️ {n.gone.length ? tn("veto.noteGone", n.gone.length, { names: n.gone.join(", "), x: n.label }) : ""}{n.back.length ? `${n.gone.length ? " " : ""}${tn("veto.noteBack", n.back.length, { names: n.back.join(", "), x: n.label })}` : ""}
          {Math.round(n.after) !== Math.round(n.before) ? t("veto.notePrice", { after: eur(n.after), before: eur(n.before), diff: signed(n.after - n.before) }) : ""}</p>
      {/each}
      <button class="linkbtn small pv-seen" onclick={() => ackNotes(p)}>✓ {t("veto.seen")}</button>
    </div>
  {/if}

  <ul>
    {#each p.options as o (o.id)}
      {@const r = rows.find(x => x.id === o.id)!}
      {@const v = mine[o.id] || 0}
      <li class:win={p.result === o.id} class:veto={v === VETO}>
        <span class="poll-l">{o.label}</span>
        <span class="poll-n small muted">{p.mode === "miles" ? tn("poll.milesN", Math.round(r.score * 10) / 10) : tn("poll.forN", r.score)}{r.people && p.mode === "miles" ? ` · ${tn("n.persons", r.people)}` : ""}{#if r.veto.length} · <span class="pv-x">✕ {r.veto.map(k => vetoName(k, o.id)).join(", ")}</span>{/if}</span>
        {#if effects[o.id]}
          {@const e = effects[o.id]}
          <span class="pv-eff small">{Math.round(e.after.perPerson) === Math.round(e.before.perPerson)
            ? t("veto.lineSame", { n: tn("n.persons", e.ids.length), after: eur(e.after.total), before: eur(e.before.total) })
            : t("veto.line", { n: tn("n.persons", e.ids.length), after: eur(e.after.perPerson), before: eur(e.before.perPerson), diff: signed(e.after.perPerson - e.before.perPerson) })}{e.stays.length ? ` · ⚠ ${t("veto.staysShort", { names: e.stays.map(s => s.name).join(", ") })}` : ""}</span>
        {/if}
        {#if canVote}
          <span class="poll-v">
            {#if p.mode === "miles"}
              <button class="chip sm pv-less" aria-label={t("poll.less")} disabled={busy || v <= 0} onclick={() => act(o.id, "less")}>−</button>
              <b class="num pv-n">{v > 0 ? v : 0}</b>
              <button class="chip sm pv-more" aria-label={t("poll.more")} disabled={busy || left <= 0 || v === VETO} onclick={() => act(o.id, "more")}>+</button>
            {:else}
              <button class="chip sm pv-for" class:on={v > 0} aria-pressed={v > 0} disabled={busy} onclick={() => act(o.id, "for")}>{v > 0 ? "✓ " : ""}{t("poll.for")}</button>
            {/if}
            <button class="chip sm pv-veto" class:on={v === VETO} disabled={busy} title={v === VETO ? "" : t("poll.vetoHint")} onclick={() => veto(o.id, v)}>{v === VETO ? `↩ ${t("veto.back")}` : `✕ ${t("poll.veto")}`}</button>
          </span>
        {/if}
      </li>
    {/each}
  </ul>

  {#if canVote && p.mode === "miles"}<p class="small pv-left">{t("poll.milesLeft", { n: left, of: milesOf(p) })}</p>{/if}
  {#if open}
    {#if soon}<p class="small pv-soon">⏰ {t("poll.dueSoon", { d: dateDE(p.due!) })}</p>{/if}
    <p class="small muted">{miss.length ? t("poll.missing", { names: miss.map(x => x.name).join(", ") }) : t("poll.allVoted")}</p>
  {/if}
  {#if !p.closed && !access.readonly && rows[0] && rows[0].score > 0}
    <p class="fu-acts">
      <button class="btn sm primary poll-apply" onclick={() => take(rows[0].id, rows[0].label)}>{p.kind === "dates" ? t("poll.applyDates", { x: rows[0].label }) : p.kind === "offers" ? t("poll.applyOffer", { x: rows[0].label }) : t("poll.close", { x: rows[0].label })}</button>
    </p>
  {/if}
  {#if !access.readonly}<button class="linkbtn danger small" onclick={onremove}>{t("poll.remove")}</button>{/if}
</article>
{#if vetoFor}<VetoDialog {p} option={vetoFor} onclose={() => (vetoFor = null)} />{/if}

<style>
  .poll { border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .poll.closed { opacity: .8; }
  .poll p { margin: 0; }
  .poll-done { font-size: 12px; color: var(--good); font-weight: 700; }
  .poll ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .poll li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; }
  .poll li.win .poll-l { font-weight: 700; color: var(--good); }
  .poll .poll-v { grid-column: 1 / -1; }
  .pv > .linkbtn { align-self: flex-start; padding: 0; }
  .pv header { display: flex; gap: 6px 10px; align-items: baseline; flex-wrap: wrap; }
  .pv-mode { font-size: 12px; color: var(--idea); font-weight: 700; }
  .pv-set { gap: 8px; flex-wrap: wrap; }
  .pv-set select, .pv-set input { font-size: 13px; }
  .poll-v { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .pv-n { min-width: 18px; text-align: center; }
  .pv-veto.on { background: color-mix(in srgb, #C4452E 16%, var(--paper)); color: #C4452E; border-color: #C4452E; }
  .pv-x { color: #C4452E; font-weight: 600; }
  li.veto .poll-l { text-decoration: line-through; text-decoration-color: #C4452E; }
  .pv-soon { color: var(--warn); font-weight: 700; }
  .pv-eff { grid-column: 1 / -1; color: var(--ink-2); }
  .pv-notes { display: grid; gap: 4px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--warn) 12%, var(--paper)); font-size: 13.5px; }
  .pv-seen { justify-self: start; padding: 0; }
  .pv-who { color: var(--ink-2); }
</style>
