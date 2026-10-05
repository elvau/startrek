<script lang="ts">
  /*
   * Eine Leiste oben für Startseite und Reise, immer sichtbar: links Marke (in der Reise zurück zur Startseite) und Reise-Menü,
   * in der Mitte die Kapitel (erst beim Scrollen), rechts überall gleich Gruppen, Vorlieben, Konto, hell/dunkel und Sprache.
   * Auf dem Handy liegen Gruppen, Vorlieben, hell/dunkel und Sprache hinter „⋯“.
   */
  import { t } from "../i18n/index.svelte";
  import LangSelect from "./LangSelect.svelte";
  import CurrencySelect from "./CurrencySelect.svelte";
  import { CHAPTERS } from "../chapters";
  import { view } from "../scroll.svelte";
  import Icon from "./Icon.svelte";
  import TripMenu from "./TripMenu.svelte";
  import Account from "./Account.svelte";
  import GroupsButton from "./GroupsButton.svelte";
  import GroupsDialog from "./GroupsDialog.svelte";
  import PrefsButton from "./PrefsButton.svelte";
  import PrefsDialog from "./PrefsDialog.svelte";
  import ImportantButton from "./ImportantButton.svelte";
  import { access, goHome } from "../store.svelte";
  import { heroEdit } from "./heroEdit.svelte";

  let { home = false }: { home?: boolean } = $props();

  let nav = $state<HTMLElement>();
  let pill = $state({ left: 0, width: 0, show: false });

  $effect(() => {
    const a = nav?.querySelector<HTMLAnchorElement>(`a[data-ch="${view.active}"]`);
    if (!nav || !a) { pill.show = false; return; }
    pill = { left: a.offsetLeft, width: a.offsetWidth, show: true };
    // nur die Leiste seitlich verschieben; scrollIntoView würde auf dem Handy auch die Seite bewegen
    nav.scrollTo({ left: a.offsetLeft - (nav.clientWidth - a.offsetWidth) / 2, behavior: "smooth" });
  });

  function toggleTheme() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("rk-theme", root.dataset.theme); } catch {}
  }

  // „⋯“ auf dem Handy
  let more = $state(false), groups = $state(false), prefs = $state(false);
  let moreEl = $state<HTMLElement>();
  $effect(() => {
    if (!more) return;
    const close = (e: Event) => { if (!moreEl?.contains(e.target as Node)) more = false; };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  });
</script>

<header class="top" class:on-home={home}>
  <div class="top-in">
    {#if home}
      <span class="brand"><img class="brand-ico" src="icon.svg" alt="" width="22" height="22">Split<span class="brand-y">&amp;</span>Fly</span>
    {:else}
      <button class="brand brand-btn" onclick={goHome} aria-label={t("home.back")} title={t("home.back")}><img class="brand-ico" src="icon.svg" alt="" width="22" height="22"><span class="brand-txt">Split<span class="brand-y">&amp;</span>Fly</span></button>
      <TripMenu compact />
      {#if !access.readonly}
        <button class="icon-btn top-edit" class:on={heroEdit.open} onclick={() => { heroEdit.open = !heroEdit.open; if (heroEdit.open) scrollTo({ top: 0, behavior: "smooth" }); }}
          aria-expanded={heroEdit.open} aria-label={heroEdit.open ? t("close") : t("hero.edit")} title={heroEdit.open ? t("close") : t("hero.edit")}><span aria-hidden="true">{heroEdit.open ? "×" : "✎"}</span></button>
      {/if}
    {/if}
    {#if home}
      <span class="top-sp"></span>
    {:else}
      <nav class="nav" class:shown={view.scrolled} bind:this={nav} aria-label={t("nav.chapters")}>
        <span class="pill" style:left="{pill.left}px" style:width="{pill.width}px" style:opacity={pill.show ? 1 : 0}></span>
        {#each CHAPTERS as c (c.k)}
          <a href="#{c.k}" data-ch={c.k} class:on={view.active === c.k} tabindex={view.scrolled ? 0 : -1}><Icon name={c.icon} />{c.label}</a>
        {/each}
      </nav>
    {/if}
    <div class="top-r">
      {#if !home}<ImportantButton />{/if}
      <span class="top-wide"><GroupsButton /></span>
      <span class="top-wide"><PrefsButton /></span>
      <Account compact />
      <button class="tbtn top-wide" onclick={toggleTheme} aria-label={t("nav.theme")} title={t("nav.theme")}><Icon name="moon" size={18} /></button>
      <span class="top-wide"><LangSelect short /></span>
      <span class="top-wide"><CurrencySelect /></span>
      <div class="top-more" bind:this={moreEl}>
        <button class="tbtn" onclick={() => (more = !more)} aria-expanded={more} aria-label={t("nav.more")} title={t("nav.more")}><span aria-hidden="true">⋯</span></button>
        {#if more}
          <div class="tm-pop top-pop" role="menu">
            <button class="tm-act" onclick={() => { more = false; groups = true; }}><Icon name="users" size={16} /> {t("groups.title")}</button>
            <button class="tm-act" onclick={() => { more = false; prefs = true; }}><Icon name="sliders" size={16} /> {t("prefs.title")}</button>
            <button class="tm-act" onclick={toggleTheme}><Icon name="moon" size={16} /> {t("nav.theme")}</button>
            <label class="top-lang"><span>{t("nav.language")}</span><LangSelect short /></label>
            <label class="top-lang"><span>{t("nav.currency")}</span><CurrencySelect /></label>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>
{#if groups}<GroupsDialog onclose={() => (groups = false)} />{/if}
{#if prefs}<PrefsDialog onclose={() => (prefs = false)} />{/if}
