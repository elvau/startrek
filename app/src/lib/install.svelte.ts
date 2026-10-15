/*
 * „App installieren“ (PWA): Chrome, Edge und Android melden mit beforeinstallprompt, dass sie installieren können; der Knopf
 * öffnet dann deren eigenes Fenster. Ohne dieses Angebot zeigt der Knopf eine kurze Anleitung: auf iPhone und iPad
 * (Teilen → Zum Home-Bildschirm) und auf Android (Menü ⋮ → App installieren). Auf Android bleibt er deshalb immer erreichbar,
 * auch wenn Chrome sein Angebot nach einem Abbruch oder einer gescheiterten Installation nicht wiederholt (#406).
 * Weg ist er erst, wenn die App wirklich installiert ist (appinstalled) oder im eigenen Fenster läuft.
 */
type PromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export const install = $state<{ prompt: PromptEvent | null; installed: boolean; ios: boolean; android: boolean; help: boolean }>({
  prompt: null, installed: false, ios: false, android: false, help: false
});

/** iPhone/iPad im Safari-Modus; iPadOS gibt sich als Mac aus, verrät sich aber über den Touchscreen */
export function isIos(ua: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

export const isAndroid = (ua: string) => /Android/.test(ua);

export const canInstall = () => !install.installed && (!!install.prompt || install.ios || install.android);

export async function installApp() {
  const p = install.prompt;
  if (!p) { install.help = true; return; }
  install.prompt = null;  // jedes Ereignis lässt sich nur einmal zeigen; danach hilft auf Android die Anleitung
  // „accepted“ heißt nur zugestimmt: ob Chrome die App wirklich anlegt, meldet erst appinstalled
  await p.prompt();
}

/** früh aufrufen (main.ts): beforeinstallprompt kommt oft, bevor die Oberfläche steht */
export function watchInstall() {
  install.installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  install.ios = isIos(navigator.userAgent, navigator.maxTouchPoints);
  install.android = isAndroid(navigator.userAgent);
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); install.prompt = e as PromptEvent; });
  addEventListener("appinstalled", () => { install.installed = true; install.prompt = null; });
}
