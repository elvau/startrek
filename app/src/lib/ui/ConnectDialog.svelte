<script lang="ts">
  /* Mit Claude verbinden: Schlüssel erzeugen und einmal anzeigen, dazu der Befehl für Claude Code */
  import { t } from "../i18n/index.svelte";
  import { claudeCommand, connect, createKey, type NewKey } from "../connector/app.svelte";
  import Modal from "./Modal.svelte";

  let busy = $state(false), err = $state(""), made = $state<NewKey | null>(null), copied = $state("");

  async function make() {
    busy = true; err = "";
    try { made = await createKey(); } catch (e) { err = (e as Error).message; } finally { busy = false; }
  }
  async function copy(what: string, text: string) {
    try { await navigator.clipboard.writeText(text); copied = what; setTimeout(() => (copied = ""), 2000); } catch {}
  }
</script>

<Modal title={t("mcp.title")} onclose={() => (connect.open = false)}>
  <div class="mcp">
    <p>{t("mcp.intro")}</p>
    {#if !made}
      <p class="muted small">{t("mcp.warn")}</p>
      {#if err}<p class="warnline">{err}</p>{/if}
      <button class="btn primary mcp-make" onclick={make} disabled={busy}>{busy ? t("mcp.making") : t("mcp.create")}</button>
    {:else}
      <label class="f">{t("mcp.key")}
        <span class="mcp-row"><input class="mcp-key" readonly value={made.key} onfocus={e => (e.currentTarget as HTMLInputElement).select()} />
          <button class="btn sm" onclick={() => copy("key", made!.key)}>{copied === "key" ? t("mcp.copied") : t("mcp.copy")}</button></span>
      </label>
      <p class="warnline small">{t("mcp.once")}</p>
      <p class="small"><b>{t("mcp.code")}</b></p>
      <pre class="mcp-cmd">{claudeCommand(made.key)}</pre>
      <button class="btn sm" onclick={() => copy("cmd", claudeCommand(made!.key))}>{copied === "cmd" ? t("mcp.copied") : t("mcp.copyCmd")}</button>
      {#if !made.trips}<p class="muted small">{t("mcp.noTrips")}</p>{/if}
      <p class="muted small">{t("mcp.app")}</p>
      <p class="muted small">{t("mcp.revoke", { kid: made.kid })}</p>
    {/if}
  </div>
</Modal>
