<script lang="ts">
  /*
   * Öffentliche Aktionsseite (…/?aktion=ID): wer den Link bekommt, sieht Ziel und Fortschritt und kann direkt an den
   * Organisator per PayPal.me oder über den Link zur Sammelaktion zahlen. Ohne Konto, ohne Firebase; nichts wird gespeichert.
   */
  import { onMount } from "svelte";
  import { applyDocument, locale, t } from "../i18n/index.svelte";
  import { fetchCampaign, linkSite, paypalUrl, type CampaignDoc } from "../campaign";

  let { id }: { id: string } = $props();
  let c = $state<(CampaignDoc & { updated?: string }) | null>(null);
  let status = $state<"load" | "ok" | "none" | "error">("load");

  onMount(async () => {
    applyDocument();
    try { c = await fetchCampaign(id); status = c ? "ok" : "none"; } catch { status = "error"; }
    if (c) document.title = `${c.title} · Split&Fly`;
  });

  const money = (v: number) => new Intl.NumberFormat(locale(), { style: "currency", currency: "EUR", maximumFractionDigits: v % 1 ? 2 : 0 }).format(v);
  const day = (d: string) => (d ? new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")) : "");
  const pct = $derived(c && c.goal ? Math.min(100, (c.raised / c.goal) * 100) : 0);
  const pctP = $derived(c && c.goal ? Math.min(100, (c.pledged / c.goal) * 100) : 0);
  const base = (import.meta.env.BASE_URL as string) || "/";
</script>

<main class="cmp">
  <a class="cmp-brand" href={base}>Split<span>&</span>Fly</a>
  {#if status === "load"}
    <p class="muted">{t("cmp.loading")}</p>
  {:else if status !== "ok" || !c}
    <section class="cmp-card">
      <h1>{t(status === "none" ? "cmp.gone" : "cmp.failed")}</h1>
      <p><a href={base}>{t("cmp.planOwn")}</a></p>
    </section>
  {:else}
    <section class="cmp-card">
      <p class="cmp-kicker">💰 {t("cmp.kicker")}</p>
      <h1>{c.title}</h1>
      {#if c.place || c.from}<p class="muted">{[c.place, c.from && `${day(c.from)}${c.to ? ` – ${day(c.to)}` : ""}`].filter(Boolean).join(" · ")}</p>{/if}
      {#if c.text}<p class="cmp-text">{c.text}</p>{/if}
      {#if c.goal > 0}
        <div class="cmp-prog" role="progressbar" aria-valuemin="0" aria-valuemax={c.goal} aria-valuenow={c.raised} aria-label={t("cmp.progress")}>
          <i style:width="{pct}%"></i><i class="pl" style:width="{Math.max(0, pctP - pct)}%"></i>
        </div>
        <p class="cmp-sum"><b class="num">{money(c.raised)}</b> {t("cmp.of", { v: money(c.goal) })}{c.pledged > c.raised ? ` · ${t("cmp.pledged", { v: money(c.pledged) })}` : ""}</p>
      {/if}
    </section>

    <section class="cmp-card cmp-pay">
      <h2>{t("cmp.howTo")}</h2>
      {#if c.paypal || c.link}
        <p class="cmp-ways">
          {#if c.paypal}<a class="btn primary cmp-paypal" href={paypalUrl(c.paypal)} target="_blank" rel="noopener noreferrer">PayPal.me/{c.paypal} ↗</a>{/if}
          {#if c.link}<a class="btn cmp-ext" href={c.link} target="_blank" rel="noopener noreferrer nofollow">{t("cmp.payVia", { site: linkSite(c.link) })} ↗</a>{/if}
        </p>
      {:else}
        <p class="cmp-none">{t("cmp.noMethod")}</p>
      {/if}
      <p class="small muted cmp-note">{t("cmp.direct")}</p>
    </section>

    <p class="cmp-foot small"><a href={base}>{t("cmp.planOwn")}</a> · <a href="{base}impressum.html">{t("legal.imprint")}</a> · <a href="{base}datenschutz.html">{t("legal.privacy")}</a></p>
  {/if}
</main>

<style>
  .cmp { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  .cmp-brand { font: 800 22px "Bricolage Grotesque Variable", sans-serif; color: var(--ink); text-decoration: none; }
  .cmp-brand span { color: var(--a); }
  .cmp-card { background: var(--paper); border: 1px solid var(--line); border-radius: 22px; padding: 22px; box-shadow: var(--shadow); }
  .cmp-card h1 { font-size: clamp(26px, 6vw, 36px); margin: 4px 0 6px; }
  .cmp-card h2 { font-size: 19px; margin: 0 0 12px; }
  .cmp-kicker { font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--a); margin: 0; }
  .cmp-text { white-space: pre-line; margin: 12px 0; }
  .cmp-prog { display: flex; height: 14px; border-radius: 99px; overflow: hidden; background: var(--line); margin-top: 16px; }
  .cmp-prog i { display: block; height: 100%; background: var(--good); }
  .cmp-prog i.pl { opacity: .35; }
  .cmp-sum { margin: 8px 0 0; }
  .cmp-sum b { font-size: 22px; }
  .cmp-ways { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; }
  .cmp-ways .btn { overflow-wrap: anywhere; }
  .cmp-note { margin-top: 14px; }
  .cmp-foot { text-align: center; color: var(--ink-2); }
  .cmp-foot a { color: inherit; }
</style>
