<script lang="ts">
  /* Rückfrage in der App (#665): Text, „Abbrechen“ und Hauptaktion (rot bei Löschen), optional ein Textfeld */
  import { t } from "../i18n/index.svelte";
  import Modal from "./Modal.svelte";
  import { answer, asking } from "./ask.svelte";

  let value = $state("");
  $effect(() => { if (asking.open) value = asking.input ?? ""; });
  const ok = () => answer(asking.input != null ? value.trim() || null : true);
</script>

{#if asking.open}
  <Modal title={asking.title || (asking.info ? t("ask.info") : t("ask.title"))} onclose={() => answer(asking.input != null ? null : false)}>
    <form class="ask" onsubmit={e => { e.preventDefault(); ok(); }}>
      <p class="ask-text">{asking.text}</p>
      {#if asking.input != null}<input class="ask-in" bind:value aria-label={asking.text} />{/if}
      <div class="ask-acts">
        {#if !asking.info}<button type="button" class="btn ask-no" onclick={() => answer(asking.input != null ? null : false)}>{t("cancel")}</button>{/if}
        <button type="submit" class="btn primary ask-yes" class:danger={asking.danger}>{asking.ok || t("ask.ok")}</button>
      </div>
    </form>
  </Modal>
{/if}

<style>
  .ask { display: grid; gap: 14px; }
  .ask-text { margin: 0; white-space: pre-line; line-height: 1.45; }
  .ask-in { min-height: 44px; border-radius: var(--r-m); border: 1px solid var(--line); background: var(--paper-2); color: var(--ink); padding: 0 12px; font: inherit; }
  .ask-acts { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  .ask-acts .btn { min-height: 44px; min-width: 120px; }
  .ask-yes.danger { background: var(--bad); border-color: var(--bad); color: #fff; }
</style>
