<script lang="ts">
  /*
   * Übergang zum Anbieter: vor dem Öffnen kurz der Hinweis „kein Reiseveranstalter, Vertrag nur mit …“. „Weiter“ ist selbst
   * der Link (öffnet den neuen Tab ohne Sperre durch den Browser); mit Haken kommt der Hinweis nicht wieder.
   */
  import { t } from "../i18n/index.svelte";
  import Modal from "./Modal.svelte";
  import { acknowledge, broker } from "../broker.svelte";
  let forever = $state(false);
  const close = () => { broker.pending = null; forever = false; };
</script>

{#if broker.pending}
  {@const p = broker.pending}
  <Modal title={t("legal.gateTitle")} onclose={close}>
    <div class="broker-gate">
      <p>{p.name ? t("legal.gateTo", { p: p.name }) : t("legal.gateToAny")}</p>
      <p class="muted small">{t("legal.broker")}</p>
      <label class="check"><input type="checkbox" bind:checked={forever} /> {t("legal.gateHide")}</label>
      <div class="row">
        <button class="btn" onclick={close}>{t("cancel")}</button>
        <a class="btn primary broker-go" href={p.href} target="_blank" rel={p.sponsored ? "noopener noreferrer sponsored" : "noopener noreferrer"}
          onclick={() => { p.go(); acknowledge(forever); close(); }}>{p.name ? t("legal.gateGo", { p: p.name }) : t("legal.gateGoAny")} ↗</a>
      </div>
    </div>
  </Modal>
{/if}
