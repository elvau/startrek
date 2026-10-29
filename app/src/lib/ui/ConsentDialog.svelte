<script lang="ts">
  /* Zustimmung für eine Chat-App (OAuth, #590): erst anmelden, dann erlauben oder ablehnen; danach geht es in der Chat-App weiter */
  import { netMessage } from "../neterror";
  import { t } from "../i18n/index.svelte";
  import { cloud, hasAccount } from "../cloud/cloud.svelte";
  import { answerConsent, closeConsent, consent } from "../connector/app.svelte";
  import Modal from "./Modal.svelte";

  const info = consent.info!;
  const expired = info.until < Date.now();
  let busy = $state(false), err = $state(""), leaving = $state(false);

  async function answer(allow: boolean) {
    busy = true; err = "";
    try { const to = await answerConsent(allow); leaving = true; location.href = to; }
    catch (e) { err = netMessage(e); } finally { busy = false; }
  }
</script>

<Modal title={t("oauth.title")} onclose={closeConsent}>
  <div class="mcp oauth">
    <div class="oauth-who">
      <span class="oauth-logo" aria-hidden="true">{info.client.slice(0, 1).toUpperCase()}</span>
      <div><b>{t("oauth.wants", { client: info.client })}</b><small class="muted">{t("oauth.back", { host: info.host })}</small></div>
    </div>
    {#if expired}
      <p class="warnline">{t("oauth.expired")}</p>
      <button class="btn" onclick={closeConsent}>{t("close")}</button>
    {:else if !hasAccount()}
      <p>{t("oauth.loginFirst")}</p>
      <button class="btn primary oauth-login" onclick={() => (cloud.showLogin = true)}>{t("acct.login")}</button>
    {:else if leaving}
      <p>{t("oauth.leaving", { client: info.client })}</p>
    {:else}
      <p class="small">{t("oauth.can")}</p>
      <ul class="oauth-list small">
        <li>{t("oauth.canSearch")}</li>
        <li>{t("oauth.canPeople")}</li>
        <li>{t("oauth.canTrips")}</li>
        <li class="muted">{t("oauth.cannot")}</li>
      </ul>
      <p class="muted small">{t("oauth.as", { name: cloud.user?.name || cloud.user?.email || "" })} {t("oauth.revoke")}</p>
      {#if err}<p class="warnline">{err}</p>{/if}
      <div class="oauth-btns">
        <button class="btn oauth-deny" onclick={() => answer(false)} disabled={busy}>{t("oauth.deny")}</button>
        <button class="btn primary oauth-allow" onclick={() => answer(true)} disabled={busy}>{t("oauth.allow")}</button>
      </div>
    {/if}
  </div>
</Modal>
