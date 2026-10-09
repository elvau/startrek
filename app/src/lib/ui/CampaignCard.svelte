<script lang="ts">
  /*
   * Aktionsseite einrichten (im Bereich „Zuschüsse & Kasse“): Titel, Text, Ziel, PayPal.me und/oder Link zu einer
   * Sammelaktion. Veröffentlichen nur angemeldet und mit Einwilligung (beides ist für alle mit dem Link sichtbar).
   * Der Fortschritt (eingegangene und zugesagte Zuschüsse) wird automatisch nachgezogen, solange die Seite besteht.
   */
  import { netMessage } from "../neterror";
  import { untrack } from "svelte";
  import { t } from "../i18n/index.svelte";
  import { access, app, calc } from "../store.svelte";
  import { eur, parseNum } from "../calc";
  import { cloud, deleteCampaign, newCampaignId, saveCampaign } from "../cloud/cloud.svelte";
  import { campaignDoc, campaignLink, campaignProblem, cleanLink, cleanPaypal, LINK_HOSTS, linkSite, LIMITS, type Campaign } from "../campaign";
  import { fromShown, symbol, toShown } from "../currency.svelte";
  import { locale } from "../i18n/index.svelte";

  const T = $derived(calc.T);
  const c = $derived(app.trip.campaign);
  const mine = $derived(!!c?.owner && cloud.user?.uid === c.owner);
  const link = $derived(c?.at ? campaignLink(c.id, location.origin, (import.meta.env.BASE_URL as string) || "/") : "");
  let edit = $state<Campaign | null>(null);
  let goalText = $state("");
  let consent = $state(false);
  let busy = $state(false);
  let err = $state("");
  let copied = $state(false);

  function start() {
    const cur = app.trip.campaign;
    edit = cur ? { ...cur } : { id: "", title: app.trip.name || "", text: t("cmp.textDefault"), paypal: "", link: "" };
    goalText = edit.goal != null ? String(toShown(edit.goal)).replace(".", ",") : "";
    consent = !!cur?.at;
    err = "";
  }
  const sums = () => ({ total: T.total, raised: T.fundsReceived, pledged: T.funds });

  async function publish() {
    if (!edit) return;
    const x = parseNum(goalText);
    const { holder: _h, iban: _i, ...rest } = edit;
    const next: Campaign = { ...rest, goal: goalText.trim() && !isNaN(x) ? Math.max(0, fromShown(x)) : undefined };
    const p = campaignProblem(next, consent);
    if (p) { err = t(p); return; }
    busy = true; err = "";
    try {
      next.id ||= await newCampaignId();
      next.owner = await saveCampaign(next.id, withoutOwner(campaignDoc(next, app.trip, sums(), "")));
      next.at = new Date().toISOString();
      app.trip.campaign = next;
      lastSent = JSON.stringify(campaignDoc(next, app.trip, sums(), ""));
      edit = null;
    } catch (e) { err = netMessage(e); }
    finally { busy = false; }
  }
  const withoutOwner = ({ owner: _o, ...d }: ReturnType<typeof campaignDoc>) => d;

  async function withdraw() {
    if (!c || !confirm(t("cmp.withdrawConfirm"))) return;
    busy = true;
    try { if (c.at) await deleteCampaign(c.id); delete app.trip.campaign; edit = null; }
    catch (e) { err = netMessage(e); }
    finally { busy = false; }
  }

  // Fortschritt nachziehen: nur wer veröffentlicht hat, und nur wenn sich der öffentliche Inhalt geändert hat
  let lastSent = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!c?.at || !mine) return;
    const doc = JSON.stringify(campaignDoc(c, app.trip, sums(), ""));
    untrack(() => {
      // früher mit Kontoinhaber und IBAN veröffentlicht: beides aus Reise und Seite nehmen
      if ("iban" in c || "holder" in c) { delete c.iban; delete c.holder; lastSent = "alt"; }
      if (!lastSent) { lastSent = doc; return; }
      if (doc === lastSent) return;
      clearTimeout(timer);
      timer = setTimeout(() => { lastSent = doc; void saveCampaign(c.id, withoutOwner(campaignDoc(c, app.trip, sums(), ""))).catch(() => (lastSent = "")); }, 1500);
    });
  });

  async function copy() { try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 2000); } catch { /* egal */ } }
  const wa = $derived(`https://wa.me/?text=${encodeURIComponent(`${c?.title || ""}: ${link}`)}`);
</script>

{#if cloud.configured}
  <div class="cmp-box">
    <h4>📣 {t("cmp.title")}</h4>
    {#if edit}
      <div class="cmp-edit">
        <label class="f">{t("cmp.fTitle")}<input bind:value={edit.title} maxlength={LIMITS.title} /></label>
        <label class="f">{t("cmp.fText")}<textarea rows="3" bind:value={edit.text} maxlength={LIMITS.text}></textarea></label>
        <label class="f">{t("cmp.fGoal")}<span class="fu-amt"><input inputmode="decimal" bind:value={goalText} placeholder={String(Math.round(toShown(T.total)))} /> <span>{symbol(locale())}</span></span>
          <small class="muted">{t("cmp.goalHint", { v: eur(T.total) })}</small></label>
        <label class="f">{t("cmp.fPaypal")}<input class="cmp-paypal-in" bind:value={edit.paypal} placeholder="paypal.me/…" autocomplete="off" /></label>
        <label class="f">{t("cmp.fLink")}<input class="cmp-link-in" type="url" bind:value={edit.link} placeholder="https://gofund.me/…" autocomplete="off" />
          <small class="muted">{t("cmp.linkHint", { sites: LINK_HOSTS.filter(h => h !== "gofund.me").join(", ") })}</small></label>
        <label class="in-row cmp-consent"><input type="checkbox" bind:checked={consent} /> {t("cmp.consent")}</label>
        <p class="small muted">{t("cmp.legal")}</p>
        {#if err}<p class="err small">{err}</p>{/if}
        {#if !cloud.user}<p class="small">{t("cmp.needLogin")} <button class="linkbtn" onclick={() => (cloud.showLogin = true)}>{t("acct.login")}</button></p>{/if}
        <div class="fu-acts">
          <button class="btn sm primary cmp-publish" disabled={busy || !cloud.user} onclick={publish}>{c?.at ? t("cmp.update") : t("cmp.publish")}</button>
          <button class="btn sm" onclick={() => (edit = null)}>{t("cancel")}</button>
        </div>
      </div>
    {:else if c?.at}
      <p class="small">{t("cmp.live", { v: eur(T.fundsReceived), g: eur(c.goal ?? T.total) })}</p>
      <div class="cmp-link"><input readonly value={link} onfocus={e => e.currentTarget.select()} aria-label={t("cmp.link")} />
        <button class="btn sm cmp-copylink" onclick={copy}>{copied ? `✓ ${t("cmp.copied")}` : t("cmp.copy")}</button></div>
      <p class="fu-acts">
        <a class="btn sm" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
        <a class="btn sm cmp-open" href={link} target="_blank" rel="noopener noreferrer">{t("cmp.open")} ↗</a>
        {#if mine && !access.readonly}<button class="btn sm" onclick={start}>{t("cmp.edit")}</button><button class="btn sm fu-del" disabled={busy} onclick={withdraw}>{t("cmp.withdraw")}</button>{/if}
      </p>
      <p class="small muted">{mine ? t("cmp.autoUpdate") : t("cmp.byOther")} · {t("cmp.via", { how: [cleanPaypal(c.paypal) && `PayPal.me/${cleanPaypal(c.paypal)}`, cleanLink(c.link) && linkSite(cleanLink(c.link))].filter(Boolean).join(" · ") || "–" })}</p>
      {#if err}<p class="err small">{err}</p>{/if}
    {:else if !access.readonly}
      <p class="small muted">{t("cmp.hint")}</p>
      <button class="btn sm cmp-start" onclick={start}>📣 {t("cmp.create")}</button>
    {/if}
  </div>
{/if}

<style>
  .cmp-box { border-top: 1px dashed var(--line); margin-top: 14px; padding-top: 12px; display: flex; flex-direction: column; gap: 8px; }
  .cmp-box h4 { margin: 0; font-size: 15px; }
  .cmp-box p { margin: 0; }
  .cmp-edit { display: flex; flex-direction: column; gap: 10px; }
  .cmp-edit textarea { resize: vertical; }
  .cmp-link { display: flex; gap: 6px; }
  .cmp-link input { flex: 1; min-width: 0; font-size: 13px; }
  .cmp-consent { align-items: flex-start; font-size: 13.5px; }
</style>
