<script lang="ts">
  import { CHAPTERS } from "../chapters";
  import { view } from "../scroll.svelte";
  import Icon from "./Icon.svelte";
  import TripMenu from "./TripMenu.svelte";
  import Account from "./Account.svelte";

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
    <span class="brand">Reisekasse</span>
    <TripMenu compact />
    <nav class="nav" bind:this={nav} aria-label="Kapitel">
      <span class="pill" style:left="{pill.left}px" style:width="{pill.width}px" style:opacity={pill.show ? 1 : 0}></span>
      {#each CHAPTERS as c (c.k)}
        <a href="#{c.k}" data-ch={c.k} class:on={view.active === c.k}><Icon name={c.icon} />{c.label}</a>
      {/each}
    </nav>
    <Account compact />
    <button class="tbtn" onclick={toggleTheme} aria-label="Hell oder dunkel"><Icon name="moon" size={18} /></button>
  </div>
</header>
