<script lang="ts">
  /* Admin: Nutzung der kostenlosen Kontingente (Cloudflare, Anbieter, Funktionen) und Links zu den Konsolen */
  import { locale, t, type Key } from "../i18n/index.svelte";
  import { admin, fetchUsage } from "../admin/app.svelte";
  import { clickRows, cloudflareRows, consoleLinks, fmtBytes, providerRows, routeRows, type Row, type UsageReport } from "../admin/usage";
  import { clickNames } from "../partners";
  import Modal from "./Modal.svelte";
  import UsageBarrel from "./UsageBarrel.svelte";
  import PartnerTable from "./PartnerTable.svelte";

  let report = $state<UsageReport | null>(null);
  let err = $state("");
  let busy = $state(false);

  async function load() {
    busy = true; err = "";
    try {
      const r = await fetchUsage();
      if (r.report) report = r.report; else err = r.error || t("search.status", { s: r.status });
    } catch (e) { err = (e as Error).message; }
    finally { busy = false; }
  }
  $effect(() => { void load(); });

  const num = (n: number) => n.toLocaleString(locale());
  const val = (r: Row, n: number) => (r.bytes ? fmtBytes(n, locale()) : num(n));
  const label = (s: string) => (s.startsWith("adm.") ? t(s as Key) : s);
  function limitText(r: Row) {
    if (!r.limit) return t("adm.noLimit");
    const n = r.bytes ? fmtBytes(r.limit, locale()) : num(r.limit);
    return r.per === "day" ? t("adm.perDay", { n }) : r.per === "month" ? t("adm.perMonth", { n }) : r.per === "min" ? t("adm.perMin", { n }) : n;
  }
  // kleine, aber vorhandene Nutzung nicht als „0 %“ zeigen
  const pct = (r: Row) => (r.value > 0 && r.share! < 0.005 ? "<\u20091\u2009%" : `${Math.round(r.share! * 100)}\u2009%`);
  const LV_ICON = { ok: "✓", warn: "!", high: "‼" } as const;
  const max = (w: number[]) => Math.max(1, ...w);
  const PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

  const sections = $derived(report ? [
    { key: "adm.sec.cf" as Key, rows: cloudflareRows(report), err: [report.errors.worker && `Worker: ${report.errors.worker}`, report.errors.r2 && `R2: ${report.errors.r2}`].filter(Boolean).join(" · ") },
    { key: "adm.sec.api" as Key, rows: providerRows(report, Number(report.config.geminiPerDay) || 0), err: report.errors.own },
    { key: "adm.sec.routes" as Key, rows: routeRows(report), err: "" },
    { key: "adm.sec.clicks" as Key, rows: clickRows(report, clickNames()), err: "" }
  ] : []);
</script>

<Modal title={t("adm.title")} wide onclose={() => (admin.open = false)}>
  <div class="usage">
    <div class="usage-top">
      <span class="muted small">{report ? t("adm.stand", { t: new Date(report.at).toLocaleString(locale()) }) : busy ? t("adm.loading") : ""}</span>
      <button class="btn usage-reload" onclick={load} disabled={busy}>{t("adm.reload")}</button>
    </div>
    {#if err}<p class="err">{err}</p>{/if}
    {#if report?.errors.setup}<p class="err">{t("adm.missing", { e: report.errors.setup })} · {t("adm.setup")}</p>{/if}

    {#each sections as s (s.key)}
      <h4>{t(s.key)}</h4>
      {#if s.err}<p class="err small">{t("adm.missing", { e: s.err })}</p>{/if}
      {#if s.rows.length}
        <div class="usage-cards">
          {#each s.rows as r (r.id)}
            <article class="usage-card lv-{r.level}" class:gauge={r.share != null} data-id={r.id}>
              {#if r.share != null}<UsageBarrel share={r.share} level={r.level} id={r.id} />{/if}
              <div class="usage-body">
                <h5>{label(r.label)}</h5>
                {#if r.share != null}
                  <div class="usage-pct">{pct(r)}</div>
                  <div class="usage-of"><b>{val(r, r.value)}</b> / {limitText(r)}</div>
                  <span class="usage-chip"><i aria-hidden="true">{LV_ICON[r.level]}</i>{t(`adm.lv.${r.level}` as Key)}</span>
                {:else}
                  <div class="usage-pct">{val(r, r.value)}</div>
                  <div class="usage-of">{r.week ? t("adm.today") : t("adm.month")} · {limitText(r)}</div>
                {/if}
                {#if r.note}<small class="usage-note">{t(r.note.key as Key, { n: num(r.note.n) })}</small>{/if}
                {#if r.week}
                  <div class="usage-week" role="img" aria-label="{t('adm.days7')}: {r.week.map(num).join(', ')}">
                    {#each r.week as n, i (i)}<i class:today={i === r.week.length - 1} style="height:{Math.max(n ? 10 : 3, (n / max(r.week)) * 100)}%" title="{report?.days[i]}: {num(n)}"></i>{/each}
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else if !s.err}<p class="muted small">{t("adm.none")}</p>{/if}
    {/each}

    {#if report}
      <h4>{t("adm.sec.partners")}</h4>
      <PartnerTable {report} />
      <p class="muted small usage-cfg">
        {t("adm.c.agent", { n: String(report.config.agentDaily ?? "–") })} · {t("adm.c.bug", { n: String(report.config.bugDaily ?? "–") })}
        · {t("adm.c.model", { m: String(report.config.model || "–") + (report.config.fallback ? ` → ${report.config.fallback}` : "") })}
      </p>
    {/if}

    <h4>{t("adm.sec.manual")}</h4>
    <ul class="usage-links">
      {#each consoleLinks(PROJECT) as l (l.href)}<li><a href={l.href} target="_blank" rel="noopener noreferrer">{t(l.label as Key)} ↗</a></li>{/each}
    </ul>
  </div>
</Modal>
