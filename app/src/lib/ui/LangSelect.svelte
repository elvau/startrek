<script lang="ts">
  /* Sprache wählen: kurz (DE, EN …) in der Kopfzeile und auf schmalen Bildschirmen, sonst mit Namen */
  import { available, i18n, setLang, t, type Lang } from "../i18n/index.svelte";
  let { short = false }: { short?: boolean } = $props();
  const NARROW = "(max-width:640px)";
  let narrow = $state(typeof matchMedia !== "undefined" && matchMedia(NARROW).matches);
  $effect(() => {
    const m = matchMedia(NARROW), f = () => (narrow = m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  });
  const sh = $derived(short || narrow);
</script>

<select class="lang-sel" class:long={!sh} value={i18n.lang} onchange={e => setLang(e.currentTarget.value as Lang)} aria-label={t("nav.language")} title={t("nav.language")}>
  {#each available() as l (l.code)}<option value={l.code}>{sh ? l.code.toUpperCase() : l.name}</option>{/each}
</select>
