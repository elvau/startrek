<script lang="ts">
  import { t } from "../i18n/index.svelte";
  import LangSelect from "./LangSelect.svelte";
  import { CHAPTERS } from "../chapters";
  import { view } from "../scroll.svelte";
  import Icon from "./Icon.svelte";
  import TripMenu from "./TripMenu.svelte";
  import Account from "./Account.svelte";
  import GroupsButton from "./GroupsButton.svelte";
  import { goHome } from "../store.svelte";

  let nav: HTMLElement;
  let pill = $state({ left: 0, width: 0, show: false });

  $effect(() => {
    const a = nav?.querySelector<HTMLAnchorElement>(`a[data-ch="${view.active}"]`);
    if (!a) { pill.show = false; return; }
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
</script>

<header class="top">
  <div class="top-in">
    <button class="brand brand-btn" onclick={goHome} title={t("home.back")}><img class="brand-ico" src="icon.svg" alt="" width="22" height="22">Split<span class="brand-y">&amp;</span>Fly</button>
    <TripMenu compact />
    <nav class="nav" bind:this={nav} aria-label={t("nav.chapters")}>
      <span class="pill" style:left="{pill.left}px" style:width="{pill.width}px" style:opacity={pill.show ? 1 : 0}></span>
      {#each CHAPTERS as c (c.k)}
        <a href="#{c.k}" data-ch={c.k} class:on={view.active === c.k}><Icon name={c.icon} />{c.label}</a>
      {/each}
    </nav>
    <GroupsButton />
    <Account compact />
    <button class="tbtn" onclick={toggleTheme} aria-label={t("nav.theme")}><Icon name="moon" size={18} /></button>
    <LangSelect short />
  </div>
</header>
