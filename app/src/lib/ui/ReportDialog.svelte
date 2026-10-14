<script lang="ts">
  /*
   * Reise als PDF: Reiseplan (Route, Unterkünfte, Tag für Tag, geschätzte Kosten) oder Rückblick (dazu tatsächliche Kosten
   * aus der Kasse). Karten werden geladen, dann öffnet der Druckdialog („Als PDF speichern“) oder ein neuer Tab (Handy).
   */
  import { t } from "../i18n/index.svelte";
  import { app, calc } from "../store.svelte";
  import { ensureAirports, ensureGeo } from "../geo/geo.svelte";
  import { tripRoute } from "../routeApp";
  import { buildReport } from "../tripreportApp";
  import type { ReportMode } from "../tripreport";
  import Modal from "./Modal.svelte";
  import { portal } from "./portal";

  let { onclose }: { onclose: () => void } = $props();
  // nach der Reise (oder mit Ausgaben in der Kasse) gleich den Rückblick vorschlagen
  const past = !!app.trip.to && app.trip.to < new Date().toISOString().slice(0, 10);
  let mode = $state<ReportMode>(past || app.trip.expenses?.length ? "after" : "plan");
  let busy = $state(false);
  let err = $state("");

  async function html() {
    await Promise.all([ensureGeo(app.trip).catch(() => {}), ensureAirports().catch(() => {})]);
    return buildReport({ trip: app.trip, T: calc.T, route: tripRoute(app.trip), mode });
  }
  type How = "print" | "tab" | "view" | "file";
  /** Ansicht in der App (HTML der Zusammenfassung im Rahmen über allem) */
  let shown = $state("");
  let viewer = $state<HTMLIFrameElement>();
  async function run(how: How) {
    busy = true; err = "";
    // Tab gleich öffnen (sonst blockt der Browser das Fenster nach dem Warten auf die Karten)
    const w = how === "tab" ? window.open("", "_blank") : null;
    try {
      const h = await html();
      if (how === "tab" && w) { w.document.open(); w.document.write(h); w.document.close(); }
      else if (how === "view") shown = h;
      else if (how === "file") {
        const url = URL.createObjectURL(new Blob([h], { type: "text/html" }));
        const a = document.createElement("a");
        a.href = url; a.download = `${(app.trip.name || app.trip.place || "reise").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "reise"}-${mode === "plan" ? "plan" : "rueckblick"}.html`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const f = document.createElement("iframe");
        f.className = "report-frame";
        f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        f.srcdoc = h;
        f.onload = () => { try { f.contentWindow?.focus(); f.contentWindow?.print(); } finally { setTimeout(() => f.remove(), 60_000); } };
        document.body.appendChild(f);
      }
    } catch {
      w?.close();
      err = t("rep.fail");
    } finally { busy = false; }
  }
  function printShown() { try { viewer?.contentWindow?.focus(); viewer?.contentWindow?.print(); } catch { /* Druck nicht möglich */ } }
</script>

<Modal title={`📄 ${t("rep.title")}`} {onclose}>
  <div class="rep-pick" role="radiogroup" aria-label={t("rep.title")}>
    <button type="button" role="radio" aria-checked={mode === "plan"} class="rep-opt" class:on={mode === "plan"} onclick={() => (mode = "plan")}>
      <span aria-hidden="true">🗺</span><b>{t("rep.plan")}</b><small>{t("rep.planSub")}</small>
    </button>
    <button type="button" role="radio" aria-checked={mode === "after"} class="rep-opt" class:on={mode === "after"} onclick={() => (mode = "after")}>
      <span aria-hidden="true">🧾</span><b>{t("rep.after")}</b><small>{t("rep.afterSub")}</small>
    </button>
  </div>
  <div class="rep-acts">
    <button class="btn primary rep-view" disabled={busy} onclick={() => run("view")}>{busy ? t("rep.busy") : `👁 ${t("rep.view")}`}</button>
    <button class="btn rep-make" disabled={busy} onclick={() => run("print")}>📄 {t("rep.make")}</button>
    <button class="btn rep-file" disabled={busy} onclick={() => run("file")}>⬇ {t("rep.file")}</button>
    <button class="btn rep-tab" disabled={busy} onclick={() => run("tab")}>{t("rep.tab")} ↗</button>
  </div>
  <p class="muted small">{t("rep.hint")}</p>
  {#if err}<p class="err small">{err}</p>{/if}
</Modal>

{#if shown}
  <!-- Übersicht als Seite in der App, ohne PDF -->
  <div class="rep-viewer" use:portal role="dialog" aria-modal="true" aria-label={t("rep.title")}>
    <div class="rep-bar">
      <b>{app.trip.name || app.trip.place}</b>
      <button class="btn sm" onclick={printShown}>📄 {t("rep.make")}</button>
      <button class="x" onclick={() => (shown = "")} aria-label={t("close")}>×</button>
    </div>
    <iframe bind:this={viewer} srcdoc={shown} title={t("rep.title")}></iframe>
  </div>
{/if}
<svelte:window onkeydown={e => { if (shown && e.key === "Escape") { e.stopPropagation(); shown = ""; } }} />

<style>
  .rep-pick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .rep-opt { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; text-align: start; padding: 12px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--paper); color: var(--ink); font: inherit; cursor: pointer; }
  .rep-opt span { font-size: 24px; }
  .rep-opt small { color: var(--ink-2); font-size: 12px; }
  .rep-opt.on { border-color: var(--a); background: var(--a-soft); }
  .rep-acts { display: flex; flex-wrap: wrap; gap: 8px; }
  .rep-viewer { position: fixed; inset: 0; z-index: 140; display: flex; flex-direction: column; background: var(--bg); }
  .rep-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--paper); border-bottom: 1px solid var(--line); }
  .rep-bar b { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rep-viewer iframe { flex: 1; width: 100%; border: 0; background: #fff; }
  @media (max-width: 480px) { .rep-pick { grid-template-columns: 1fr; } }
</style>
