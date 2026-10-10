<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import { legalUrl } from "../legal";
  /*
   * Fußzeile für Startseite und Reise: Beispielreise, Anmelden, Impressum, Datenschutz, Version.
   * Eigene Fläche, damit sie auf Himmel und Meer (hell wie dunkel) lesbar bleibt.
   */
  import { openSample } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";

  let { home = false }: { home?: boolean } = $props();
  // Impressum und Datenschutz liegen neben der App (…/startrek/impressum.html)
  const LEGAL = (import.meta.env.BASE_URL as string) || "/";
  // aus einer Reise heraus nachfragen, auf der Startseite direkt
  const sample = () => { if (home || confirm(t("sample.confirm"))) openSample(); };
</script>

<footer class="foot" class:on-home={home}>
  {#if !home}<p class="foot-note">{cloud.user ? t("app.savedCloud") : t("app.savedLocal")}</p>{/if}
  <p class="foot-links">
    <button class="linkbtn" onclick={sample}>{t("sample.open")}</button>
    {#if cloud.configured && !cloud.user}<button class="linkbtn" onclick={() => (cloud.showLogin = true)}>{t("welcome.haveAccount")}</button>{/if}
  </p>
  <p class="foot-legal"><a href={legalUrl("imprint", LEGAL)}>{t("legal.imprint")}</a> · <a href={legalUrl("privacy", LEGAL)}>{t("legal.privacy")}</a> · <a class="app-version" href="https://github.com/elvau/startrek/releases" target="_blank" rel="noopener noreferrer" title={__APP_COMMIT__}>v{__APP_VERSION__}</a></p>
</footer>
