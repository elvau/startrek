<script lang="ts">
  import { arrow, t, tn, type Key } from "../i18n/index.svelte";
  /*
   * KI-Assistent (Beta) als Chat unten rechts: Wunsch schreiben, nachschärfen („lieber im Juni“, „günstiger“),
   * Vorschläge direkt übernehmen. Frühere Wünsche gehen als Zusammenhang mit, damit Nachfragen funktionieren.
   * Nur für angemeldete Nutzer, begrenzt pro Tag (Such-Dienst).
   */
  import { tick } from "svelte";
  import { app, goHome, startTrip } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { eur } from "../calc";
  import { dayShort, nights, range, time } from "../format";
  import { flyers } from "../flights/app";
  import { agentRequest, askAgent, previewTrip, takeAgentTrip } from "../agent/app";
  import { totals } from "../calc";
  import { syncFood } from "../food";
  import { geo } from "../geo/geo.svelte";
  import { loadGeo } from "../geo/places";
  import { soloTraveler } from "../placeholders";
  import { agentChat, openChat } from "../agent/open.svelte";
  import type { AgentTrip } from "../agent/types";

  /** Nachricht; bei einer Rückfrage der KI mit Antworten zum Antippen */
  interface Msg { me: boolean; text: string; trips?: AgentTrip[]; question?: boolean; options?: string[] }
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
    // letzte Rückfrage der KI dazu, damit die Antwort („aus Köln, Kinder 5 und 8“) verstanden wird
    const q = pendingQuestion();
    const ctx = `${t("ai.ctxBefore")}: ${before.join(" / ")}\n${q ? `${t("ai.ctxQuestion")}: ${q}\n` : ""}${t("ai.ctxNow")}: `;
    return (ctx + text).slice(-1000);
  }
  /** die KI hat zuletzt nachgefragt (dann ist die nächste Nachricht die Antwort) */
  const pendingQuestion = () => { const last = msgs.at(-1); return last && !last.me && last.question ? last.text : ""; };
  /** schon nachgefragt in diesem Gespräch: die KI darf nicht noch einmal fragen */
  const askedBefore = () => msgs.some(m => m.question);
  /** auf der Startseite entsteht beim Übernehmen eine neue Reise: Anfrage ohne die zuletzt offene Reise */
  function base() {
    if (!app.home) return app.trip;
    return { ...app.trip, place: "", country: "", from: undefined, to: undefined, travelers: [soloTraveler()], households: {}, items: [] };
  }

  async function send(text = input) {
    const w = text.trim();
    if (w.length < 5) { msgs.push({ me: false, text: t("ai.tooShort") }); void scrollDown(); return; }
    const prompt = withContext(w);
    const asked = askedBefore();
    msgs.push({ me: true, text: w });
    input = "";
    busy = true;
    void scrollDown();
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const res = await askAgent(agentRequest(base(), prompt, asked), ctrl.signal);
      remaining = res.remaining ?? remaining;
      msgs.push(res.question ? { me: false, text: res.question, question: true, options: res.options || [] }
        : res.trips.length ? { me: false, text: t("ai.here"), trips: res.trips } : { me: false, text: t("ai.none") });
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
    if (geo.world.length) syncFood(app.trip, geo);
    msgs.push({ me: false, text: t("ai.taken") });
    agentChat.open = false;
  }

  /** alle Vorschläge als eigene Reisen anlegen und auf der Startseite vergleichen */
  function takeAll(list: AgentTrip[]) {
    for (const a of list) {
      startTrip();
      takeAgentTrip(app.trip, a);
      if (geo.world.length) syncFood(app.trip, geo);
    }
    goHome();
    msgs.push({ me: false, text: tn("ai.takenAll", list.length) });
    agentChat.open = false;
  }

  // Länderdaten für die Verpflegung im Gesamtpreis der Vorschläge
  $effect(() => { if (agentChat.open) void loadGeo(geo, []); });
  /** Gesamtpreis wie nach dem Übernehmen: Flug mit Anreise, Unterkunft, vor Ort, Erlebnisse, Verpflegung */
  function preview(a: AgentTrip) {
    void geo.world.length;
    const T = totals(previewTrip(base(), a, geo));
    return { total: T.total, access: T.byCat.flights - (a.flight?.price || 0), food: T.byCat.misc, people: T.active };
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
        <div class="ai-msg" class:me={m.me} class:ai-q={m.question}>
          {m.text}
          {#if m.question && m.options?.length && i === msgs.length - 1 && !busy}
            <div class="chips ai-opts">
              {#each m.options as o (o)}<button class="chip" onclick={() => send(o)}>{o}</button>{/each}
            </div>
          {/if}
          {#if m.trips}
            {#each m.trips as a, j (j)}
              {@const f = a.flight}
              {@const nn = nights(a.from, a.to)}
              {@const pn = a.party ? a.party.adults + a.party.childAges.length + a.party.infants : n}
              {@const pv = preview(a)}
              {@const pp = Math.max(1, pv.people || pn)}
              <article class="ai-card">
                <b>{a.title}</b>
                <small class="muted">{a.place}{a.country ? `, ${a.country}` : ""} · {range(a.from, a.to)}{nn ? ` · ${tn("n.nights", nn)}` : ""}</small>
                <span class="ai-sum">{a.summary}</span>
                <ul class="ai-parts">
                  {#if f}<li>✈ {f.out.from} {dayShort(f.out.dep)} {time(f.out.dep)} {arrow()} {f.out.to} · {f.out.carriers.join(" / ")}<b>{eur(f.price)}</b></li>{/if}
                  {#if pv.access > 0.5}<li>🚆 {t("ai.access")}<b>≈ {eur(pv.access)}</b></li>{/if}
                  {#if a.stay}<li>🛏 {a.stay.name}{a.stay.score ? ` · ${a.stay.score.toFixed(1)}` : ""}{(a.stay.board || a.board) ? ` · ${t(`board.${a.stay.board || a.board}` as Key)}` : ""}<b>{eur(Math.round(a.stay.total))}</b></li>{/if}
                  {#if a.transport}<li>🚗 {a.transport.label}<b>≈ {eur(a.transport.eur)}</b></li>{/if}
                  {#if a.extras?.length}<li>🎟 {a.extras.map(x => x.name).join(", ")}<b>≈ {eur(a.extras.reduce((s, x) => s + x.eur, 0))}</b></li>{/if}
                  {#if pv.food > 0.5}<li>🍽 {t("ai.food")}<b>≈ {eur(pv.food)}</b></li>{/if}
                </ul>
                <footer>
                  <span><small class="muted">{t("ai.total")}</small> <b class="num">{eur(pv.total)}</b>{#if pp > 1} <small class="muted">{t("perPerson", { v: eur(pv.total / pp) })}</small>{/if}</span>
                  <button class="btn sm primary" onclick={() => take(a)}>{t("ev.take")}</button>
                </footer>
              </article>
            {/each}
            {#if m.trips.length > 1}<button class="btn sm ai-all" onclick={() => takeAll(m.trips!)}>＋ {tn("ai.takeAll", m.trips.length)}</button>{/if}
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
