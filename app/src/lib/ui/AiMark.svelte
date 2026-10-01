<script lang="ts">
  /* Marke unserer KI: „&✈KI“ (je Sprache KI, AI, IA, ИИ); zugleich Kennzeichen für alles, was die KI angelegt hat */
  import { t } from "../i18n/index.svelte";
  let { title = "" }: { title?: string } = $props();
</script>

<span class="aim" dir="ltr" title={title || undefined} aria-label={title || t("ai.chat")}><span class="aim-amp">&amp;</span><span class="aim-pl">✈&#xFE0E;</span><span class="aim-ai">{t("ai.brand")}</span></span>
