<script lang="ts">
  /*
   * Meine Daten (Art. 15 und 20 DSGVO): alles aus dem Konto frisch vom Server holen, als Auskunft zum Drucken bzw.
   * „Als PDF speichern“ (Druckdialog des Browsers) und als vollständige Datei (JSON). Entsteht nur im Browser; enthält
   * auch die Buchungsdaten, wird aber nirgends gespeichert oder verschickt.
   */
  import { i18n, t } from "../i18n/index.svelte";
  import Modal from "./Modal.svelte";
  import { myAccountData } from "../cloud/cloud.svelte";
  import { accountJson, reportHtml, type LocalEntry } from "../datareport";
  import { myData } from "../mydata.svelte";
  import type { AccountData } from "../cloud/firebase";

  let data = $state<AccountData | null>(null);
  let err = $state("");
  let busy = $state(false);

  /** was die App in diesem Browser ablegt (nur die eigenen Einträge, rk…) */
  function local(): LocalEntry[] {
    const out: LocalEntry[] = [];
    for (const st of [localStorage, sessionStorage]) {
      try { for (const k of Object.keys(st)) if (k.startsWith("rk")) out.push({ key: k, size: (st.getItem(k) || "").length }); } catch { /* gesperrt */ }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  }

  async function load() {
    busy = true; err = "";
    try { data = await myAccountData(); } catch (e) { console.warn(e); err = t("data.error"); }
    busy = false;
  }
  $effect(() => { void load(); });

  const html = () => reportHtml(data!, local(), i18n.lang === "de" ? "de" : "en");
  const stamp = () => new Date().toISOString().slice(0, 10);

  /** Druckdialog über einen unsichtbaren Rahmen (kein neues Fenster, das der Browser sperren könnte) */
  function print() {
    const f = document.createElement("iframe");
    f.className = "mydata-frame";
    f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    f.srcdoc = html();
    f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } finally { setTimeout(() => f.remove(), 60_000); } };
    document.body.appendChild(f);
  }
  /** als Seite in einem neuen Tab (z. B. auf dem Handy, wo Drucken aus dem Rahmen nicht überall geht) */
  function openTab() {
    const url = URL.createObjectURL(new Blob([html()], { type: "text/html" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function download() {
    const url = URL.createObjectURL(new Blob([accountJson(data!, local())], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `splitandfly-meine-daten-${stamp()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
</script>

<Modal title={t("data.title")} onclose={() => (myData.open = false)}>
  <div class="mydata">
    <p>{t("data.lead")}</p>
    <p class="muted small">{t("data.sensitive")}</p>
    {#if busy}<p class="muted">{t("data.loading")}</p>
    {:else if err}<p class="err">{err}</p><button class="btn" onclick={load}>{t("net.retry")}</button>
    {:else if data}
      <p class="small mydata-sum">{t("data.sum", { trips: data.trips.length, campaigns: data.campaigns.length })}</p>
      <div class="row">
        <button class="btn primary mydata-print" onclick={print}>🖨 {t("data.print")}</button>
        <button class="btn mydata-tab" onclick={openTab}>{t("data.open")} ↗</button>
        <button class="btn mydata-json" onclick={download}>⬇ {t("data.json")}</button>
      </div>
    {/if}
  </div>
</Modal>
