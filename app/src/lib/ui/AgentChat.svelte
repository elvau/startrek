<script lang="ts">
  import { arrow, t, tn } from "../i18n/index.svelte";
  /*
   * KI-Assistent (Beta) als Chat unten rechts: Wunsch schreiben, nachschärfen („lieber im Juni“, „günstiger“),
   * Vorschläge direkt übernehmen. Frühere Wünsche gehen als Zusammenhang mit, damit Nachfragen funktionieren.
   * Nur für angemeldete Nutzer, begrenzt pro Tag (Such-Dienst).
   */
  import { tick } from "svelte";
  import { app, startTrip } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { eur } from "../calc";
  import { dayShort, nights, range, time } from "../format";
  import { flyers } from "../flights/app";
  import { agentRequest, askAgent, takeAgentTrip } from "../agent/app";
  import { agentChat, openChat } from "../agent/open.svelte";
  import type { AgentTrip } from "../agent/types";

  interface Msg { me: boolean; text: string; trips?: AgentTrip[] }
  const EXAMPLES = ["ai.ex1", "ai.ex2", "ai.ex3"] as const;
  let msgs = $state<Msg[]>([]);
  let input = $state("");
  let busy = $state(false);
  let remaining = $state<number | null>(null);
  let list = $state<HTMLElement>();
  let ctrl: AbortController | undefined;

  const scrollDown = async () => { await tick(); list?.scrollTo({ top: list.scrollHeight, behavior: "smooth" }); };

  /** Wunsch mit Zusammenhang: frühere Wünsche dieser Unterhaltung, dann der neue (höchstens 1000 Zeichen) */
  function withContext(text: string): string {
    const before = msgs.filter(m => m.me).map(m => m.text).slice(-3);
    if (!before.length) return text;
    const ctx = `${t("ai.ctxBefore")}: ${before.join(" / ")}\n${t("ai.ctxNow")}: `;
    return (ctx + text).slice(-1000);
  }

  async function send(text = input) {
    const w = text.trim();
    if (w.length < 5) { msgs.push({ me: false, text: t("ai.tooShort") }); void scrollDown(); return; }
    const prompt = withContext(w);
    msgs.push({ me: true, text: w });
    input = "";
    busy = true;
    void scrollDown();
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const res = await askAgent(agentRequest(app.trip, prompt), ctrl.signal);
      remaining = res.remaining ?? remaining;
      msgs.push(res.trips.length ? { me: false, text: t("ai.here"), trips: res.trips } : { me: false, text: t("ai.none") });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const r = (err as { remaining?: number }).remaining;
      if (r != null) remaining = r;
      msgs.push({ me: false, text: (err as Error).message });
    } finally { busy = false; void scrollDown(); }
  }

  function take(a: AgentTrip) {
    // von der Startseite aus: neue Reise anlegen, sonst in die offene Reise
    if (app.home) startTrip();
    takeAgentTrip(app.trip, a);
    msgs.push({ me: false, text: t("ai.taken") });
    agentChat.open = false;
  }

  function key(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) void send(); }
  }

  const n = $derived(Math.max(1, flyers(app.trip).length));
</script>

{#if !agentChat.open}
  <button class="ai-fab" onclick={openChat} aria-label={t("ai.open")} title={t("ai.open")}>
    <span aria-hidden="true">✨</span><span class="ai-fab-lbl">{t("ai.chat")}</span>
  </button>
{:else}
  <div class="ai-chat" role="dialog" aria-label={t("ai.chat")}>
    <header class="ai-head">
      <b>✨ {t("ai.chat")} <small class="muted">Beta</small></b>
      <button class="x" onclick={() => { ctrl?.abort(); agentChat.open = false; }} aria-label={t("close")}>×</button>
    </header>

    <div class="ai-msgs" bind:this={list}>
      <p class="ai-msg">{t("ai.hello")}</p>
      {#if !cloud.user}
        <p class="ai-msg ai-login">{t("ai.needLogin")} <button class="btn sm primary" onclick={() => (cloud.showLogin = true)}>{t("ai.login")}</button></p>
      {:else if !msgs.length}
        <div class="chips ai-ex">
          {#each EXAMPLES as k (k)}<button class="chip" onclick={() => send(t(k))}>{t(k)}</button>{/each}
        </div>
      {/if}
      {#each msgs as m, i (i)}
        <div class="ai-msg" class:me={m.me}>
          {m.text}
          {#if m.trips}
            {#each m.trips as a, j (j)}
              {@const f = a.flight}
              {@const nn = nights(a.from, a.to)}
              <article class="ai-card">
                <b>{a.title}</b>
                <small class="muted">{a.place}{a.country ? `, ${a.country}` : ""} · {range(a.from, a.to)}{nn ? ` · ${tn("n.nights", nn)}` : ""}</small>
                <span class="ai-sum">{a.summary}</span>
                {#if f}<small>✈ {f.out.from} {dayShort(f.out.dep)} {time(f.out.dep)} {arrow()} {f.out.to} · {f.out.carriers.join(" / ")} · {eur(f.price)}</small>{/if}
                {#if a.stay}<small>🛏 {a.stay.name}{a.stay.score ? ` · ${a.stay.score.toFixed(1)}` : ""} · {eur(Math.round(a.stay.total))}</small>{/if}
                <footer>
                  <span><b class="num">{eur(a.total)}</b>{#if n > 1} <small class="muted">{t("perPerson", { v: eur(a.total / n) })}</small>{/if}</span>
                  <button class="btn sm primary" onclick={() => take(a)}>{t("ev.take")}</button>
                </footer>
              </article>
            {/each}
            <small class="muted">{t("ai.refine")}</small>
          {/if}
        </div>
      {/each}
      {#if busy}<p class="ai-msg ai-busy">{t("ai.busy")}</p>{/if}
    </div>

    {#if cloud.user}
      <form class="ai-bar" onsubmit={e => { e.preventDefault(); if (!busy) void send(); }}>
        <textarea rows="2" maxlength="600" bind:value={input} onkeydown={key} placeholder={t("ai.ph")} aria-label={t("ai.wish")}></textarea>
        <button class="btn primary" disabled={busy || !input.trim()}>{t("ai.send")}</button>
      </form>
      <p class="ai-foot muted">{t("ai.note")}{remaining != null ? ` · ${tn("ai.left", remaining)}` : ""}</p>
    {/if}
  </div>
{/if}
