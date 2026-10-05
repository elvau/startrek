<script lang="ts">
  import { arrow, t, tn } from "../i18n/index.svelte";
  import { access, app, calc } from "../store.svelte";
  import { cloud, isCloud } from "../cloud/cloud.svelte";
  import { activeOption, eur, eurPP, testItems } from "../calc";
  import { isDetailed } from "../model";
  import { CAT_CHAPTERS } from "../chapters";
  import { nights } from "../format";
  import { view } from "../scroll.svelte";
  import { changed, watchable } from "../watch";
  import { runWatch, watchRun } from "../watch.svelte";
  import { FLIGHTS_URL } from "../flights/app";

  // sheet: auf dem Handy als Blatt über der Seite, ein Tipp auf einen Link schließt es
  let { sheet = false, onpick }: { sheet?: boolean; onpick?: () => void } = $props();

  const T = $derived(calc.T);
  let openCat = $state<Record<string, boolean>>({});
  // Testpreise (Sandbox) in der Summe: deutlich sagen, dass die Summe nicht echt ist
  const tests = $derived(testItems(app.trip));
  const n = $derived(T.active);
  const nn = $derived(nights(app.trip.from, app.trip.to));
  // Fest/offen und bezahlt gibt es nur mit detaillierten Posten
  const anyDetail = $derived(CAT_CHAPTERS.some(c => isDetailed(app.trip, c.k)));

  // Preise prüfen: dieselben Angebote zum heutigen Preis; was sich geändert hat, steht am Posten
  const nw = $derived(watchable(app.trip).length);
  const w = $derived(app.trip.watch?.at ? app.trip.watch : null);
  const moved = $derived(w ? Object.entries(w.items).filter(([, h]) => !h.err && h.now != null && h.now !== h.was).length : 0);
  const delta = $derived(changed(app.trip));
  const wAt = $derived(w ? new Date(w.at).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

  function detailText(k: (typeof CAT_CHAPTERS)[number]["k"], label: string): string {
    if (!isDetailed(app.trip, k)) {
      const v = T.simple[k] || 0;
      return v ? t("aside.simple", { label }) : t("aside.noAmount");
    }
    const its = app.trip.items.filter(x => x.cat === k && x.status !== "dropped");
    return its.length ? its.map(x => `${x.name || activeOption(x, app.trip)?.label || t("item.new")} ${eur(T.items[x.id]?.net || 0)}${activeOption(x, app.trip)?.source?.test ? ` (${t("test.badge")})` : ""}`).join(" · ") : t("aside.noItems");
  }
  const xAdd = $derived(T.extras.onsite + T.extras.extra);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<aside class="aside" class:sheet aria-label={t("aside.summary")} onclick={e => { if ((e.target as Element).closest("a")) onpick?.(); }}>
  <div class="tk">
    <div class="tk-top">
      <small>{t("total")}</small>
      <b class="num">{eur(T.total)}</b>
      {#if xAdd > 0}<span class="tk-xc">{t("aside.xcIncl", { v: `${T.extras.est ? `${t("xc.ca")} ` : ""}${eur(xAdd)}` })}</span>{/if}
      <span>{n ? `${t("perPerson", { v: eurPP(T.due / n) })} · ${tn("n.persons", n)}` : t("nobody")}</span>
      {#if T.funds}<span class="tk-fund">{t("fund.minus", { v: eur(T.funds) })} · {t("fund.own")} {eur(T.due)}</span>{/if}
      {#if tests.length}<span class="tk-test" title={tests.map(x => x.name).join(", ")}>⚠ {tn("test.inTotal", tests.length)}</span>{/if}
    </div>
    <div class="tk-b">
      {#if anyDetail}<div class="fix">
        <div class="bar">
          <i style="background:var(--good)" style:width="{T.total ? (T.fixed / T.total) * 100 : 0}%"></i>
          <i style="background:var(--idea);opacity:.55" style:width="{T.total ? (T.open / T.total) * 100 : 0}%"></i>
        </div>
        <div class="lg"><span>{t("fixed")} <b class="num">{eur(T.fixed)}</b></span><span>{t("open")} <b class="num">{eur(T.open)}</b></span></div>
      </div>{/if}
      {#if xAdd > 0 || T.extras.included > 0 || T.extras.deposit > 0}
        <details class="xc-sum" open={xAdd > 0 || T.extras.deposit > 0}>
          <summary class="sect">{t("aside.xc")}</summary>
          {#if T.extras.onsite}<div class="xc-l"><span>{t("aside.xcOnsite")}</span><b class="num">{eur(T.extras.onsite)}</b></div>{/if}
          {#if T.extras.extra}<div class="xc-l"><span>{t("aside.xcExtra")}</span><b class="num">{eur(T.extras.extra)}</b></div>{/if}
          {#if T.extras.est}<div class="xc-l muted"><span>{t("aside.xcEst")}</span><b class="num">{t("xc.ca")} {eur(T.extras.est)}</b></div>{/if}
          {#if T.extras.included}<div class="xc-l muted"><span>{t("aside.xcIncluded")}</span><b class="num">{eur(T.extras.included)}</b></div>{/if}
          {#if T.extras.deposit}
            <div class="xc-l xc-k"><span>🔒 {t("aside.deposits")}</span><b class="num">{eur(T.extras.deposit)}</b></div>
            {#each T.extras.deposits as id (id)}{@const it = app.trip.items.find(i => i.id === id)}{#if it}<a class="xc-l xc-ki" href="#{it.cat}"><span>{it.name}{T.items[id]?.option?.deposit?.how === "credit" ? ` · ${t("dep.creditShort")}` : ""}</span><b class="num">{eur(T.items[id]?.extras?.deposit || 0)}</b></a>{/if}{/each}
          {/if}
        </details>
      {/if}
      <div class="cats">
        {#each CAT_CHAPTERS as c (c.k)}
          <!-- Posten der Kategorie nur auf Wunsch (▾), sonst wird die Leiste bei vielen Posten zu lang -->
          <div class="cat" class:on={view.active === c.k} class:open={!!openCat[c.k]} style="--cc:var(--c-{c.k})">
            <a class="cat-a" href="#{c.k}"><i></i><span>{c.label}</span><b>{eur(T.byCat[c.k])}</b></a>
            <button type="button" class="cat-t" aria-expanded={!!openCat[c.k]} title={t("aside.details")} aria-label="{c.label}: {t('aside.details')}" onclick={() => (openCat[c.k] = !openCat[c.k])}>▾</button>
            <span class="cat-d">{detailText(c.k, c.label)}</span>
          </div>
        {/each}
      </div>
      {#if Object.keys(T.byHousehold).length > 1}
        <!-- viele Familien: zugeklappt, auf Wunsch aufklappen -->
        <div class="fam">
          <details class="fam-d" open={Object.keys(T.byHousehold).length <= 3}>
            <summary class="sect">{t("aside.perFamily")} ({Object.keys(T.byHousehold).length})</summary>
            {#each Object.entries(T.byHousehold) as [h, v] (h)}
              <a class="fam-l" href="#hh-{h}"><span>{h}</span><b class="num">{eur(v)}</b></a>
            {/each}
          </details>
          <a class="fam-more" href="#split">{t("aside.whoPays")} {arrow()}</a>
        </div>
      {:else}
        <a class="fam-more" href="#split">{t("aside.split")} {arrow()}</a>
      {/if}
      {#if nn && n}<div class="pp"><span>{t("aside.perNight")}</span><b class="num">{eur(T.due / n / nn)}</b></div>{/if}
      {#if anyDetail}<div class="pp"><span>{t("aside.paid")}</span><b class="num">{eur(T.paid)}</b></div>{/if}
      {#if nw && FLIGHTS_URL && !access.readonly}
        <div class="tk-watch">
          <button class="btn sm watch-run" disabled={watchRun.busy} title={t("watch.lead")} onclick={runWatch}>
            <span aria-hidden="true" class:spin={watchRun.busy}>🔄</span> {watchRun.busy ? t("watch.checking", { n: watchRun.done, of: watchRun.of }) : t("watch.check")}
          </button>
          {#if w && !watchRun.busy}
            <small class="watch-res">{t("watch.at", { d: wAt })} · {moved ? `${tn("watch.moved", moved)}${delta ? ` (${delta > 0 ? "▲ +" : "▼ −"}${eur(Math.abs(delta))})` : ""}` : t("watch.same")}</small>
          {/if}
          {#if watchRun.err}<small class="err">{watchRun.err}</small>{/if}
        </div>
      {/if}
      <div class="pp save"><span>{!app.saved || cloud.status === "saving" ? t("acct.st.saving") : isCloud(app.trip.id) ? (cloud.status === "offline" ? t("aside.offline") : cloud.status === "error" ? t("acct.st.error") : `☁ ${t("acct.st.saved")}`) : t("aside.savedLocal")}</span></div>
    </div>
  </div>
</aside>

<style>
  .tk-xc { display: block; font-weight: 700; }
  .xc-sum { padding: 2px 0 10px; border-bottom: 1px solid var(--line); margin-bottom: 8px; font-size: 13px; }
  .xc-l { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; color: inherit; text-decoration: none; }
  .xc-k { margin-top: 4px; color: var(--a); font-weight: 700; }
  .xc-ki { padding-inline-start: 18px; font-size: 12.5px; color: var(--ink-2); }
</style>
