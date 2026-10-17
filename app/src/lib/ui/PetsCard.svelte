<script lang="ts">
  /*
   * Zuhause während der Reise (#322, #323), je Familie: Haustiere (Art, kommt mit oder bleibt zuhause, Betreuung)
   * und, wenn eingeschaltet, Aufgaben fürs Zuhause (Pflanzen, Garten, Briefkasten …) mit Dankeschön.
   * Versteckt, solange weder ein Haustier bekannt ist noch „Jemand kümmert sich ums Zuhause“ eingeschaltet ist
   * (Reise oder Vorlieben). Daraus: eine Anfrage zum Teilen (WhatsApp-Status, ohne Adresse und Namen) und ein Posten
   * nur für diese Familie.
   */
  import { t, type Key } from "../i18n/index.svelte";
  import { access, app, setDetailed } from "../store.svelte";
  import { dir } from "../directory.svelte";
  import { prefsFor } from "../prefs";
  import { HOME_TASKS, hhKey, isActive, PET_KINDS, type HomeCare, type HomeTask, type PetCare, type PetKind, type Pets } from "../model";
  import { PET_EMOJI, askText, careItem, careKey, careOf, homeCareOn, updateCareItem } from "../pets";
  import { showItem } from "./showItem";

  const TASK_EMOJI: Record<HomeTask, string> = { plants: "🪴", garden: "🌳", mail: "📬", check: "🏠", bins: "🗑", other: "✏️" };
  const THANKS = [20, 50, 100];

  let open = $state(false);
  let shared = $state("");
  const prefs = $derived(prefsFor(app.trip, dir));
  const on = $derived(homeCareOn(app.trip, prefs));
  const fams = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const p of app.trip.travelers) if (isActive(p) && !seen.has(hhKey(p))) seen.set(hhKey(p), p.household || p.name);
    return [...seen].map(([key, label]) => ({ key, label }));
  });
  const petsOf = (k: string): Pets | undefined => app.trip.households?.[k]?.pets;
  const careOfHh = (k: string): HomeCare | undefined => app.trip.households?.[k]?.care;
  const anyPets = $derived(fams.some(f => petsOf(f.key)?.kinds.length));
  // laut Vorlieben reist ein Haustier mit, aber in der Reise ist noch keins eingetragen
  const suggest = $derived(!anyPets && !!prefs.pet);

  function hh(k: string) { app.trip.households ||= {}; return (app.trip.households[k] ||= {}); }
  const editPets = (k: string): Pets => (hh(k).pets ||= { kinds: [] });
  const editCare = (k: string): HomeCare => (hh(k).care ||= { tasks: [] });
  function toggleKind(k: string, kind: PetKind) {
    const p = editPets(k);
    p.kinds = p.kinds.includes(kind) ? p.kinds.filter(x => x !== kind) : [...p.kinds, kind];
    if (!p.kinds.length) delete app.trip.households![k].pets;
  }
  function setCare(k: string, kind: PetKind, c: PetCare) { const p = editPets(k); p.care = { ...(p.care || {}), [kind]: c }; }
  function toggleTask(k: string, task: HomeTask) {
    const c = editCare(k);
    c.tasks = c.tasks.includes(task) ? c.tasks.filter(x => x !== task) : [...c.tasks, task];
  }
  function setOften(k: string, o: NonNullable<HomeCare["often"]>) {
    const c = editCare(k), p = petsOf(k);
    const next = (c.tasks.length ? c.often : p?.often) === o ? undefined : o;
    c.often = next;
    if (p) p.often = next;
  }
  function setThanks(k: string, eur: number | undefined, text?: string) {
    const c = editCare(k);
    const th = { ...(c.thanks || {}) };
    if (eur !== undefined) { if (eur > 0) th.eur = eur; else delete th.eur; }
    if (text !== undefined) { if (text.trim()) th.text = text; else delete th.text; }
    if (Object.keys(th).length) c.thanks = th; else delete c.thanks;
  }
  /** braucht die Familie jemanden: Tiere bleiben zuhause oder Aufgaben fürs Zuhause */
  const needs = (k: string) => (petsOf(k)?.home && !!petsOf(k)?.kinds.length) || (on.home && !!careOfHh(k)?.tasks.length);
  const visitsNeeded = (k: string) => (on.home && !!careOfHh(k)?.tasks.length) || !!(petsOf(k)?.home && petsOf(k)!.kinds.some(x => careOf(petsOf(k)!, x) === "visit"));
  const oftenOf = (k: string) => (careOfHh(k)?.tasks.length ? careOfHh(k)!.often : petsOf(k)?.often);
  const ask = (k: string) => askText(petsOf(k), app.trip.from, app.trip.to, on.home ? careOfHh(k) : undefined);
  const existing = (k: string) => app.trip.items.find(i => i.hint === careKey(k) && i.status !== "dropped");
  function saveItem(k: string) {
    const fresh = careItem(app.trip, k, petsOf(k), on.home ? careOfHh(k) : undefined);
    const it = existing(k);
    if (it) updateCareItem(it, fresh); else { setDetailed("misc", true); app.trip.items.push(fresh); }
    showItem(it?.id || fresh.id);
  }
  async function share(k: string) {
    const text = ask(k);
    // Teilen-Menü des Handys (WhatsApp-Status, Chat …); sonst WhatsApp im Browser
    if (navigator.share) { try { await navigator.share({ text }); } catch {} return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    shared = k;
  }
  const summary = (k: string) => {
    const p = petsOf(k), c = on.home ? careOfHh(k) : undefined;
    return [p?.kinds.length ? `${p.kinds.map(x => PET_EMOJI[x]).join("")} ${p.home ? t("pet.home") : t("pet.along")}` : "", c?.tasks.length ? c.tasks.map(x => TASK_EMOJI[x]).join("") : ""].filter(Boolean).join(" · ");
  };
</script>

{#if !access.readonly && fams.length && on.pets}
  <div class="pets" class:open>
    <button type="button" class="linkbtn pets-h" class:hl={suggest} aria-expanded={open} onclick={() => (open = !open)}>
      {on.home ? `🏠 ${t("home.title")}` : `🐾 ${t("pet.title")}`}
      {#each fams as f (f.key)}{#if summary(f.key)}<span class="pets-sum">{f.label}: {summary(f.key)}</span>{/if}{/each}
      {#if suggest}<span class="pets-sum">{t("pet.suggest")}</span>{/if}
    </button>
    {#if open}
      <div class="pets-b">
        {#each fams as f (f.key)}
          {@const p = petsOf(f.key)}
          {@const c = careOfHh(f.key)}
          <div class="pet-fam" data-hh={f.key}>
            <b>{f.label}</b>
            <span class="muted small">🐾 {t("pet.title")}</span>
            <div class="chips">
              {#each PET_KINDS as k (k)}<button type="button" class="chip" class:on={p?.kinds.includes(k)} aria-pressed={!!p?.kinds.includes(k)} onclick={() => toggleKind(f.key, k)}>{PET_EMOJI[k]} {t(`pet.k.${k}` as Key)}</button>{/each}
            </div>
            {#if p?.kinds.length}
              <div class="chips pet-where">
                <button type="button" class="chip" class:on={!p.home} aria-pressed={!p.home} onclick={() => (editPets(f.key).home = undefined)}>{t("pet.along")}</button>
                <button type="button" class="chip" class:on={!!p.home} aria-pressed={!!p.home} onclick={() => (editPets(f.key).home = true)}>{t("pet.home")}</button>
              </div>
              {#if p.home}
                {#each p.kinds as k (k)}
                  <div class="pet-care">
                    <span>{PET_EMOJI[k]} {t(`pet.k.${k}` as Key)}:</span>
                    <div class="chips">
                      {#each ["bring", "visit"] as const as cc (cc)}<button type="button" class="chip" class:on={careOf(p, k) === cc} aria-pressed={careOf(p, k) === cc} onclick={() => setCare(f.key, k, cc)}>{t(`pet.care.${cc}` as Key)}</button>{/each}
                    </div>
                  </div>
                {/each}
              {:else}
                <p class="muted small">{t("pet.alongHint")}</p>
              {/if}
            {/if}

            {#if on.home}
              <span class="muted small">🏠 {t("home.tasksL")}</span>
              <div class="chips home-tasks">
                {#each HOME_TASKS as k (k)}<button type="button" class="chip" class:on={c?.tasks.includes(k)} aria-pressed={!!c?.tasks.includes(k)} onclick={() => toggleTask(f.key, k)}>{TASK_EMOJI[k]} {t(`home.k.${k}` as Key)}</button>{/each}
              </div>
              {#if c?.tasks.includes("other")}<input class="inp" maxlength="80" aria-label={t("home.k.other")} placeholder={t("home.otherPh")} value={c.other ?? ""} oninput={e => (editCare(f.key).other = e.currentTarget.value || undefined)} />{/if}
            {/if}

            {#if needs(f.key)}
              {#if visitsNeeded(f.key)}
                <div class="pet-care">
                  <span>{t("home.oftenL")}</span>
                  <div class="chips">
                    {#each ["daily", "few", "weekly"] as const as o (o)}<button type="button" class="chip" class:on={oftenOf(f.key) === o} aria-pressed={oftenOf(f.key) === o} onclick={() => setOften(f.key, o)}>{t(`pet.often.${o}` as Key)}</button>{/each}
                  </div>
                </div>
              {/if}
              {#if on.home}
                <div class="pet-care home-thanks">
                  <span>{t("home.thanks")}</span>
                  <div class="chips">
                    <button type="button" class="chip" class:on={!c?.thanks?.eur} aria-pressed={!c?.thanks?.eur} onclick={() => setThanks(f.key, 0)}>{t("home.thanksNone")}</button>
                    {#each THANKS as v (v)}<button type="button" class="chip" class:on={c?.thanks?.eur === v} aria-pressed={c?.thanks?.eur === v} onclick={() => setThanks(f.key, v)}>{v} €</button>{/each}
                    <input class="inp num" type="number" min="0" max="10000" step="5" aria-label={t("home.thanksEur")} placeholder="€" value={c?.thanks?.eur && !THANKS.includes(c.thanks.eur) ? c.thanks.eur : ""} oninput={e => setThanks(f.key, Number(e.currentTarget.value) || 0)} />
                  </div>
                  <input class="inp" maxlength="60" aria-label={t("home.thanksTextPh")} placeholder={t("home.thanksTextPh")} value={c?.thanks?.text ?? ""} oninput={e => setThanks(f.key, undefined, e.currentTarget.value)} />
                </div>
              {/if}
              <p class="muted small pet-ask">„{ask(f.key)}“</p>
              <div class="pet-acts">
                <button type="button" class="btn sm" onclick={() => share(f.key)}>📣 {t("pet.askBtn")}</button>
                {#if existing(f.key)}<button type="button" class="btn sm" onclick={() => saveItem(f.key)}>↻ {t("home.itemUpd")}</button><span class="muted small">✓ {t("home.itemThere")}</span>
                {:else}<button type="button" class="btn sm" onclick={() => saveItem(f.key)}>+ {t("home.itemBtn")}</button>{/if}
              </div>
              {#if shared === f.key}<p class="muted small">{t("pet.askOpened")}</p>{/if}
            {/if}
          </div>
        {/each}
        <p class="muted small">{t("pet.privacy")}{#if on.home} {t("home.safety")}{/if}</p>
      </div>
    {/if}
  </div>
{/if}

<style>
  .pets{margin-top:10px}
  .pets-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;text-align:start}
  .pets-h.hl{color:var(--warn)}
  .pets-sum{font-size:12.5px;color:var(--ink-3);font-weight:500;text-decoration:none}
  .pets-b{display:flex;flex-direction:column;gap:12px;margin-top:8px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--paper-2)}
  .pet-fam{display:flex;flex-direction:column;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--line)}
  .pet-fam:last-of-type{border-bottom:0;padding-bottom:0}
  .pet-care{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13.5px}
  .home-thanks .inp.num{width:84px}
  .home-thanks > .inp{flex:1 1 220px}
  .pet-ask{margin:0;font-style:italic}
  .pet-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
</style>
