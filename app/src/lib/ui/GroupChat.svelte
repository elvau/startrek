<script lang="ts">
  /*
   * Gruppenchat einer geteilten Reise: Knopf über dem KI-Assistenten, Fenster an derselben Stelle (immer nur eines
   * offen). Text, Emojis und Bilder; keine Videos, keine Sprachnachrichten. Schreiben alle Mitglieder, auch „nur
   * ansehen“ und Gäste; löschen kann man eigene Nachrichten, der Besitzer alle. Gelesen bis: je Reise auf dem Gerät.
   */
  import { tick } from "svelte";
  import { i18n, t } from "../i18n/index.svelte";
  import { app } from "../store.svelte";
  import { chatImage, cloud, cloudChat, cloudTrip, postChat, removeChat } from "../cloud/cloud.svelte";
  import { canDelete, chatRows, dayOf, isImageFile, linkParts, MAX_TEXT, QUICK_EMOJI, unreadCount, type ChatMsg } from "../chat";
  import { shrinkImage } from "../chatImage";
  import { travelerOf } from "../claims";
  import { agentChat, groupChat } from "../agent/open.svelte";

  const id = $derived(app.trip.id);
  const ct = $derived(cloudTrip(id));
  const me = $derived(cloud.user?.uid || "");
  /** nur in geteilten Reisen mit mindestens zwei Mitgliedern */
  const show = $derived(!app.home && !!ct && !!me && Object.keys(ct.members || {}).length > 1);
  const owner = $derived(!!ct && ct.owner === me);
  const myName = $derived(travelerOf(app.trip, me, ct?.claims)?.name || ct?.memberNames?.[me] || cloud.user?.name || "?");
  const msgs = $derived(cloudChat.trip === id ? cloudChat.msgs : []);
  const rows = $derived(chatRows(msgs, me));
  const nameOf = (m: ChatMsg) => m.n || ct?.memberNames?.[m.u] || "?";

  /* ---------- gelesen bis (je Reise auf dem Gerät) ---------- */
  const KEY = (x: string) => `rk2-chatread:${x}`;
  let lastRead = $state(0);
  $effect(() => { const x = id; try { lastRead = +(localStorage.getItem(KEY(x)) || 0); } catch { lastRead = 0; } });
  const unread = $derived(unreadCount(msgs, lastRead, me));
  $effect(() => {
    if (!groupChat.open) return;
    const newest = msgs.reduce((a, m) => Math.max(a, m.at ?? 0), 0);
    if (newest > lastRead) { lastRead = newest; try { localStorage.setItem(KEY(id), String(newest)); } catch { /* egal */ } }
  });

  /* ---------- öffnen, scrollen ---------- */
  let list = $state<HTMLElement>();
  let box = $state<HTMLTextAreaElement>();
  function open() { app.editing = null; agentChat.open = false; groupChat.open = true; }
  function close() { groupChat.open = false; emojis = false; }
  let atBottom = true;
  const onScroll = () => { if (list) atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80; };
  async function toEnd(force = false) {
    await tick();
    if (list && (force || atBottom)) list.scrollTop = list.scrollHeight;
  }
  $effect(() => { if (groupChat.open) { void msgs.length; void toEnd(); } });
  $effect(() => { if (groupChat.open) { atBottom = true; void toEnd(true); } });
  $effect(() => { if (!show) groupChat.open = false; });

  /* ---------- schreiben ---------- */
  let text = $state(""), img = $state(""), busy = $state(false), err = $state(""), emojis = $state(false);
  let file = $state<HTMLInputElement>();
  async function pick(f: File | undefined | null) {
    err = "";
    if (!f) return;
    if (!isImageFile(f)) { err = t("gc.onlyImg"); return; }
    busy = true;
    try { img = await shrinkImage(f); } catch { err = t("gc.imgErr"); }
    busy = false;
  }
  function paste(e: ClipboardEvent) {
    const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); void pick(f); }
  }
  function addEmoji(s: string) {
    const el = box;
    const a = el?.selectionStart ?? text.length, b = el?.selectionEnd ?? text.length;
    text = (text.slice(0, a) + s + text.slice(b)).slice(0, MAX_TEXT);
    void tick().then(() => { el?.focus(); el?.setSelectionRange(a + s.length, a + s.length); });
  }
  async function send() {
    if (busy || (!text.trim() && !img)) return;
    busy = true; err = "";
    try {
      await postChat(id, myName, text, img || undefined);
      text = ""; img = ""; emojis = false;
      atBottom = true; void toEnd(true);
    } catch { err = t("gc.sendErr"); }
    busy = false;
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); void send(); }
    if (e.key === "Escape") close();
  }
  async function del(m: ChatMsg) {
    if (!confirm(t("gc.deleteQ"))) return;
    try { await removeChat(id, m); } catch { err = t("gc.sendErr"); }
  }

  /* ---------- Anzeige ---------- */
  const clock = (at?: number) => (at == null ? "…" : new Date(at).toLocaleTimeString(i18n.lang, { hour: "2-digit", minute: "2-digit" }));
  function dayLabel(day: string) {
    const today = dayOf(Date.now()), yest = dayOf(Date.now() - 86400000);
    if (day === today) return t("gc.today");
    if (day === yest) return t("gc.yesterday");
    return new Date(`${day}T12:00:00`).toLocaleDateString(i18n.lang, { weekday: "short", day: "numeric", month: "short" });
  }
  let big = $state("");
</script>

{#if show}
  {#if !groupChat.open}
    <button class="gc-fab" class:unread={unread > 0} onclick={open} aria-label={unread ? t("gc.new", { n: unread }) : t("gc.open")} title={t("gc.open")}>
      <span class="gc-ico" aria-hidden="true">💬</span><span class="gc-lbl">{t("gc.fab")}</span>
      {#if unread}<span class="gc-badge" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>{/if}
    </button>
  {:else}
    <div class="ai-chat gc" role="dialog" aria-label={t("gc.title")}>
      <header class="ai-head">
        <b>💬 {t("gc.title")} <small class="muted gc-trip">{ct?.name || app.trip.name}</small></b>
        <button class="x" onclick={close} aria-label={t("close")}>×</button>
      </header>
      <div class="ai-msgs gc-msgs" bind:this={list} onscroll={onScroll} aria-live="polite">
        {#if cloudChat.failed}
          <p class="ai-msg gc-err">{t("gc.loadErr")}</p>
        {:else if !msgs.length}
          <p class="ai-msg">{t("gc.empty")}</p>
        {/if}
        {#each rows as r (r.m.id)}
          {#if r.day}<p class="gc-day"><span>{dayLabel(r.day)}</span></p>{/if}
          <div class="ai-msg gc-msg" class:me={r.mine} data-msg={r.m.id}>
            {#if r.head}<b class="gc-name">{nameOf(r.m)}</b>{/if}
            {#if r.m.img}
              {#await chatImage(id, r.m.id)}
                <span class="gc-imgph" aria-hidden="true">🖼</span>
              {:then src}
                {#if src}<button class="gc-img" onclick={() => (big = src)} aria-label={t("gc.img", { name: nameOf(r.m) })}><img {src} alt="" /></button>{/if}
              {/await}
            {/if}
            {#if r.m.t}<span class="gc-t">{#each linkParts(r.m.t) as p, k (k)}{#if p.href}<a href={p.href} target="_blank" rel="noopener noreferrer nofollow">{p.s}</a>{:else}{p.s}{/if}{/each}</span>{/if}
            <span class="gc-meta">
              <time>{clock(r.m.at)}</time>
              {#if canDelete(r.m, me, owner)}<button class="gc-del" onclick={() => del(r.m)} aria-label={t("gc.delete")} title={t("gc.delete")}>🗑</button>{/if}
            </span>
          </div>
        {/each}
      </div>

      {#if img}
        <div class="gc-pre">
          <img src={img} alt="" />
          <button class="linkbtn" onclick={() => (img = "")}>{t("gc.removeImg")}</button>
        </div>
      {/if}
      {#if emojis}
        <div class="gc-emojis" role="group" aria-label={t("gc.emoji")}>
          {#each QUICK_EMOJI as e (e)}<button type="button" onclick={() => addEmoji(e)}>{e}</button>{/each}
        </div>
      {/if}
      {#if err}<p class="gc-errline small" role="alert">{err}</p>{/if}
      <form class="ai-bar gc-bar" onsubmit={e => { e.preventDefault(); void send(); }}>
        <button type="button" class="gc-tool" onclick={() => (emojis = !emojis)} aria-pressed={emojis} aria-label={t("gc.emoji")} title={t("gc.emoji")}>😊</button>
        <button type="button" class="gc-tool" onclick={() => file?.click()} disabled={busy} aria-label={t("gc.photo")} title={t("gc.photo")}>📷</button>
        <input bind:this={file} class="gc-file" type="file" accept="image/*" onchange={e => { void pick(e.currentTarget.files?.[0]); e.currentTarget.value = ""; }} />
        <textarea bind:this={box} rows="1" maxlength={MAX_TEXT} bind:value={text} onkeydown={key} onpaste={paste} placeholder={t("gc.ph")} aria-label={t("gc.ph")}></textarea>
        <button class="btn primary gc-send" disabled={busy || (!text.trim() && !img)}>{t("gc.send")}</button>
      </form>
      <p class="ai-foot muted">{t("gc.note")}</p>
    </div>
  {/if}
  {#if big}
    <button class="gc-big" onclick={() => (big = "")} aria-label={t("close")}><img src={big} alt="" /></button>
  {/if}
{/if}

<style>
  .gc-trip { font-weight: 500; margin-inline-start: 4px; }
  .gc-msg { gap: 4px; min-width: 0; }
  .gc-name { font-size: 12px; color: var(--a); }
  .gc-t { white-space: pre-wrap; overflow-wrap: anywhere; }
  .gc-msg.me .gc-t a { color: inherit; }
  .gc-meta { display: flex; justify-content: flex-end; align-items: center; gap: 6px; font-size: 11px; opacity: .7; }
  .gc-del { all: unset; cursor: pointer; font-size: 12px; opacity: .55; padding: 0 2px; }
  .gc-del:hover, .gc-del:focus-visible { opacity: 1; }
  /* mit Maus erst beim Darüberfahren, auf dem Handy immer (dezent) */
  @media (hover: hover) { .gc-del { opacity: 0; } .gc-msg:hover .gc-del { opacity: .55; } }
  .gc-img { all: unset; cursor: zoom-in; display: block; }
  .gc-img img { display: block; max-width: 100%; max-height: 260px; border-radius: 10px; }
  .gc-imgph { display: grid; place-items: center; width: 180px; height: 120px; border-radius: 10px; background: var(--line); opacity: .6; }
  .gc-day { align-self: center; margin: 4px 0; font-size: 11.5px; color: var(--ink-3); }
  .gc-day span { padding: 2px 10px; border-radius: 99px; background: var(--paper-2); border: 1px solid var(--line); }
  .gc-err, .gc-errline { color: #C4452E; }
  .gc-errline { margin: 0; padding: 4px 14px 0; }
  .gc-pre { display: flex; align-items: center; gap: 10px; padding: 8px 12px 0; }
  .gc-pre img { max-height: 70px; max-width: 120px; border-radius: 8px; border: 1px solid var(--line); }
  .gc-emojis { display: flex; flex-wrap: wrap; gap: 2px; padding: 8px 10px 0; }
  .gc-emojis button { all: unset; cursor: pointer; font-size: 22px; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 10px; }
  .gc-emojis button:hover, .gc-emojis button:focus-visible { background: var(--paper-2); }
  .gc-bar { align-items: flex-end; }
  .gc-tool { all: unset; cursor: pointer; flex: none; width: 36px; height: 40px; display: grid; place-items: center; font-size: 19px; border-radius: 10px; }
  .gc-tool:hover, .gc-tool:focus-visible, .gc-tool[aria-pressed="true"] { background: var(--paper-2); }
  .gc-tool:disabled { opacity: .4; cursor: default; }
  .gc-file { display: none; }
  .gc-bar textarea { min-height: 40px; max-height: 120px; field-sizing: content; }
  .gc-big { all: unset; position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; background: rgba(0, 0, 0, .82); cursor: zoom-out; }
  .gc-big img { max-width: 94vw; max-height: 90svh; border-radius: 8px; }
</style>
