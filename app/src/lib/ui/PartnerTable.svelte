<script lang="ts">
  /* Admin: Partner-Verzeichnis mit Kategorie, Netzwerk, Status der Partnerkennung und Klicks der letzten 7 Tage */
  import { locale, t, type Key } from "../i18n/index.svelte";
  import { partnerRows, type UsageReport } from "../admin/usage";
  import { partnerList } from "../partners";
  let { report }: { report: UsageReport | null } = $props();
  const rows = $derived(partnerRows(report, partnerList()));
</script>

<div class="pt-wrap">
  <table class="pt">
    <thead><tr><th>{t("adm.p.partner")}</th><th>{t("adm.p.cat")}</th><th>{t("adm.p.net")}</th><th>{t("adm.p.state")}</th><th class="num">{t("adm.p.clicks")}</th></tr></thead>
    <tbody>
      {#each rows as r (r.id)}
        <tr data-id={r.id}>
          <td>{r.name}</td>
          <td>{t(`adm.p.c.${r.cat}` as Key)}</td>
          <td>{r.net ? (r.net === "direct" ? t("adm.p.n.direct") : r.net === "travelpayouts" ? "Travelpayouts" : r.net === "awin" ? "Awin" : "Amazon") : "–"}</td>
          <td><span class="pt-s pt-{r.state}">{t(`adm.p.s.${r.state}` as Key)}</span></td>
          <td class="num">{report?.series ? r.clicks.toLocaleString(locale()) : "–"}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="muted small">{t("adm.p.hint")}</p>

<style>
  .pt-wrap { overflow-x: auto; }
  .pt { width: 100%; border-collapse: collapse; font-size: 14px; }
  .pt th, .pt td { text-align: start; padding: 5px 8px; border-bottom: 1px solid var(--line, #ddd); white-space: nowrap; }
  .pt th { font-weight: 600; }
  .pt .num { text-align: end; font-variant-numeric: tabular-nums; }
  .pt-s { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12.5px; background: var(--chip, rgba(127, 127, 127, .15)); }
  .pt-active { background: rgba(46, 160, 67, .2); }
  .pt-ready { background: rgba(210, 153, 34, .22); }
  .pt-off { opacity: .6; }
</style>
