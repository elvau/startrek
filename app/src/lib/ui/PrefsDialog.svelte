<script lang="ts">
  import { t, tn } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  /* Vorlieben: eigene und je Gruppe (belegen Suchen und KI-Planer vor). Getrennt von Gruppen und Personen. */
  import { dir } from "../directory.svelte";
  import Modal from "./Modal.svelte";
  import PrefsEditor from "./PrefsEditor.svelte";

  let { onclose }: { onclose: () => void } = $props();
  dir.prefs ||= {};
  let open = $state<string | null>(null);
  function toggle(id: string) {
    if (open === id) { open = null; return; }
    const g = dir.groups.find(x => x.id === id);
    if (g) g.prefs ||= {};
    open = id;
  }
</script>

<Modal title={t("prefs.title")} {onclose}>
  <div class="prefs-d">
    <div class="ed-sec">
      <span class="dlabel">{t("prefs.mine")} <Help k="prefs" /></span>
      {#if dir.prefs}<PrefsEditor p={dir.prefs} />{/if}
    </div>
    <div class="ed-sec">
      <span class="dlabel">{t("prefs.group")}</span>
      {#each dir.groups as g (g.id)}
        <div class="grp" class:open={open === g.id}>
          <button class="grp-h" onclick={() => toggle(g.id)} aria-expanded={open === g.id}>
            <b>{g.name}</b><span class="muted">{tn("n.persons", g.memberIds.length)}</span>
          </button>
          {#if open === g.id && g.prefs}<div class="grp-b"><PrefsEditor p={g.prefs} base={dir.prefs || {}} /></div>{/if}
        </div>
      {:else}
        <p class="muted small">{t("grp.none")}</p>
      {/each}
    </div>
  </div>
</Modal>
