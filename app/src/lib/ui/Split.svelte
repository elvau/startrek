<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  /* Wer zahlt was: pro Familie Summe, fest und offen, Mitglieder und alle Posten */
  import { app, calc } from "../store.svelte";
  import { activeOption, eur, eurPP, householdShares, testItems } from "../calc";
  import { CAT_CHAPTERS } from "../chapters";
  import { reveal } from "./reveal";
  import Icon from "./Icon.svelte";
  import FundsCard from "./FundsCard.svelte";
  import type { Key } from "../i18n/index.svelte";

  const shares = $derived(householdShares(app.trip, calc.T));
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
{#each shares as h (h.name)}
  <article class="card share" id="hh-{h.name}" use:reveal>
    <div class="sh-head">
      <div>
        <h3>{h.name}</h3>
        <span class="muted">{tn("n.persons", h.members.length)} · {t("perPerson", { v: eurPP(h.members.length ? h.total / h.members.length : 0) })}</span>
      </div>
      <div class="sh-tot"><b class="num">{eur(h.total)}</b><span>{t("split.share", { p: calc.T.due > 0 ? Math.round((h.total / calc.T.due) * 100) : 0 })}</span></div>
    </div>
    <div class="fix">
      <div class="bar"><i style="background:var(--good)" style:width="{h.total ? (h.fixed / h.total) * 100 : 0}%"></i><i style="background:var(--idea);opacity:.55" style:width="{h.total ? (h.open / h.total) * 100 : 0}%"></i></div>
      <div class="lg"><span>{t("fixed")} <b class="num">{eur(h.fixed)}</b></span><span>{t("open")} <b class="num">{eur(h.open)}</b></span></div>
    </div>
    <div class="sh-members">
      {#each h.members as m (m.t.id)}<span class="sh-m"><span class="av sm" style:background={m.t.color || "var(--ink-3)"}>{(m.t.name || "?")[0]}</span>{m.t.name || t("trav.noName")} <b class="num">{eur(m.v)}</b></span>{/each}
    </div>
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
{:else}
  <div class="empty-ch">{t("split.empty")}</div>
{/each}
