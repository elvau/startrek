<script lang="ts">
  /*
   * Kasse unterwegs: tatsächliche Ausgaben eintragen (wer hat ausgelegt, für wen), Zahlungen zu Posten (im Posten unter
   * „Bezahlt“), Salden je Kasse (Familie mit gemeinsamer Kasse oder einzelne Erwachsene) und wer wem wie viel überweist. Ein Tipp auf „Erledigt“ trägt die Überweisung ein.
   */
  import { t, tn } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  import { access, app, calc } from "../store.svelte";
  import { eur, parseNum } from "../calc";
  import { CAT_CHAPTERS } from "../chapters";
  import { hhKey, isActive, uid, type CatKey, type Expense } from "../model";
  import { CURRENCIES, entryCurrency } from "../currency.svelte";
  import { geo } from "../geo/geo.svelte";
  import { ccOf } from "../geo/places";
  import { kassen, kasseName, jointKasse, ledger, type LedgerEntry } from "../ledger";
  import { ageClass } from "../calc";
  import { cloud, cloudTrip } from "../cloud/cloud.svelte";
  import { dateDE } from "../format";
  import { showItem } from "./showItem";
  import { reveal } from "./reveal";
  import { cluster, groupLabel } from "../groups";

  // geteilte Reise: Eingereichtes von anderen braucht ✅, bei ❌ entscheidet der Admin (Besitzer)
  const ct = $derived(cloudTrip(app.trip.id));
  const shared = $derived(!!ct && Object.keys(ct.members).length > 1);
  const me = $derived(cloud.user);
  const admin = $derived(access.role === "owner");
  const L = $derived(ledger(app.trip, calc.T, ct?.owner));
  let objecting = $state<string | null>(null);
  let why = $state("");
  const exp = (id: string) => app.trip.expenses?.find(x => x.id === id);
  const mine = (e: LedgerEntry) => !!me && e.exp?.uid === me.uid;
  const canDelete = (e: LedgerEntry) => !e.exp?.uid || !shared || admin || mine(e);
  const canVote = (e: LedgerEntry) => shared && !!me && !access.readonly && !!e.exp?.uid && !mine(e) && (e.state === "open" || e.state === "disputed");
  function vote(id: string, ok: boolean) {
    const x = exp(id);
    if (!x || !me) return;
    const okMap = { ...(x.ok || {}) }, noMap = { ...(x.no || {}) };
    delete okMap[me.uid]; delete noMap[me.uid];
    if (ok) okMap[me.uid] = me.name || "?";
    else noMap[me.uid] = { name: me.name || "?", ...(why.trim() ? { why: why.trim() } : {}) };
    if (Object.keys(okMap).length) x.ok = okMap; else delete x.ok;
    if (Object.keys(noMap).length) x.no = noMap; else delete x.no;
    objecting = null; why = "";
  }
  function decide(id: string, state: "approved" | "rejected" | undefined) {
    const x = exp(id);
    if (!x) return;
    if (state) x.state = state; else delete x.state;
  }
  /** Kontoname wie bei den Mitgliedern: erster Buchstabe groß („oma“ → „Oma“) */
  const cap = (n: string) => n.charAt(0).toUpperCase() + n.slice(1);
  const noText = (e: LedgerEntry) => Object.values(e.exp?.no || {}).map(n => (n.why ? `${cap(n.name)}: „${n.why}“` : cap(n.name))).join(" · ");
  const hhs = $derived([...new Set(app.trip.travelers.filter(isActive).map(hhKey))]);
  // Kassen: wer zahlt und am Ende ausgleicht (Mannschaft: jeder selbst, Familie: gemeinsam)
  const ks = $derived(kassen(app.trip));
  const kids = $derived(ks.map(k => k.id));
  const nm = (id: string) => kasseName(app.trip, id);
  // Familien mit mehr als einem Erwachsenen: gemeinsame oder getrennte Kassen; Kinder bei getrennten Kassen
  const adultsOf = (h: string) => app.trip.travelers.filter(x => isActive(x) && hhKey(x) === h && ageClass(x.age, app.trip.settings, x.kind) === "adult");
  const kidsOf = (h: string) => app.trip.travelers.filter(x => isActive(x) && hhKey(x) === h && ageClass(x.age, app.trip.settings, x.kind) !== "adult");
  const multi = $derived(hhs.filter(h => adultsOf(h).length > 1));
  function setMode(h: string, joint: boolean) {
    app.trip.households ||= {};
    const H = (app.trip.households[h] ||= {});
    H.kasse = joint ? "joint" : "each";
  }
  function setPayer(id: string, payer: string) {
    const x = app.trip.travelers.find(y => y.id === id);
    if (!x) return;
    if (payer) x.payer = payer; else delete x.payer;
  }
  const today = () => new Date().toISOString().slice(0, 10);
  // Währung am Ziel (Kuna, Złoty …) zur Auswahl, dazu die eigene
  const destCur = $derived(geo.world.find(w => w.k === ccOf(geo, app.trip.country))?.cur);
  const curs = $derived([...new Set([entryCurrency(), "EUR", ...(destCur ? [destCur] : []), ...CURRENCIES])]);

  // zuletzt gewählte Familie merken (auf diesem Gerät)
  const KEY = "rk2-kasse-by";
  const lastBy = () => { try { const v = localStorage.getItem(KEY); return v && kids.includes(v) ? v : kids[0]; } catch { return kids[0]; } };

  let adding = $state(false);
  let text = $state("");
  let amount = $state("");
  let cur = $state("EUR");
  let by = $state("");
  let forHh = $state<string[]>([]);
  let cat = $state<CatKey>("misc");
  let date = $state("");
  function start() {
    adding = true; text = ""; amount = ""; by = lastBy() || ""; forHh = []; cat = "misc";
    cur = destCur && destCur !== "EUR" && inTrip(today()) ? destCur : entryCurrency();
    date = inTrip(today()) ? today() : app.trip.from || today();
  }
  const inTrip = (d: string) => !!app.trip.from && !!app.trip.to && app.trip.from <= d && d <= app.trip.to;
  const amt = $derived(parseNum(amount));
  function save(e: Event) {
    e.preventDefault();
    if (!text.trim() || !(amt > 0) || !by) return;
    const x: Expense = { id: uid(), text: text.trim(), amount: Math.round(amt * 100) / 100, by, cat, ...(shared && me ? { uid: me.uid, who: me.name || "?" } : {}), ...(cur !== "EUR" ? { currency: cur } : {}), ...(date ? { date } : {}), ...(forHh.length && forHh.length < kids.length ? { for: [...forHh] } : {}) };
    app.trip.expenses = [...(app.trip.expenses || []), x];
    try { localStorage.setItem(KEY, by); } catch { /* egal */ }
    adding = false;
  }
  function toggleFor(h: string) {
    const curSel = forHh.length ? forHh : kids;
    const next = curSel.includes(h) ? curSel.filter(x => x !== h) : [...curSel, h];
    forHh = next.length === kids.length ? [] : next;
  }
  function removeExp(id: string) {
    app.trip.expenses = (app.trip.expenses || []).filter(x => x.id !== id);
    if (!app.trip.expenses.length) delete app.trip.expenses;
  }
  function removePay(itemId: string, i: number) {
    const it = app.trip.items.find(x => x.id === itemId);
    if (!it?.payments) return;
    it.payments = it.payments.filter((_, k) => k !== i);
    if (!it.payments.length) delete it.payments;
  }
  function removeTransfer(id: string) {
    app.trip.transfers = (app.trip.transfers || []).filter(x => x.id !== id);
    if (!app.trip.transfers.length) delete app.trip.transfers;
  }
  const catIcon = (k?: CatKey) => ({ flights: "✈️", stay: "🛏", transport: "🚗", attractions: "🎟", misc: "🧾" })[k || "misc"];
  const empty = $derived(!L.entries.length && !(app.trip.transfers || []).length);
  let showAll = $state(false);
  const SHOW = 6;
  // gleiche Überweisungen an dieselbe Familie und gleiche Salden: eine Zeile (Gruppenreise)
  const moveGroups = $derived(cluster(L.moves, (a, b) => a.to === b.to && Math.abs(a.v - b.v) < 0.5));
  const rowGroups = $derived(cluster(L.rows, (a, b) => Math.round(a.paid) === Math.round(b.paid) && Math.round(a.owed) === Math.round(b.owed)));
  function doneAll(g: { from: string; to: string; v: number }[]) {
    app.trip.transfers = [...(app.trip.transfers || []), ...g.map(m => ({ id: uid(), from: m.from, to: m.to, amount: m.v, at: today() }))];
  }
</script>

<article class="card kasse" use:reveal>
  <div class="ks-head">
    <div>
      <h3>🧾 {t("ks.title")} <Help k="ks" /></h3>
      <p class="muted small">{empty ? t("ks.hint") : t("ks.spent", { v: eur(L.spent), plan: eur(calc.T.total) })}</p>
    </div>
    {#if !access.readonly && !adding}<button class="btn sm ks-add" onclick={start}>+ {t("ks.add")}</button>{/if}
  </div>

  {#if multi.length && !access.readonly}
    <!-- wer zahlt: Familie gemeinsam oder jeder Erwachsene selbst; Kinder über die Eltern -->
    <details class="ks-modes">
      <summary class="muted small">{t("ks.modes", { list: ks.length > 6 ? tn("ks.kassen", ks.length) : ks.map(k => k.name).join(", ") })}</summary>
      {#each multi as h (h)}
        {@const joint = jointKasse(app.trip, h)}
        <div class="ks-mode">
          <b>{h}</b>
          <div class="chips" role="radiogroup" aria-label={t("ks.modeOf", { name: h })}>
            <button type="button" role="radio" aria-checked={joint} class="chip sm" class:on={joint} onclick={() => setMode(h, true)}>{t("ks.joint")}</button>
            <button type="button" role="radio" aria-checked={!joint} class="chip sm" class:on={!joint} onclick={() => setMode(h, false)}>{t("ks.each2")}</button>
          </div>
          {#if !joint}
            {#each kidsOf(h) as c (c.id)}
              <label class="ks-kid">{c.name || "?"}: {t("ks.paidByParents")}
                <select value={c.payer || ""} onchange={e => setPayer(c.id, e.currentTarget.value)}>
                  <option value="">{t("ks.allParents")}</option>
                  {#each adultsOf(h) as a (a.id)}<option value={a.id}>{a.name}</option>{/each}
                </select>
              </label>
            {/each}
          {/if}
        </div>
      {/each}
    </details>
  {/if}
  {#if L.pending.n}
    <p class="ks-pend" class:ks-alert={admin && L.pending.disputed}>{admin && L.pending.disputed ? `⚠ ${tn("ks.decide", L.pending.disputed)}` : `⏳ ${tn("ks.pending", L.pending.n, { v: eur(L.pending.v) })}`}</p>
  {/if}
  {#if adding}
    <form class="ks-form" onsubmit={save}>
      <div class="ed-row">
        <label class="f grow">{t("ks.what")}<input class="ks-text" bind:value={text} placeholder={t("ks.whatPh")} /></label>
        <label class="f">{t("ks.amount")}<span class="ks-amt"><input class="ks-amount" inputmode="decimal" bind:value={amount} placeholder="0" />
          <select bind:value={cur} aria-label={t("ks.currency")}>{#each curs as c (c)}<option value={c}>{c}</option>{/each}</select></span></label>
      </div>
      <div class="ed-row">
        <label class="f">{t("ks.paidBy")}<select class="ks-by" bind:value={by}>{#each ks as k (k.id)}<option value={k.id}>{k.name}{k.person && multi.includes(k.hh) && hhs.length > 1 ? ` (${k.hh})` : ""}</option>{/each}</select></label>
        <label class="f">{t("ks.date")}<input type="date" bind:value={date} /></label>
        <label class="f">{t("ks.cat")}<select bind:value={cat}>{#each CAT_CHAPTERS as c (c.k)}<option value={c.k}>{c.label}</option>{/each}</select></label>
      </div>
      {#if ks.length > 1}
        <div class="f"><span class="dlabel">{t("ks.for")}</span>
          <div class="chips">
            <button type="button" class="chip sm" class:on={!forHh.length} onclick={() => (forHh = [])}>{t("fund.forAll")}</button>
            {#each ks as k (k.id)}<button type="button" class="chip sm" class:on={!!forHh.length && forHh.includes(k.id)} aria-pressed={!forHh.length || forHh.includes(k.id)} onclick={() => toggleFor(k.id)}>{k.name}</button>{/each}
          </div>
        </div>
      {/if}
      <div class="fu-acts">
        <button class="btn sm primary" disabled={!text.trim() || !(amt > 0) || !by}>{t("ks.save")}</button>
        <button type="button" class="btn sm" onclick={() => (adding = false)}>{t("cancel")}</button>
      </div>
    </form>
  {/if}

  {#if !empty}
    {#if L.moves.length}
      <div class="ks-moves">
        <span class="dlabel">{t("ks.settle")}</span>
        <ul>
          {#each moveGroups as g (g[0].from + g[0].to)}
            <li><span><b>{groupLabel(g.map(m => nm(m.from)), -1)}</b> → <b>{nm(g[0].to)}</b>{#if g.length > 1}<small class="muted">&nbsp;· {t("ks.each")}</small>{/if}</span><b class="num">{eur(g[0].v)}</b>
              {#if !access.readonly}<button class="btn sm ks-done" onclick={() => doneAll(g)}>{t("ks.done")}</button>{/if}</li>
          {/each}
        </ul>
      </div>
    {:else}
      <p class="ks-even">✓ {t("ks.even")}</p>
    {/if}

    <details class="ks-bal">
      <summary>{t("ks.balances")}</summary>
      <table>
        <thead><tr><th>{t("split.who.col")}</th><th class="num">{t("ks.paid")}</th><th class="num">{t("ks.share")}</th><th class="num">{t("ks.balance")}</th></tr></thead>
        <tbody>
          {#each rowGroups as g (g[0].hh)}
            {@const r = g[0]}
            <tr><td>{groupLabel(g.map(x => nm(x.hh)), L.rows.length)}{#if g.length > 1}<small class="muted">&nbsp;· {t("ks.each")}</small>{/if}</td><td class="num">{eur(r.paid)}</td><td class="num">{eur(r.owed)}</td><td class="num" class:pos={r.bal > 0.5} class:neg={r.bal < -0.5}>{r.bal > 0.5 ? "+" : ""}{eur(r.bal)}</td></tr>
          {/each}
        </tbody>
      </table>
    </details>

    <ul class="ks-list">
      {#each showAll ? L.entries : L.entries.slice(0, SHOW) as e (e.key)}
        <li class:ks-wait={e.state === "open" || e.state === "disputed"} class:ks-rej={e.state === "rejected"}>
          <span class="ks-ic" aria-hidden="true">{catIcon(e.cat)}</span>
          <span class="ks-n">
            {#if e.itemId}<button class="linkbtn" onclick={() => showItem(e.itemId!)}>{e.label}</button>{:else}{e.label}{/if}
            <small class="muted">{[t("ks.byWho", { name: nm(e.by) }), e.for ? t("ks.forWho", { list: e.for.map(nm).join(", ") }) : "", e.date ? dateDE(e.date) : "", e.exp?.who && shared ? t("ks.sentBy", { name: cap(e.exp.who) }) : ""].filter(Boolean).join(" · ")}</small>
            {#if e.state === "open"}<small class="ks-st">⏳ {t("ks.waiting")}</small>
            {:else if e.state === "disputed"}<small class="ks-st ks-no">❌ {t("ks.disputed", { list: noText(e) })}</small>
            {:else if e.state === "rejected"}<small class="ks-st ks-no">{t("ks.rejected")}</small>
            {:else if e.exp?.uid && shared && Object.keys(e.exp.ok || {}).length}<small class="ks-st ks-ok">✅ {Object.values(e.exp.ok || {}).map(cap).join(", ")}</small>{/if}
            {#if canVote(e)}
              <span class="ks-vote">
                <button class="btn sm ks-yes" class:on={!!me && !!e.exp?.ok?.[me.uid]} onclick={() => vote(e.expId!, true)} aria-label={t("ks.confirm")}>✅ {t("ks.confirm")}</button>
                <button class="btn sm ks-noBtn" class:on={!!me && !!e.exp?.no?.[me.uid]} onclick={() => { objecting = objecting === e.expId ? null : e.expId!; why = ""; }} aria-label={t("ks.object")}>❌ {t("ks.object")}</button>
              </span>
              {#if objecting === e.expId}
                <span class="ks-why"><input bind:value={why} placeholder={t("ks.whyPh")} aria-label={t("ks.why")} />
                  <button class="btn sm primary ks-send" onclick={() => vote(e.expId!, false)}>{t("ks.send")}</button></span>
              {/if}
            {/if}
            {#if admin && shared && e.exp?.uid && !mine(e) && e.state !== "ok" && !access.readonly}
              <span class="ks-vote ks-admin">
                {#if e.state === "rejected"}<button class="btn sm ks-restore" onclick={() => decide(e.expId!, undefined)}>{t("ks.restore")}</button>
                {:else}<button class="btn sm ks-approve" onclick={() => decide(e.expId!, "approved")}>{t("ks.approve")}</button>
                  <button class="btn sm ks-reject" onclick={() => decide(e.expId!, "rejected")}>{t("ks.reject")}</button>{/if}
              </span>
            {/if}
          </span>
          <b class="num">{eur(e.v)}</b>
          {#if !access.readonly && canDelete(e)}<button class="dp-del" aria-label={t("ks.remove", { text: e.label })} onclick={() => (e.expId ? removeExp(e.expId) : removePay(e.itemId!, e.payIdx!))}>×</button>{/if}
        </li>
      {/each}
      {#each app.trip.transfers || [] as x (x.id)}
        <li class="ks-tr">
          <span class="ks-ic" aria-hidden="true">↔</span>
          <span class="ks-n">{t("ks.transfer", { from: nm(x.from), to: nm(x.to) })}<small class="muted">{x.at ? dateDE(x.at) : ""}</small></span>
          <b class="num">{eur(x.amount)}</b>
          {#if !access.readonly}<button class="dp-del" aria-label={t("ks.remove", { text: t("ks.transfer", { from: nm(x.from), to: nm(x.to) }) })} onclick={() => removeTransfer(x.id)}>×</button>{/if}
        </li>
      {/each}
    </ul>
    {#if L.entries.length > SHOW}<button class="linkbtn small" onclick={() => (showAll = !showAll)}>{showAll ? t("ks.less") : t("ks.more", { n: L.entries.length - SHOW })}</button>{/if}
  {/if}
</article>

<style>
  .kasse { display: flex; flex-direction: column; gap: 10px; }
  .ks-head { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
  .ks-head h3 { margin: 0; }
  .ks-head p { margin: 2px 0 0; }
  .ks-form { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-radius: 14px; background: var(--paper-2); }
  .ks-amt { display: flex; gap: 4px; }
  .ks-amt input { width: 90px; }
  .ks-moves ul, .ks-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .ks-moves li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-radius: 12px; background: color-mix(in srgb, var(--good) 10%, transparent); }
  .ks-moves li span { flex: 1; }
  .ks-even { margin: 0; color: var(--good); font-weight: 600; }
  .ks-modes summary { cursor: pointer; }
  .ks-mode { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
  .ks-kid { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-2); flex-basis: 100%; }
  .ks-bal summary { cursor: pointer; font-size: 14px; color: var(--ink-2); }
  .ks-bal table { width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 6px; }
  .ks-bal th, .ks-bal td { padding: 5px 6px; border-bottom: 1px solid var(--line); text-align: start; }
  .ks-bal th { font-size: 12px; color: var(--ink-2); }
  .ks-bal .num { text-align: end; }
  .ks-bal .pos { color: var(--good); font-weight: 700; }
  .ks-bal .neg { color: var(--bad, #c0392b); font-weight: 700; }
  .ks-list li { display: flex; align-items: baseline; gap: 8px; font-size: 14px; padding: 3px 0; }
  .ks-ic { width: 20px; text-align: center; }
  .ks-n { flex: 1; display: flex; flex-direction: column; }
  .ks-n small { font-size: 12px; }
  .ks-tr { color: var(--ink-2); }
  .ks-wait .num { color: var(--ink-3); }
  .ks-rej .ks-n, .ks-rej .num { text-decoration: line-through; color: var(--ink-3); }
  .ks-st { font-size: 12px; font-weight: 600; color: var(--ink-2); }
  .ks-ok { color: var(--good); }
  .ks-no { color: var(--bad, #c0392b); }
  .ks-vote { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .ks-vote .on { outline: 2px solid var(--c-split, var(--ink-2)); }
  .ks-why { display: flex; gap: 6px; margin-top: 4px; }
  .ks-why input { flex: 1; min-width: 0; }
  .ks-pend { margin: 0; padding: 6px 10px; border-radius: 12px; background: var(--paper-2); font-size: 14px; }
  .ks-alert { background: color-mix(in srgb, var(--bad, #c0392b) 12%, transparent); font-weight: 600; }
  .dp-del { border: 0; background: none; color: var(--ink-3); font-size: 16px; cursor: pointer; }
</style>
