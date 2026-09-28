<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import { cloud, loginEmail, loginGoogle, loginTest } from "../cloud/cloud.svelte";
  import { emulator } from "../cloud/config";
  import Modal from "./Modal.svelte";

  let email = $state("");
  let sent = $state(false);
  let busy = $state(false);
  let err = $state("");

  async function sendLink(e: Event) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { err = t("login.badEmail"); return; }
    busy = true; err = "";
    try { await loginEmail(email.trim()); sent = true; }
    catch (x) { err = (x as { code?: string }).code?.includes("operation-not-allowed") ? t("login.emailOff") : t("login.sendFailed"); }
    busy = false;
  }
  async function google() { busy = true; await loginGoogle(); busy = false; }
  let testName = $state("Anna");
  async function test() { busy = true; await loginTest(`${testName.toLowerCase()}@test.de`, testName); busy = false; }
</script>

<Modal title={cloud.join ? t("login.invited") : t("acct.login")} onclose={() => (cloud.showLogin = false)}>
  <div class="login">
    {#if cloud.join}
      <p>{cloud.join.role === "viewer" ? t("login.joinView") : t("login.joinEdit")}</p>
    {:else}
      <p>{t("login.lead")}</p>
    {/if}
    <button class="btn google" onclick={google} disabled={busy}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
      {t("login.google")}
    </button>
    <div class="or"><span>{t("login.orEmail")}</span></div>
    {#if sent}
      <p class="ok">✓ {t("login.sent", { email })}</p>
    {:else}
      <form onsubmit={sendLink} class="ed-row">
        <label class="f grow">{t("login.email")}<input type="email" bind:value={email} placeholder={t("login.emailPh")} autocomplete="email" /></label>
        <button class="btn" disabled={busy}>{t("login.send")}</button>
      </form>
    {/if}
    {#if err || cloud.error}<p class="err">{err || cloud.error}</p>{/if}
    {#if emulator}
      <div class="ed-row test"><label class="f">Test-Anmeldung (nur Emulator)<input bind:value={testName} /></label><button class="btn" onclick={test}>Als {testName} anmelden</button></div>
    {/if}
    <p class="muted small">{t("login.noAccount")}</p>
  </div>
</Modal>
