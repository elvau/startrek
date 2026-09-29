<script lang="ts">
  /* Beta: Fehler melden (🐞 unten links). Beschreibung, optional ein Bild; Umgebung und letzte Fehler gehen automatisch mit. */
  import { t } from "../i18n/index.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { BUG_IMAGE_TYPES } from "../bugs/types";
  import { bugDialog, sendBug, shrink } from "../bugs/app.svelte";
  import Modal from "./Modal.svelte";

  let text = $state("");
  let file = $state<File | null>(null);
  let preview = $state("");
  let busy = $state(false);
  let err = $state("");
  let done = $state<number | null>(null);

  function pick(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0] || null;
    err = "";
    if (f && !BUG_IMAGE_TYPES.includes(f.type)) { err = t("bug.err.type"); return; }
    if (preview) URL.revokeObjectURL(preview);
    file = f;
    preview = f ? URL.createObjectURL(f) : "";
  }
  function drop() { if (preview) URL.revokeObjectURL(preview); file = null; preview = ""; }
  function close() { bugDialog.open = false; if (done != null) { text = ""; drop(); done = null; } err = ""; }

  async function send() {
    if (text.trim().length < 5) { err = t("bug.tooShort"); return; }
    busy = true; err = "";
    try {
      const img = file ? await shrink(file) : null;
      const r = await sendBug(text.trim(), img);
      done = r.number ?? 0;
    } catch (e) { err = (e as Error).message; }
    finally { busy = false; }
  }
</script>

<button class="bug-fab" onclick={() => (bugDialog.open = true)} title={t("bug.open")} aria-label={t("bug.open")}><span aria-hidden="true">🐞</span></button>

{#if bugDialog.open}
  <Modal title={t("bug.title")} onclose={close}>
    <div class="bug">
      {#if done != null}
        <p class="bug-done">✓ {t("bug.thanks")}{done ? ` (#${done})` : ""}</p>
        <button class="btn primary" onclick={close}>{t("close")}</button>
      {:else if !cloud.user}
        <p class="muted">{t("bug.needLogin")}</p>
        <button class="btn primary" onclick={() => { bugDialog.open = false; cloud.showLogin = true; }}>{t("ai.login")}</button>
      {:else}
        <label class="f">{t("bug.what")}
          <textarea rows="5" bind:value={text} maxlength="4000" placeholder={t("bug.ph")}></textarea>
        </label>
        <div class="bug-img">
          {#if preview}
            <img src={preview} alt={t("bug.imgAlt")} />
            <button class="linkbtn danger" onclick={drop}>{t("bug.imgRemove")}</button>
          {:else}
            <label class="btn sm bug-file">📷 {t("bug.img")}<input type="file" accept={BUG_IMAGE_TYPES.join(",")} onchange={pick} hidden /></label>
          {/if}
        </div>
        <p class="muted small">{t("bug.sends")}</p>
        {#if err}<p class="banner err">{err}</p>{/if}
        <div class="bug-acts">
          <button class="btn primary bug-send" disabled={busy} onclick={send}>{busy ? t("bug.sending") : t("bug.send")}</button>
        </div>
      {/if}
    </div>
  </Modal>
{/if}
