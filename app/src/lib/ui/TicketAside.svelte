<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import { app, calc } from "../store.svelte";
  import { cloud, isCloud } from "../cloud/cloud.svelte";
  import { activeOption, eur } from "../calc";
  import { isDetailed } from "../model";
  import { CAT_CHAPTERS } from "../chapters";
  import { nights } from "../format";
  import { view } from "../scroll.svelte";

  // sheet: auf dem Handy als Blatt über der Seite, ein Tipp auf einen Link schließt es
  let { sheet = false, onpick }: { sheet?: boolean; onpick?: () => void } = $props();

  const T = $derived(calc.T);
  const n = $derived(T.active);
  const nn = $derived(nights(app.trip.from, app.trip.to));
  // Fest/offen und bezahlt gibt es nur mit detaillierten Posten
  const anyDetail = $derived(CAT_CHAPTERS.some(c => isDetailed(app.trip, c.k)));

  function detailText(k: (typeof CAT_CHAPTERS)[number]["k"], label: string): string {
    if (!isDetailed(app.trip, k)) {
      const v = T.simple[k] || 0;
      return v ? t("aside.simple", { label }) : t("aside.noAmount");
    }
    const its = app.trip.items.filter(x => x.cat === k && x.status !== "dropped");
    return its.length ? its.map(x => `${x.name || activeOption(x, app.trip)?.label || t("item.new")} ${eur(T.items[x.id]?.net || 0)}`).join(" · ") : t("aside.noItems");
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<aside class="aside" class:sheet aria-label={t("aside.summary")} onclick={e => { if ((e.target as Element).closest("a")) onpick?.(); }}>
  <div class="tk">
    <div class="tk-top">
      <small>{t("total")}</small>
      <b class="num">{eur(T.total)}</b>
      <span>{n ? `${t("perPerson", { v: eur(T.total / n) })} · ${tn("n.persons", n)}` : t("nobody")}</span>
    </div>
    <div class="tk-b">
      {#if anyDetail}<div class="fix">
        <div class="bar">
          <i style="background:var(--good)" style:width="{T.total ? (T.fixed / T.total) * 100 : 0}%"></i>
          <i style="background:var(--idea);opacity:.55" style:width="{T.total ? (T.open / T.total) * 100 : 0}%"></i>
        </div>
        <div class="lg"><span>{t("fixed")} <b class="num">{eur(T.fixed)}</b></span><span>{t("open")} <b class="num">{eur(T.open)}</b></span></div>
      </div>{/if}
      <div class="cats">
        {#each CAT_CHAPTERS as c (c.k)}
          <a class="cat" class:on={view.active === c.k} href="#{c.k}" style="--cc:var(--c-{c.k})">
            <i></i><span>{c.label}</span><b>{eur(T.byCat[c.k])}</b>
            <span class="cat-d">{detailText(c.k, c.label)}</span>
          </a>
        {/each}
      </div>
      {#if Object.keys(T.byHousehold).length > 1}
        <div class="fam">
          <span class="sect">{t("aside.perFamily")}</span>
          {#each Object.entries(T.byHousehold) as [h, v] (h)}
            <a class="fam-l" href="#hh-{h}"><span>{h}</span><b class="num">{eur(v)}</b></a>
          {/each}
          <a class="fam-more" href="#split">{t("aside.whoPays")} →</a>
        </div>
      {:else}
        <a class="fam-more" href="#split">{t("aside.split")} →</a>
      {/if}
      {#if nn && n}<div class="pp"><span>{t("aside.perNight")}</span><b class="num">{eur(T.total / n / nn)}</b></div>{/if}
      {#if anyDetail}<div class="pp"><span>{t("aside.paid")}</span><b class="num">{eur(T.paid)}</b></div>{/if}
      <div class="pp save"><span>{!app.saved || cloud.status === "saving" ? t("acct.st.saving") : isCloud(app.trip.id) ? (cloud.status === "offline" ? t("aside.offline") : cloud.status === "error" ? t("acct.st.error") : `☁ ${t("acct.st.saved")}`) : t("aside.savedLocal")}</span></div>
    </div>
  </div>
</aside>
