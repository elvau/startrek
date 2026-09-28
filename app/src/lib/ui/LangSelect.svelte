<script lang="ts">
  /* Sprache wählen: kurz (DE, EN …) in der Kopfzeile, mit Namen oben in der Reise */
  import { available, i18n, setLang, t, type Lang } from "../i18n/index.svelte";
  let { short = false }: { short?: boolean } = $props();
</script>

<select class="lang-sel" class:long={!short} value={i18n.lang} onchange={e => setLang(e.currentTarget.value as Lang)} aria-label={t("nav.language")} title={t("nav.language")}>
  {#each available() as l (l.code)}<option value={l.code}>{short ? l.code.toUpperCase() : l.name}</option>{/each}
</select>
