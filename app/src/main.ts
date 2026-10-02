import { mount } from "svelte";
// Schriften von der eigenen Seite statt von Google (keine IP-Adressen an Google)
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./styles/app.css";
import "./styles/editor.css";
import App from "./App.svelte";
import { i18nReady } from "./lib/i18n/index.svelte";

// gewählte Sprache zuerst laden (Deutsch und Englisch sind schon da), sonst blitzt kurz Englisch auf
await i18nReady();
// Aktionsseite (…/?aktion=ID): eigene, schlanke Seite ohne Reise und ohne Konto
const aktion = new URLSearchParams(location.search).get("aktion");
const target = document.getElementById("app")!;
export default aktion
  ? mount((await import("./lib/ui/CampaignPage.svelte")).default, { target, props: { id: aktion } })
  : mount(App, { target });
