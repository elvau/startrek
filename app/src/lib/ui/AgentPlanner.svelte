<script lang="ts">
  import { arrow, t, tn } from "../i18n/index.svelte";
  /*
   * KI-Planer (Beta): Wunsch in eigenen Worten, Gemini sucht über unsere Flug- und Unterkunftssuche
   * und schlägt 2–3 Reisen vor. Nur für angemeldete Nutzer, begrenzt pro Tag.
   */
  import { app } from "../store.svelte";
  import { cloud } from "../cloud/cloud.svelte";
  import { eur } from "../calc";
  import { dayShort, nights, range, time } from "../format";
  import { flyers } from "../flights/app";
  import Modal from "./Modal.svelte";
  import { agentRequest, askAgent, takeAgentTrip } from "../agent/app";
  import type { AgentTrip } from "../agent/types";

  let { onclose }: { onclose: () => void } = $props();

  const EXAMPLES = ["ai.ex1", "ai.ex2", "ai.ex3"] as const;
  let prompt = $state("");
  let busy = $state(false);
  let error = $state("");
  let trips = $state<AgentTrip[] | null>(null);
  let remaining = $state<number | null>(null);
  let done = $state(false);
  let ctrl: AbortController | undefined;
  const n = Math.max(1, flyers(app.trip).length);

  async function go(e: Event) {
    e.preventDefault();
    error = ""; trips = null; done = false;
    if (prompt.trim().length < 5) { error = t("ai.tooShort"); return; }
    busy = true;
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const res = await askAgent(agentRequest(app.trip, prompt), ctrl.signal);
      trips = res.trips;
      remaining = res.remaining ?? null;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      error = (err as Error).message;
      const r = (err as { remaining?: number }).remaining;
      if (r != null) remaining = r;
    } finally { busy = false; }
  }

  function take(a: AgentTrip) {
    takeAgentTrip(app.trip, a);
    done = true;
    trips = null;
  }

  function login() { cloud.showLogin = true; onclose(); }
</script>

<Modal title={t("ai.title")} onclose={() => { ctrl?.abort(); onclose(); }} wide>
  <p class="muted">{t("ai.lead")}</p>
  {#if !cloud.user}
    <p class="ai-login">{t("ai.needLogin")} <button class="btn sm primary" onclick={login}>{t("ai.login")}</button></p>
  {:else}
    <form class="fs-form ai-form" onsubmit={go}>
      <label class="f">{t("ai.wish")}
        <textarea class="ai-in" rows="3" maxlength="1000" bind:value={prompt} placeholder={t("ai.ph")}></textarea>
      </label>
      <div class="chips ai-ex">
        {#each EXAMPLES as k (k)}<button type="button" class="chip" onclick={() => (prompt = t(k))}>{t(k)}</button>{/each}
      </div>
      <button class="btn primary" disabled={busy}>{busy ? t("ai.busy") : t("ai.go")}</button>
      <p class="muted small">{t("ai.note")}{remaining != null ? ` · ${tn("ai.left", remaining)}` : ""}</p>
      {#if error}<p class="warnline">{error}</p>{/if}
    </form>
  {/if}

  {#if done}<p class="ev-done">✓ {t("ai.taken")}</p>{/if}

  {#if trips}
    {#if !trips.length}<p class="warnline">{t("ai.none")}</p>{/if}
    <div class="ev-list">
      {#each trips as a, i (i)}
        {@const f = a.flight}
        {@const nn = nights(a.from, a.to)}
        <article class="ev-card ai-card">
          <header>
            <b>{a.title}</b>
            <span class="muted small">{a.place}{a.country ? `, ${a.country}` : ""} · {range(a.from, a.to)}{nn ? ` · ${tn("n.nights", nn)}` : ""}</span>
          </header>
          <p class="ev-line ai-sum">{a.summary}</p>
          {#if f}
            <p class="ev-line">✈ {f.out.from} {dayShort(f.out.dep)} {time(f.out.dep)} {arrow()} {f.out.to} {time(f.out.arr)}{#if f.back}{" · "}{t("ev.back")} {dayShort(f.back.dep)} {time(f.back.dep)}{/if}
              <small class="muted">{f.out.carriers.join(" / ")} · {eur(f.price)}</small></p>
          {/if}
          {#if a.stay}
            <p class="ev-line">🛏 {a.stay.name}{a.stay.score ? ` · ${a.stay.score.toFixed(1)}` : ""} <small class="muted">{eur(Math.round(a.stay.total))}{a.stay.place ? ` · ${a.stay.place}` : ""}</small></p>
          {/if}
          <footer>
            <span><b class="num">{eur(a.total)}</b>{#if n > 1} <small class="muted">{t("perPerson", { v: eur(a.total / n) })}</small>{/if}</span>
            <button class="btn sm primary" onclick={() => take(a)}>{t("ev.take")}</button>
          </footer>
        </article>
      {/each}
    </div>
  {/if}
</Modal>
