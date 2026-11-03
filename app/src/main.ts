import { mount } from "svelte";
// Schriften von der eigenen Seite statt von Google (keine IP-Adressen an Google)
import "@fontsource-variable/figtree";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "./styles/app.css";
import "./styles/editor.css";
import "./styles/mobile.css";
import App from "./App.svelte";
import { i18nReady } from "./lib/i18n/index.svelte";
import { loadBeacon } from "./lib/visits";
import { watchInstall } from "./lib/install.svelte";
import { showDiag, wantsDiag } from "./lib/diag";

// Besucherzahlen (nur splitandfly.com, cookielos)
loadBeacon();

// installierbare App (PWA): Service Worker hält die App für den Start ohne Netz vor (public/sw.js, nur im Build)
watchInstall();
if (import.meta.env.PROD && "serviceWorker" in navigator) void navigator.serviceWorker.register(import.meta.env.BASE_URL + "sw.js").catch(() => {});

const diag = wantsDiag(location.search);

// gewählte Sprache zuerst laden (Deutsch und Englisch sind schon da), sonst blitzt kurz Englisch auf
await i18nReady();
// Aktionsseite (…/?aktion=ID): eigene, schlanke Seite ohne Reise und ohne Konto
const aktion = new URLSearchParams(location.search).get("aktion");
const target = document.getElementById("app")!;
// Text der Startseite für Suchmaschinen und ohne JavaScript (index.html) weicht der App
target.replaceChildren();
// Diagnose für Darstellungsfehler (…/?diag, #612): Kasten mit Messwerten zum Kopieren
if (diag) void import("./lib/diagTrip").then(m => { m.openDiagTrip(); setTimeout(showDiag, 1500); });
export default aktion
  ? mount((await import("./lib/ui/CampaignPage.svelte")).default, { target, props: { id: aktion } })
  : mount(App, { target });
