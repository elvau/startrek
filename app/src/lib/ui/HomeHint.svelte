<script lang="ts">
  /* Ohne Wohnort (über den Abflughäfen): woher die vorgeschlagenen Abflughäfen kommen (Verbindung, Land oder Standardliste), Wohnort für die Anfahrt (#163: je Land) */
  import { t } from "../i18n/index.svelte";
  import { homeGuess } from "../flights/app";
  import { countryName } from "../geo/locations";
  import { geo } from "../geo/geo.svelte";
  import { resolveHome, type Home } from "../home";
  import HomeInput from "./HomeInput.svelte";

  let { setHome, saved, guessed = false }: { setHome: (h: Home) => unknown; saved?: { plz: string; cc?: string }; guessed?: boolean } = $props();
  const g = $derived(homeGuess(4));
  const text = $derived(g?.how === "ip" ? (g.city ? t("fs.homeIp", { city: g.city }) : t("fs.homeIpNear"))
    : g?.how === "country" && g.cc ? t("fs.homeCountry", { country: countryName(g.cc) }) : t("fs.homeDefault"));
  async function useSaved() {
    if (!saved) return;
    const cc = saved.cc || "DE";
    const h = await resolveHome(cc, saved.plz, (geo.world.find(w => w.k === cc)?.cities || []).map(c => [c[0], c[1], c[2]] as [string, number, number]));
    if (h) setHome(h);
  }
</script>

<div class="fs-home fs-nohome">
  <p class="fs-home-t"><span aria-hidden="true">📍</span> {text}{#if guessed} <span class="fs-home-pick">{t("fs.homePick")}</span>{/if}</p>
  <div class="fs-home-row">
    <HomeInput cls="f fs-homein" label={t("fs.homePlz")} value={{ cc: g?.cc && g.cc.length === 2 ? g.cc : undefined }} onpick={setHome} />
    {#if saved}<button type="button" class="btn sm fs-useplz" onclick={useSaved}>{t("fs.usePlz")}</button>{/if}
  </div>
</div>

<style>
  .fs-home { display: flex; flex-direction: column; gap: 8px; margin: 6px 0 8px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper-2); }
  .fs-home-t { margin: 0; font-size: 13px; color: var(--ink-2); }
  .fs-home-row { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: flex-end; }
  .fs-useplz { background: var(--paper); color: var(--ink); border-color: var(--line); }
</style>
