<script lang="ts">
  /* Ohne Wohnort: woher die vorgeschlagenen Abflughäfen kommen (Verbindung, Land oder Standardliste), PLZ für die Anfahrt */
  import { t } from "../i18n/index.svelte";
  import { homeGuess } from "../flights/app";
  import { countryName } from "../geo/locations";

  let { setPlz, savedPlz, plzErr = false }: { setPlz: (v: string) => unknown; savedPlz?: string; plzErr?: boolean } = $props();
  const g = $derived(homeGuess(4));
  const text = $derived(g?.how === "ip" ? (g.city ? t("fs.homeIp", { city: g.city }) : t("fs.homeIpNear"))
    : g?.how === "country" && g.cc ? t("fs.homeCountry", { country: countryName(g.cc) }) : t("fs.homeDefault"));
  // Postleitzahlen gibt es bisher nur für Deutschland
  const plzOk = $derived(!g?.cc || g.cc === "DE");
</script>

<div class="fs-home fs-nohome">
  <p class="fs-home-t"><span aria-hidden="true">📍</span> {text}</p>
  {#if plzOk}
    <div class="fs-home-row">
      <label class="f">{t("fs.homePlz")}<input class="fs-plz" inputmode="numeric" maxlength="5" placeholder={t("fs.plzPh")} oninput={e => setPlz(e.currentTarget.value)} /></label>
      {#if savedPlz}<button type="button" class="btn sm fs-useplz" onclick={() => setPlz(savedPlz)}>{t("fs.usePlz")}</button>{/if}
    </div>
    {#if plzErr}<small class="err">{t("fs.plzUnknown")}</small>{/if}
  {/if}
</div>

<style>
  .fs-home { display: flex; flex-direction: column; gap: 8px; margin-top: 6px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); }
  .fs-home-t { margin: 0; font-size: 13px; color: var(--ink-2); }
  .fs-home-row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: flex-end; }
  .fs-home .fs-plz { width: 110px; }
  .fs-useplz { background: var(--paper); color: var(--ink); border-color: var(--line); }
</style>
