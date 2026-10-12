<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  /*
   * Vorlieben (#161): Reiter „Meine“ und je Gruppe (belegen Suchen und KI-Planer vor). Getrennt von Gruppen und Personen.
   * Am Reiter einer Gruppe steht, wie viele Werte sie von meinen abweicht.
   */
  import { dir } from "../directory.svelte";
  import Modal from "./Modal.svelte";
  import PrefsEditor from "./PrefsEditor.svelte";
  import { setupWizard } from "../setup/app.svelte";
  import { diffCount } from "../prefsView";

  let { onclose }: { onclose: () => void } = $props();
  dir.prefs ||= {};
  let tab = $state<string>("me");
  const cur = $derived(tab === "me" ? null : dir.groups.find(g => g.id === tab) || null);
  function show(id: string) {
    const g = dir.groups.find(x => x.id === id);
    if (g) g.prefs ||= {};
    tab = id;
  }
  const ai = () => { onclose(); setupWizard.open = true; };
</script>

<Modal title={t("prefs.title")} {onclose} wide>
  <div class="prefs-d">
    <div class="pv-tabs" role="tablist">
      <button type="button" role="tab" class="pv-tab" class:on={tab === "me"} aria-selected={tab === "me"} onclick={() => (tab = "me")}>👤 {t("prefs.mine")}</button>
      {#each dir.groups as g (g.id)}
        {@const n = g.prefs ? diffCount(g.prefs, dir.prefs || {}) : 0}
        <button type="button" role="tab" class="pv-tab" class:on={tab === g.id} aria-selected={tab === g.id} onclick={() => show(g.id)}>
          👥 {g.name}{#if n}<span class="pv-n">{t("prefs.diffN", { n })}</span>{/if}
        </button>
      {/each}
      <Help k="prefs" />
    </div>
    {#if tab === "me"}
      {#if dir.prefs}{#key "me"}<PrefsEditor p={dir.prefs} onai={ai} />{/key}{/if}
    {:else if cur?.prefs}
      {#key cur.id}<PrefsEditor p={cur.prefs} base={dir.prefs || {}} onai={ai} />{/key}
    {/if}
    {#if !dir.groups.length}<p class="muted small">{t("grp.none")}</p>{/if}
  </div>
</Modal>

<style>
  .pv-tabs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .pv-tab{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--paper-2);border-radius:99px;padding:8px 14px;font-weight:600;font-size:14px;color:var(--ink-2);min-height:40px}
  .pv-tab.on{background:var(--ink);border-color:var(--ink);color:var(--paper)}
  .pv-n{font-size:11.5px;background:var(--warn-soft);color:var(--warn);border-radius:99px;padding:1px 7px}
  .pv-tab.on .pv-n{background:rgba(255,255,255,.22);color:var(--paper)}
</style>
