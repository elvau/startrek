<script lang="ts">
  import { t } from "../i18n/index.svelte";
  /* Oben rechts: Vorlieben (eigene und je Gruppe) */
  import Icon from "./Icon.svelte";
  import PrefsDialog from "./PrefsDialog.svelte";
  let open = $state(false);
</script>

<button class="icon-btn prefs-btn" onclick={() => (open = true)} aria-label={t("prefs.title")} title={t("prefs.title")}><Icon name="sliders" size={18} /></button>
{#if open}<PrefsDialog onclose={() => (open = false)} />{/if}
