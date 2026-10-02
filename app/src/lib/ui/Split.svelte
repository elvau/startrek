<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  /* Wer zahlt was: pro Familie Summe, fest und offen, Mitglieder und alle Posten */
  import { app, calc } from "../store.svelte";
  import { activeOption, eur, eurPP, householdShares, testItems, type HouseholdShare } from "../calc";
  import { CAT_CHAPTERS } from "../chapters";
  import { reveal } from "./reveal";
  import Icon from "./Icon.svelte";
  import FundsCard from "./FundsCard.svelte";
  import type { Key } from "../i18n/index.svelte";

  const shares = $derived(householdShares(app.trip, calc.T));
  // ab 5 Familien: Tabelle statt Karten; gleiche Beträge für alle: die Aufschlüsselung nur einmal
  const many = $derived(shares.length > 4);
  let openHh = $state<Record<string, boolean>>({});
  let showAll = $state(false);
  const cols = $derived(CAT_CHAPTERS.filter(c => shares.some(h => h.cats.some(x => x.cat === c.k && Math.round(x.sum)))));
  const sig = (h: HouseholdShare) => JSON.stringify([h.members.length, h.cats.map(c => [c.cat, Math.round(c.sum)]), Math.round(h.total)]);
  const uniform = $derived(many && shares.every(h => sig(h) === sig(shares[0])));
  const tests = $derived(testItems(app.trip));
  const label = (k: string) => CAT_CHAPTERS.find(c => c.k === k)!;
  const ST = (s: string) => t(`status.${s}` as Key);

  function jump(id: string) {
    app.editing = id;
    requestAnimationFrame(() => document.querySelector(`[data-item="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
</script>

<FundsCard />
{#if tests.length && shares.length}<p class="warnline test-banner">⚠ {tn("test.inSplit", tests.length)}</p>{/if}
{#snippet card(h: HouseholdShare, same = false)}
  <article class="card share" id={same ? undefined : `hh-${h.name}`} use:reveal>
    <div class="sh-head">
      <div>
        <h3>{same ? t("split.eachSame") : h.name}</h3>
        <span class="muted">{same ? t("split.eachSameHint", { n: shares.length }) : `${tn("n.persons", h.members.length)} · ${t("perPerson", { v: eurPP(h.members.length ? h.total / h.members.length : 0) })}`}</span>
      </div>
      <div class="sh-tot"><b class="num">{eur(h.total)}</b><span>{same ? t("split.each") : t("split.share", { p: calc.T.due > 0 ? Math.round((h.total / calc.T.due) * 100) : 0 })}</span></div>
    </div>
    <div class="fix">
      <div class="bar"><i style="background:var(--good)" style:width="{h.total ? (h.fixed / h.total) * 100 : 0}%"></i><i style="background:var(--idea);opacity:.55" style:width="{h.total ? (h.open / h.total) * 100 : 0}%"></i></div>
      <div class="lg"><span>{t("fixed")} <b class="num">{eur(h.fixed)}</b></span><span>{t("open")} <b class="num">{eur(h.open)}</b></span></div>
    </div>
    {#if !same}<div class="sh-members">
      {#each h.members as m (m.t.id)}<span class="sh-m"><span class="av sm" style:background={m.t.color || "var(--ink-3)"}>{(m.t.name || "?")[0]}</span>{m.t.name || t("trav.noName")} <b class="num">{eur(m.v)}</b></span>{/each}
    </div>{/if}
    <div class="sh-cats">
      {#each h.cats as c (c.cat)}
        <details open>
          <summary style="--cc:var(--c-{c.cat})"><i></i><Icon name={label(c.cat).icon} size={16} /><span>{label(c.cat).label}</span><b class="num">{eur(c.sum)}</b></summary>
          <ul>
            {#each c.lines as l (l.key)}
              <li>
                <button class="sh-l" onclick={() => (l.item ? jump(l.item.id) : document.getElementById(c.cat)?.scrollIntoView({ behavior: "smooth" }))}>
                  <span class="sh-n">{l.label}{#if l.item && activeOption(l.item, app.trip)?.source?.test} <span class="pill-test">{t("test.badge")}</span>{/if}<small>{[l.detail, l.who < h.members.length ? t("split.who", { a: l.who, b: h.members.length }) : "", l.item ? ST(l.item.status) : ""].filter(Boolean).join(" · ")}</small></span>
                  <span class="num" class:fixed={l.fixed}>{eur(l.v)}</span>
                </button>
              </li>
            {/each}
          </ul>
        </details>
      {/each}
      {#if h.funds.length}
        <!-- Zuschüsse: senken den Eigenanteil des Haushalts -->
        <details open class="sh-funds">
          <summary style="--cc:var(--good)"><i></i><span aria-hidden="true">💰</span><span>{t("fund.title")}</span><b class="num">−{eur(h.costs - h.total)}</b></summary>
          <ul>
            {#each h.funds as f (f.id)}
              <li><span class="sh-l sh-fl"><span class="sh-n">{f.name}<small>{f.received ? t("fund.received") : t("fund.pledged")}</small></span><span class="num fixed">−{eur(f.v)}</span></span></li>
            {/each}
            <li><span class="sh-l sh-fl"><span class="sh-n"><b>{t("fund.own")}</b><small>{t("fund.ownHint", { v: eur(h.costs) })}</small></span><b class="num">{eur(h.total)}</b></span></li>
          </ul>
        </details>
      {/if}
    </div>
  </article>
{/snippet}

{#if many && shares.length}
  <!-- große Gruppe: Übersicht als Tabelle, Einzelheiten je Familie auf Wunsch (sonst 15 gleiche Karten untereinander) -->
  <article class="card share sh-table" use:reveal>
    <div class="sh-head"><div><h3>{t("split.overview")}</h3><span class="muted">{uniform ? t("split.uniform", { n: shares.length, v: eur(shares[0].total) }) : t("split.tapRow")}</span></div>
      <button class="btn sm sh-all" onclick={() => (showAll = !showAll)}>{showAll ? t("split.lessDetails") : t("split.allDetails")}</button></div>
    <div class="sh-scroll">
      <table>
        <thead><tr><th>{t("split.who.col")}</th>{#each cols as c (c.k)}<th class="num" title={c.label}><Icon name={c.icon} size={15} /></th>{/each}<th class="num">{t("total")}</th></tr></thead>
        <tbody>
          {#each shares as h (h.name)}
            <tr id={showAll || openHh[h.name] ? undefined : `hh-${h.name}`} class:on={openHh[h.name]} onclick={() => (openHh[h.name] = !openHh[h.name])}>
              <td><b>{h.name}</b>{#if h.members.length > 1} <small class="muted">· {tn("n.persons", h.members.length)}</small>{/if}</td>
              {#each cols as c (c.k)}<td class="num">{eur(h.cats.find(x => x.cat === c.k)?.sum || 0)}</td>{/each}
              <td class="num"><b>{eur(h.total)}</b></td>
            </tr>
          {/each}
        </tbody>
        <tfoot><tr><td>{t("total")}</td>{#each cols as c (c.k)}<td class="num">{eur(shares.reduce((a, h) => a + (h.cats.find(x => x.cat === c.k)?.sum || 0), 0))}</td>{/each}<td class="num"><b>{eur(calc.T.due)}</b></td></tr></tfoot>
      </table>
    </div>
  </article>
  {#if uniform && !showAll}{@render card(shares[0], true)}{/if}
{/if}
{#each shares as h (h.name)}
  {#if !many || showAll || openHh[h.name]}{@render card(h)}{/if}
{:else}
  <div class="empty-ch">{t("split.empty")}</div>
{/each}

<style>
  .sh-scroll { overflow-x: auto; margin: 0 -4px; }
  .sh-table table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .sh-table th, .sh-table td { padding: 7px 6px; border-bottom: 1px solid var(--line); text-align: start; white-space: nowrap; }
  .sh-table th { font-size: 12px; color: var(--ink-2); font-weight: 700; }
  .sh-table .num { text-align: end; }
  .sh-table tbody tr { cursor: pointer; }
  .sh-table tbody tr:hover, .sh-table tbody tr.on { background: var(--paper-2); }
  .sh-table tfoot td { font-weight: 700; border-bottom: 0; }
</style>
