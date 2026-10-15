<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import { legalUrl } from "../legal";
  /*
   * Fußzeile für Startseite und Reise: Neues & Ausblick, App installieren (falls möglich), Anmelden, Reiseideen (/reise/), Impressum, Datenschutz, Version.
   * Eigene Fläche, damit sie auf Himmel und Meer (hell wie dunkel) lesbar bleibt.
   */
  import { cloud } from "../cloud/cloud.svelte";
  import { openInfo } from "../info/app.svelte";
  import { canInstall, installApp } from "../install.svelte";

  let { home = false }: { home?: boolean } = $props();
  // Impressum und Datenschutz liegen neben der App (…/startrek/impressum.html)
  const LEGAL = (import.meta.env.BASE_URL as string) || "/";
</script>

<footer class="foot" class:on-home={home}>
  {#if !home}<p class="foot-note">{cloud.user ? t("app.savedCloud") : t("app.savedLocal")}</p>{/if}
  <p class="foot-links">
    <button class="linkbtn foot-info" onclick={() => openInfo()}>✨ {t("info.title")}</button>
    {#if canInstall()}<button class="linkbtn foot-install" onclick={installApp}>📲 {t("install.btn")}</button>{/if}
    {#if cloud.configured && !cloud.user}<button class="linkbtn" onclick={() => (cloud.showLogin = true)}>{t("welcome.haveAccount")}</button>{/if}
  </p>
  <p class="foot-legal"><a href="{LEGAL}reise/">{t("foot.ideas")}</a> · <a href={legalUrl("imprint", LEGAL)}>{t("legal.imprint")}</a> · <a href={legalUrl("privacy", LEGAL)}>{t("legal.privacy")}</a> · <a href={legalUrl("terms", LEGAL)}>{t("legal.terms")}</a> · <a class="app-version" href="https://github.com/elvau/startrek/releases" target="_blank" rel="noopener noreferrer" title={__APP_COMMIT__}>v{__APP_VERSION__}</a></p>
</footer>
