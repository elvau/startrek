<script lang="ts">
  /* Oben rechts: gespeicherte Gruppen und Personen */
  import GroupsDialog from "./GroupsDialog.svelte";
  let open = $state(false);
</script>

<button class="icon-btn grp-btn" onclick={() => (open = true)} aria-label="Gruppen und Personen" title="Gruppen und Personen">
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6z" /><circle cx="17" cy="9" r="2.7" /><path d="M15.2 14.3c.6-.2 1.2-.3 1.8-.3 3 0 5.5 2 5.5 5.3v.7h-5.2c0-2.3-.8-4.3-2.1-5.7z" /></svg>
</button>
{#if open}<GroupsDialog onclose={() => (open = false)} />{/if}
