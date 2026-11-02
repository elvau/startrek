<script lang="ts">
  /*
   * Öffentlicher Benutzername (#650): Vorschlag aus Tiername und Zahl, Prüfung beim Tippen (Regeln, frei oder vergeben),
   * Speichern belegt den Namen im Konto. Hinweis direkt am Feld: der Name ist öffentlich sichtbar.
   */
  import { untrack } from "svelte";
  import { t, type Key } from "../i18n/index.svelte";
  import { cloud, saveUsername, usernameFree } from "../cloud/cloud.svelte";
  import { checkUsername, suggestUsername } from "../account/username";
  import { animalName, nextAnimal } from "../placeholders";

  let { onsaved }: { onsaved?: (name: string) => void } = $props();
  const suggest = () => suggestUsername(animalName(nextAnimal()));
  let value = $state(untrack(() => cloud.username || suggest()));
  let touched = false;
  $effect(() => { const n = cloud.username; if (n) untrack(() => { if (!touched) value = n; }); });
  let st = $state<"idle" | "checking" | "free" | "taken" | "saved" | "error">("idle");
  const problem = $derived(checkUsername(value));
  const mine = $derived(!!cloud.username && cloud.username.toLowerCase() === value.trim().toLowerCase());

  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const v = value;
    clearTimeout(timer);
    if (checkUsername(v) || untrack(() => mine)) { st = "idle"; return; }
    st = "checking";
    timer = setTimeout(() => { void usernameFree(v).then(ok => { if (v === value) st = ok === null ? "idle" : ok ? "free" : "taken"; }); }, 400);
    return () => clearTimeout(timer);
  });
  async function save() {
    if (problem || mine) return;
    st = "checking";
    const r = await saveUsername(value);
    st = r === "ok" ? "saved" : r === "taken" ? "taken" : "error";
    if (r === "ok") onsaved?.(value.trim());
  }
</script>

<div class="un">
  <label class="f un-f">{t("un.label")}
    <span class="un-row">
      <span class="un-at" aria-hidden="true">@</span>
      <input class="un-in" bind:value maxlength="20" autocomplete="nickname" autocapitalize="off" spellcheck="false" oninput={() => (touched = true)} aria-describedby="un-hint" />
      <button type="button" class="btn sm primary un-save" onclick={save} disabled={!!problem || mine || st === "taken" || st === "checking"}>{t("un.save")}</button>
    </span>
  </label>
  <span class="un-st small" aria-live="polite">
    {#if problem}<span class="un-bad">{t(`un.p.${problem}` as Key)}</span>
    {:else if mine || st === "saved"}<span class="un-ok">✓ {t("un.saved")}</span>
    {:else if st === "free"}<span class="un-ok">✓ {t("un.free")}</span>
    {:else if st === "taken"}<span class="un-bad">{t("un.taken")}</span>
    {:else if st === "checking"}<span class="muted">{t("un.checking")}</span>
    {:else if st === "error"}<span class="un-bad">{t("un.err")}</span>{/if}
    {#if !cloud.username}<button type="button" class="linkbtn un-sug" onclick={() => { value = suggest(); touched = true; }}>{t("un.other")}</button>{/if}
  </span>
  <small id="un-hint" class="muted un-hint">🌐 {t("un.public")}</small>
</div>

<style>
  .un { display: grid; gap: 4px; }
  .un-row { display: flex; align-items: center; gap: 6px; }
  .un-at { font-weight: 700; color: var(--ink-2); }
  .un-in { flex: 1; min-width: 0; }
  .un-st { display: flex; gap: 10px; align-items: center; min-height: 18px; }
  .un-ok { color: var(--good); font-weight: 600; }
  .un-bad { color: var(--warn); font-weight: 600; }
  .un-sug { font-size: 13px; padding: 0; }
  .un-hint { line-height: 1.35; }
</style>
