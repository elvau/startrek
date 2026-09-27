<script lang="ts">
  import { changeRole, cloud, cloudTrip, inviteLink, kick, makeInvite, revokeInvite, type Role } from "../cloud/cloud.svelte";
  import Modal from "./Modal.svelte";

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  const t = $derived(cloudTrip(id));
  const me = $derived(cloud.user?.uid || "");
  const owner = $derived(t?.owner === me);
  let role = $state<"editor" | "viewer">("editor");
  let copied = $state(false);
  let busy = $state(false);
  let err = $state("");
  const link = $derived(t?.invite ? inviteLink(id, t.invite.key, t.invite.role) : "");
  const L: Record<Role, string> = { owner: "Besitzer", editor: "Plant mit", viewer: "Sieht zu" };

  async function run(fn: () => Promise<unknown>) {
    busy = true; err = "";
    try { await fn(); } catch { err = "Das hat nicht geklappt. Bist du online?"; }
    busy = false;
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 2000); }
    catch { copied = false; }
  }
  async function shareNative() {
    try { await navigator.share({ title: t?.name, text: `Plan mit bei „${t?.name}“ in der Reisekasse`, url: link }); } catch {}
  }
</script>

<Modal title="Teilen: {t?.name || 'Reise'}" {onclose}>
  <div class="share-d">
    {#if owner}
      <div class="ed-sec">
        <span class="dlabel">Einladungslink</span>
        {#if t?.invite}
          <div class="linkbox">
            <input readonly value={link} aria-label="Einladungslink" onfocus={e => e.currentTarget.select()} />
            <div class="ed-row">
              <button class="btn primary" onclick={copy}>{copied ? "✓ Kopiert" : "Link kopieren"}</button>
              {#if "share" in navigator}<button class="btn" onclick={shareNative}>Teilen…</button>{/if}
              <button class="linkbtn danger" disabled={busy} onclick={() => run(() => revokeInvite(id))}>Link zurückziehen</button>
            </div>
            <p class="muted small">Wer den Link öffnet und sich anmeldet, {t.invite.role === "viewer" ? "kann die Reise ansehen" : "kann mitplanen"}. Zurückziehen macht den Link ungültig; wer schon dabei ist, bleibt dabei.</p>
          </div>
        {:else}
          <div class="ed-row">
            <label class="f">Eingeladene dürfen
              <select bind:value={role}><option value="editor">mitplanen</option><option value="viewer">nur ansehen</option></select>
            </label>
            <button class="btn primary" disabled={busy} onclick={() => run(() => makeInvite(id, role))}>Link erstellen</button>
          </div>
        {/if}
      </div>
    {/if}
    <div class="ed-sec">
      <span class="dlabel">Mitglieder</span>
      <ul class="members">
        {#each Object.entries(t?.members || {}) as [uid, r] (uid)}
          <li>
            <span class="av sm">{(t?.memberNames[uid] || "?")[0].toUpperCase()}</span>
            <span class="mn">{t?.memberNames[uid] || "Unbekannt"}{uid === me ? " (du)" : ""}</span>
            {#if owner && r !== "owner"}
              <select value={r} aria-label="Rolle" onchange={e => run(() => changeRole(id, uid, e.currentTarget.value as Role))}>
                <option value="editor">Plant mit</option><option value="viewer">Sieht zu</option>
              </select>
              <button class="linkbtn danger" disabled={busy} onclick={() => run(() => kick(id, uid))}>Entfernen</button>
            {:else}
              <span class="muted">{L[r]}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
    {#if err}<p class="err">{err}</p>{/if}
  </div>
</Modal>
