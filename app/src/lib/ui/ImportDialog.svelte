<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Import in die offene Reise (#615): „Reise um Import erweitern“ (Reise-Menü) bzw. „Flug/Unterkunft/Tour/Transport
   * importieren“ (Kapitel). Ziel, Daten und Reisende bleiben; danach springt die Reise zum ersten übernommenen Posten.
   * Teilen-Menü (#616): geteilte Inhalte in die zuletzt geöffnete Reise, „Stattdessen neue Reise“ führt zu „Neue Reise“.
   */
  import Modal from "./Modal.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import { importIn } from "../import/open.svelte";
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
    <ImportPanel onclose={close} into scope={importIn.target.scope} itemId={importIn.target.itemId} onitems={done} shared={sh?.files} sharedText={sh?.text} sharedUrl={sh?.url} />
  </Modal>
{/if}
