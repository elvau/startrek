<script lang="ts">
  import { t, type Key } from "../i18n/index.svelte";
  /*
   * Import in die offene Reise (#615): „Reise um Import erweitern“ (Reise-Menü) bzw. „Flug/Unterkunft/Tour/Transport
   * importieren“ (Kapitel). Ziel, Daten und Reisende bleiben; danach springt die Reise zum ersten übernommenen Posten.
   */
  import Modal from "./Modal.svelte";
  import ImportPanel from "./ImportPanel.svelte";
  import { importIn } from "../import/open.svelte";
  import { showItem } from "./showItem";
  import type { Item } from "../model";

  const close = () => (importIn.open = false);
  const ICON = { all: "📥", flights: "✈", stay: "🛏", attractions: "🎟", transport: "🚌" } as const;
  function done(items: Item[]) {
    const first = items[0];
    if (first) setTimeout(() => showItem(first.id));
  }
</script>

{#if importIn.open}
  <Modal title={`${ICON[importIn.target.scope]} ${t(`imp.title.${importIn.target.scope}` as Key)}`} onclose={close}>
    <ImportPanel onclose={close} into scope={importIn.target.scope} itemId={importIn.target.itemId} onitems={done} />
  </Modal>
{/if}
