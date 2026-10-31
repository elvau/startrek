<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Import in die offene Reise (#615): „Reise um Import erweitern“ (Reise-Menü) bzw. „Flug/Unterkunft/Tour/Transport
   * importieren“ (Kapitel). Ziel, Daten und Reisende bleiben; danach springt die Reise zum ersten übernommenen Posten.
   * Teilen-Menü (#616): geteilte Inhalte in die zuletzt geöffnete Reise, „Stattdessen neue Reise“ führt zu „Neue Reise“.
   */
  import Modal from "./Modal.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import { importIn, importUndo } from "../import/open.svelte";
  import { showItem } from "./showItem";
  import type { Item } from "../model";
  import { app, goHome } from "../store.svelte";
  import { shareIn } from "../import/share.svelte";

  const close = () => (importIn.open = false);
  const ICON = { all: "📥", flights: "✈", stay: "🛏", attractions: "🎟", transport: "🚌" } as const;
  /** geteilt, aber lieber als neue Reise: wie bisher über „Neue Reise → Importieren“ */
  function asNew() {
    const sh = importIn.target.shared;
    close();
    goHome();
    if (sh) shareIn.v = sh;
  }
  // Rückgängig (#617): 20 Sekunden nach dem Übernehmen, nur in derselben Reise
  let now = $state(Date.now());
  $effect(() => { if (!importUndo.at) return; now = Date.now(); const h = setInterval(() => (now = Date.now()), 1000); const off = setTimeout(() => clearInterval(h), 21000); return () => { clearInterval(h); clearTimeout(off); }; });
  const canUndo = $derived(!!importUndo.snap && importUndo.tripId === app.trip.id && now - importUndo.at < 20000 && !importIn.open);
  function undo() {
    const before = JSON.parse(importUndo.snap) as Record<string, unknown>;
    const cur = app.trip as unknown as Record<string, unknown>;
    for (const k of Object.keys(cur)) if (!(k in before)) delete cur[k];
    Object.assign(app.trip, before);
    importUndo.snap = ""; importUndo.at = 0;
  }
  function done(items: Item[]) {
    // geteilt von der Startseite aus: danach die Reise zeigen
    app.home = false;
    const first = items[0];
    if (first) setTimeout(() => showItem(first.id));
  }
</script>

{#if importIn.open}
  <Modal title={`${ICON[importIn.target.scope]} ${t(`imp.title.${importIn.target.scope}` as Key)}`} onclose={close}>
    {@const sh = importIn.target.shared}
    {#if sh}<p class="small imp-shared-into">{t("imp.sharedInto", { name: app.trip.name || app.trip.place || t("trip.untitled") })} <button type="button" class="linkbtn imp-shared-new" onclick={asNew}>{t("imp.sharedNew")}</button></p>{/if}
    <ImportPanel onclose={close} into scope={importIn.target.scope} itemId={importIn.target.itemId} diff={importIn.target.scope === "all" && !importIn.target.itemId} onitems={done} shared={sh?.files} sharedText={sh?.text} sharedUrl={sh?.url} />
  </Modal>
{/if}

{#if canUndo}
  <div class="imp-undo" role="status"><span>📥 {t("imp.applied")}</span><button type="button" class="btn sm imp-undo-btn" onclick={undo}>↶ {t("ai.undo")}</button></div>
{/if}

<style>
  .imp-undo { position: fixed; inset-inline: 16px; bottom: calc(84px + env(safe-area-inset-bottom)); z-index: 60; margin: 0 auto; max-width: 420px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px 10px 16px; border-radius: 16px; background: var(--ink); color: var(--paper); box-shadow: var(--shadow); }
  .imp-undo .btn { background: var(--paper); color: var(--ink); }
</style>
