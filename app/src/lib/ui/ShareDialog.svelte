<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import Help from "./Help.svelte";
  import { changeRole, cloud, cloudSelf, cloudTrip, cloudVotes, dropClaim, inviteLink, kick, makeInvite, revokeInvite, type Role } from "../cloud/cloud.svelte";
  import { tn } from "../i18n/index.svelte";
  import { memberState } from "../self";
  import { app } from "../store.svelte";
  import Modal from "./Modal.svelte";
  import type { Key } from "../i18n/index.svelte";

  let { id, onclose }: { id: string; onclose: () => void } = $props();
  const ct = $derived(cloudTrip(id));
  const me = $derived(cloud.user?.uid || "");
  const owner = $derived(ct?.owner === me);
  let role = $state<"editor" | "viewer">("editor");
  let copied = $state(false);
  let busy = $state(false);
  let err = $state("");
  const link = $derived(ct?.invite ? inviteLink(id, ct.invite.key, ct.invite.role) : "");
  const L = (r: Role) => t(`share.role.${r}` as Key);
  // „Wer bist du?“ (#435): welche Person der Reise ein Mitglied ist (Name aus der Reise, sonst wie gewählt)
  const isWho = (uid: string) => { const c = ct?.claims[uid]; if (!c) return ""; return (id === app.trip.id ? app.trip.travelers.find(x => x.id === c.t)?.name : "") || c.n; };

  // Stand je Mitglied (#571): Termine, Abstimmungen, Wohnort; nur für die offene Reise
  const here = $derived(id === app.trip.id);
  const stateOf = (u: string) => {
    if (!here || !ct) return null;
    const selfs = cloudSelf.trip === id ? cloudSelf.byUid : {};
    const st = memberState(app.trip, u, selfs, ct.claims, pid => Object.keys(cloudVotes.byUid[u]?.[pid] || {}).length > 0);
    return st.who ? st : null;
  };
  const openList = (st: NonNullable<ReturnType<typeof stateOf>>) =>
    [st.dates === false ? t("self.todoDates") : "", st.polls ? tn("self.todoPolls", st.polls) : "", !st.home ? t("self.todoHome") : ""].filter(Boolean);
  let reminded = $state("");
  async function remind(u: string, list: string[]) {
    const text = t("self.remind", { name: isWho(u) || ct?.memberNames[u] || "", trip: ct?.name || "", list: list.join(", ") });
    try {
      if (typeof navigator.share === "function") await navigator.share({ title: ct?.name, text, ...(link ? { url: link } : {}) });
      else { await navigator.clipboard.writeText(link ? `${text} ${link}` : text); reminded = u; setTimeout(() => (reminded = ""), 2000); }
    } catch { /* abgebrochen */ }
  }

  async function run(fn: () => Promise<unknown>) {
    busy = true; err = "";
    try { await fn(); } catch { err = t("share.failed"); }
    busy = false;
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); copied = true; setTimeout(() => (copied = false), 2000); }
    catch { copied = false; }
  }
  async function shareNative() {
    try { await navigator.share({ title: ct?.name, text: t("share.text", { name: ct?.name || "" }), url: link }); } catch {}
  }
</script>

<Modal title={t("share.title", { name: ct?.name || t("trip") })} {onclose}>
  <div class="share-d">
    {#if owner}
      <div class="ed-sec">
        <span class="dlabel">{t("share.link")}</span>
        {#if ct?.invite}
          <div class="linkbox">
            <input readonly value={link} aria-label={t("share.link")} onfocus={e => e.currentTarget.select()} />
            <div class="ed-row">
              <button class="btn primary" onclick={copy}>{copied ? `✓ ${t("share.copied")}` : t("share.copy")}</button>
              {#if "share" in navigator}<button class="btn" onclick={shareNative}>{t("share.native")}</button>{/if}
              <button class="linkbtn danger" disabled={busy} onclick={() => run(() => revokeInvite(id))}>{t("share.revoke")}</button>
            </div>
            <p class="muted small">{ct.invite.role === "viewer" ? t("share.hintView") : t("share.hintEdit")}</p>
          </div>
        {:else}
          <div class="ed-row">
            <label class="f">{t("share.may")}
              <select bind:value={role}><option value="editor">{t("share.mayEdit")}</option><option value="viewer">{t("role.viewer")}</option></select>
            </label>
            <button class="btn primary" disabled={busy} onclick={() => run(() => makeInvite(id, role))}>{t("share.create")}</button>
          </div>
        {/if}
      </div>
    {/if}
    <div class="ed-sec">
      <span class="dlabel">{t("tm.members")} <Help k="roles" /></span>
      <ul class="members">
        {#each Object.entries(ct?.members || {}) as [uid, r] (uid)}
          <li>
            <span class="av sm">{(ct?.memberNames[uid] || "?")[0].toUpperCase()}</span>
            <span class="mn">{ct?.memberNames[uid] || t("share.unknown")}{uid === me ? ` (${t("share.you")})` : ""}
              {#if isWho(uid)}<small class="muted share-who">= {isWho(uid)}{#if owner && uid !== me} <button class="linkbtn small share-unlink" disabled={busy} onclick={() => run(() => dropClaim(id, uid))}>{t("share.unlink")}</button>{/if}</small>
              {:else if r !== "owner"}<small class="muted share-who">{t("share.noWho")}</small>{/if}
              {#if stateOf(uid)}
                {@const st = stateOf(uid)!}
                {@const list = openList(st)}
                <small class="share-st" class:done={!list.length}>{list.length ? t("self.todo", { list: list.join(" · ") }) : `✓ ${t("self.allDone")}`}
                  {#if list.length && uid !== me}<button class="linkbtn small share-remind" onclick={() => remind(uid, list)}>{reminded === uid ? `✓ ${t("share.copied")}` : t("self.remindBtn")}</button>{/if}</small>
              {/if}</span>
            {#if owner && r !== "owner"}
              <select value={r} aria-label={t("share.roleLabel")} onchange={e => run(() => changeRole(id, uid, e.currentTarget.value as Role))}>
                <option value="editor">{L("editor")}</option><option value="viewer">{L("viewer")}</option>
              </select>
              <button class="linkbtn danger" disabled={busy} onclick={() => run(() => kick(id, uid))}>{t("remove")}</button>
            {:else}
              <span class="muted">{L(r)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
    {#if err}<p class="err">{err}</p>{/if}
  </div>
</Modal>

<style>
  .share-who { display: block; }
  .share-st { display: block; color: var(--warn); }
  .share-st.done { color: var(--good); }
</style>
