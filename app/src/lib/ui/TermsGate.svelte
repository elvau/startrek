<script lang="ts">
  /*
   * AGB-Zustimmung für Konten ohne Zustimmung zur aktuellen Fassung (bestehende Konten, neue Fassung, Anmelde-Link in
   * einem anderen Browser): Zustimmen oder Abmelden. Kommt erst, wenn der Stand des Kontos geladen ist.
   */
  import { t } from "../i18n/index.svelte";
  import Modal from "./Modal.svelte";
  import { dir } from "../directory.svelte";
  import { accept } from "../terms";
  import { legalUrl } from "../legal";
  import { logout } from "../store.svelte";
  let agree = $state(false);
</script>

<Modal title={t("terms.title")} onclose={() => void logout()}>
  <div class="terms-gate">
    <p>{t("terms.lead")}</p>
    <p class="muted small">{t("legal.broker")}</p>
    <p><a href={legalUrl("terms")} target="_blank" rel="noopener">{t("terms.read")} ↗</a></p>
    <label class="check"><input type="checkbox" bind:checked={agree} /> {t("login.terms")} {t("legal.terms")} · {t("legal.privacy")}</label>
    <div class="row">
      <button class="btn" onclick={() => void logout()}>{t("terms.logout")}</button>
      <button class="btn primary terms-accept" disabled={!agree} onclick={() => accept(dir)}>{t("terms.accept")}</button>
    </div>
  </div>
</Modal>
