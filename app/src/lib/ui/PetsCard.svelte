<script lang="ts">
  /*
   * Haustiere je Familie (#322): Tierart, kommt mit oder bleibt zuhause. Bleibt es zuhause: wie es betreut wird
   * (vorbeibringen oder jemand kommt vorbei), Posten „Tierbetreuung“ und eine Anfrage zum Teilen (z. B. WhatsApp-Status).
   */
  import { t, type Key } from "../i18n/index.svelte";
  import { access, app } from "../store.svelte";
  import { dir } from "../directory.svelte";
  import { prefsFor } from "../prefs";
  import { hhKey, isActive, PET_KINDS, type PetCare, type PetKind, type Pets } from "../model";
  import { PET_EMOJI, askText, careItem, careOf } from "../pets";
  import { showItem } from "./showItem";

  let open = $state(false);
  let shared = $state("");
  const fams = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const p of app.trip.travelers) if (isActive(p) && !seen.has(hhKey(p))) seen.set(hhKey(p), p.household || p.name);
    return [...seen].map(([key, label]) => ({ key, label }));
  });
  const petsOf = (k: string): Pets | undefined => app.trip.households?.[k]?.pets;
  const any = $derived(fams.some(f => petsOf(f.key)?.kinds.length));
  // laut Vorlieben reist ein Haustier mit, aber in der Reise ist noch keins eingetragen
  const suggest = $derived(!any && !!prefsFor(app.trip, dir).pet);

  function edit(k: string): Pets {
    app.trip.households ||= {};
    const h = (app.trip.households[k] ||= {});
    return (h.pets ||= { kinds: [] });
  }
  function toggleKind(k: string, kind: PetKind) {
    const p = edit(k);
    p.kinds = p.kinds.includes(kind) ? p.kinds.filter(x => x !== kind) : [...p.kinds, kind];
    if (!p.kinds.length) delete app.trip.households![k].pets;
  }
  function setCare(k: string, kind: PetKind, c: PetCare) { const p = edit(k); p.care = { ...(p.care || {}), [kind]: c }; }
  const hasItem = (k: string) => app.trip.items.some(i => i.hint === `pet:${k}` && i.status !== "dropped");
  function addItem(k: string) {
    const p = petsOf(k);
    if (!p) return;
    const it = careItem(app.trip, k, p);
    app.trip.items.push(it);
    showItem(it.id);
  }
  async function ask(k: string) {
    const p = petsOf(k);
    if (!p) return;
    const text = askText(p, app.trip.from, app.trip.to);
    // Teilen-Menü des Handys (WhatsApp-Status, Chat …); sonst WhatsApp im Browser
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { return; } }
    open_(`https://wa.me/?text=${encodeURIComponent(text)}`);
    shared = k;
  }
  const open_ = (url: string) => window.open(url, "_blank", "noopener");
  const summary = (p: Pets) => `${p.kinds.map(k => PET_EMOJI[k]).join("")} ${p.home ? t("pet.home") : t("pet.along")}`;
</script>

{#if !access.readonly && fams.length}
  <div class="pets" class:open>
    <button type="button" class="linkbtn pets-h" class:hl={suggest} aria-expanded={open} onclick={() => (open = !open)}>
      🐾 {t("pet.title")}
      {#each fams as f (f.key)}{@const p = petsOf(f.key)}{#if p?.kinds.length}<span class="pets-sum">{f.label}: {summary(p)}</span>{/if}{/each}
      {#if suggest}<span class="pets-sum">{t("pet.suggest")}</span>{/if}
    </button>
    {#if open}
      <div class="pets-b">
        {#each fams as f (f.key)}
          {@const p = petsOf(f.key)}
          <div class="pet-fam" data-hh={f.key}>
            <b>{f.label}</b>
            <div class="chips">
              {#each PET_KINDS as k (k)}<button type="button" class="chip" class:on={p?.kinds.includes(k)} aria-pressed={!!p?.kinds.includes(k)} onclick={() => toggleKind(f.key, k)}>{PET_EMOJI[k]} {t(`pet.k.${k}` as Key)}</button>{/each}
            </div>
            {#if p?.kinds.length}
              <div class="chips pet-where">
                <button type="button" class="chip" class:on={!p.home} aria-pressed={!p.home} onclick={() => (edit(f.key).home = undefined)}>{t("pet.along")}</button>
                <button type="button" class="chip" class:on={!!p.home} aria-pressed={!!p.home} onclick={() => (edit(f.key).home = true)}>{t("pet.home")}</button>
              </div>
              {#if p.home}
                {#each p.kinds as k (k)}
                  <div class="pet-care">
                    <span>{PET_EMOJI[k]} {t(`pet.k.${k}` as Key)}:</span>
                    <div class="chips">
                      {#each ["bring", "visit"] as const as c (c)}<button type="button" class="chip" class:on={careOf(p, k) === c} aria-pressed={careOf(p, k) === c} onclick={() => setCare(f.key, k, c)}>{t(`pet.care.${c}` as Key)}</button>{/each}
                    </div>
                  </div>
                {/each}
                {#if p.kinds.some(k => careOf(p, k) === "visit")}
                  <div class="pet-care">
                    <span>{t("pet.oftenL")}</span>
                    <div class="chips">
                      {#each ["daily", "few"] as const as o (o)}<button type="button" class="chip" class:on={p.often === o} aria-pressed={p.often === o} onclick={() => { const e = edit(f.key); e.often = e.often === o ? undefined : o; }}>{t(`pet.often.${o}` as Key)}</button>{/each}
                    </div>
                  </div>
                {/if}
                <p class="muted small pet-ask">„{askText(p, app.trip.from, app.trip.to)}“</p>
                <div class="pet-acts">
                  <button type="button" class="btn sm" onclick={() => ask(f.key)}>📣 {t("pet.askBtn")}</button>
                  {#if hasItem(f.key)}<span class="muted small">✓ {t("pet.itemThere")}</span>{:else}<button type="button" class="btn sm" onclick={() => addItem(f.key)}>+ {t("pet.itemBtn")}</button>{/if}
                </div>
                {#if shared === f.key}<p class="muted small">{t("pet.askOpened")}</p>{/if}
              {:else}
                <p class="muted small">{t("pet.alongHint")}</p>
              {/if}
            {/if}
          </div>
        {/each}
        <p class="muted small">{t("pet.privacy")}</p>
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
  .pet-ask{margin:0;font-style:italic}
  .pet-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
</style>
