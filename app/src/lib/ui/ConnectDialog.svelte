<script lang="ts">
  /* KI-Assistent verbinden (MCP): Chat-Apps per OAuth (Adresse eintragen, verbundene trennen, #590);
     für andere Programme ein persönlicher Schlüssel, einmal angezeigt, dazu ein Beispiel für Claude Code */
  import { netMessage } from "../neterror";
  import { locale, t } from "../i18n/index.svelte";
  import { claudeCommand, connect, createKey, listConnections, MCP_URL, removeConnection, type Connection, type NewKey } from "../connector/app.svelte";
  import Modal from "./Modal.svelte";

  let busy = $state(false), err = $state(""), made = $state<NewKey | null>(null), copied = $state("");
  let conns = $state<Connection[] | null>(null), connErr = $state(""), removing = $state("");

  async function load() {
    connErr = "";
    try { conns = await listConnections(); } catch (e) { connErr = netMessage(e); conns = []; }
  }
  $effect(() => { void load(); });

  async function remove(c: Connection) {
    removing = c.id; connErr = "";
    try { await removeConnection(c.id); conns = (conns || []).filter(x => x.id !== c.id); } catch (e) { connErr = netMessage(e); } finally { removing = ""; }
  }
  const date = (d: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "");

  async function make() {
    busy = true; err = "";
    try { made = await createKey(); } catch (e) { err = netMessage(e); } finally { busy = false; }
  }
  async function copy(what: string, text: string) {
    try { await navigator.clipboard.writeText(text); copied = what; setTimeout(() => (copied = ""), 2000); } catch {}
  }
</script>

<Modal title={t("mcp.title")} onclose={() => (connect.open = false)}>
  <div class="mcp">
    <p>{t("mcp.intro")}</p>
    <h4>{t("oauth.chatTitle")}</h4>
    <p class="small">{t("oauth.chatHow")}</p>
    <label class="f">{t("mcp.url")}
      <span class="mcp-row"><input class="mcp-url" readonly value={MCP_URL} onfocus={e => (e.currentTarget as HTMLInputElement).select()} />
        <button class="btn sm" onclick={() => copy("url", MCP_URL)}>{copied === "url" ? t("mcp.copied") : t("mcp.copy")}</button></span>
    </label>

    <h4>{t("oauth.listTitle")}</h4>
    {#if conns === null}
      <p class="muted small">{t("oauth.loading")}</p>
    {:else if !conns.length && !connErr}
      <p class="muted small oauth-none">{t("oauth.none")}</p>
    {:else}
      <ul class="oauth-conns">
        {#each conns as c (c.id)}
          <li>
            <span class="oauth-logo" aria-hidden="true">{c.client.slice(0, 1).toUpperCase()}</span>
            <span class="oauth-c"><b>{c.client}</b><small class="muted">{c.host} · {t("oauth.since", { date: date(c.at) })} · {t("oauth.used", { date: date(c.used) })}</small></span>
            <button class="btn sm oauth-remove" onclick={() => remove(c)} disabled={removing === c.id}>{t("oauth.remove")}</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if connErr}<p class="warnline small">{connErr}</p>{/if}

    <details class="mcp-keys" open={!!made}>
      <summary>{t("mcp.keyTitle")}</summary>
      <div class="mcp">
        <p class="small">{t("mcp.keyIntro")}</p>
        {#if !made}
          <p class="muted small">{t("mcp.warn")}</p>
          {#if err}<p class="warnline">{err}</p>{/if}
          <button class="btn mcp-make" onclick={make} disabled={busy}>{busy ? t("mcp.making") : t("mcp.create")}</button>
        {:else}
          <label class="f">{t("mcp.key")}
            <span class="mcp-row"><input class="mcp-key" readonly value={made.key} onfocus={e => (e.currentTarget as HTMLInputElement).select()} />
              <button class="btn sm" onclick={() => copy("key", made!.key)}>{copied === "key" ? t("mcp.copied") : t("mcp.copy")}</button></span>
          </label>
          <p class="warnline small">{t("mcp.once")}</p>
          <p class="small">{t("mcp.other")}</p>
          <p class="small"><b>{t("mcp.code")}</b></p>
          <pre class="mcp-cmd">{claudeCommand(made.key)}</pre>
          <button class="btn sm" onclick={() => copy("cmd", claudeCommand(made!.key))}>{copied === "cmd" ? t("mcp.copied") : t("mcp.copyCmd")}</button>
          {#if !made.trips}<p class="muted small">{t("mcp.noTrips")}</p>{/if}
          <p class="muted small">{t("mcp.revoke", { kid: made.kid })}</p>
        {/if}
      </div>
    </details>
  </div>
</Modal>
