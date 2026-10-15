/*
 * „App installieren“ (PWA): Chrome, Edge und Android melden mit beforeinstallprompt, dass sie installieren können; der Knopf
 * öffnet dann deren eigenes Fenster. Safari auf iPhone und iPad kennt das nicht: dort zeigt der Knopf eine kurze Anleitung
 * (Teilen → Zum Home-Bildschirm). Schon installiert (eigenes Fenster ohne Browserleiste) gibt es keinen Knopf.
 */
type PromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export const install = $state<{ prompt: PromptEvent | null; installed: boolean; ios: boolean; help: boolean }>({
  prompt: null, installed: false, ios: false, help: false
});

/** iPhone/iPad im Safari-Modus; iPadOS gibt sich als Mac aus, verrät sich aber über den Touchscreen */
export function isIos(ua: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

export const canInstall = () => !install.installed && (!!install.prompt || install.ios);

export async function installApp() {
  const p = install.prompt;
  if (!p) { install.help = true; return; }
  install.prompt = null;  // jedes Ereignis lässt sich nur einmal zeigen; nach „Abbrechen“ meldet der Browser sich neu
  await p.prompt();
  if ((await p.userChoice).outcome === "accepted") install.installed = true;
}

/** früh aufrufen (main.ts): beforeinstallprompt kommt oft, bevor die Oberfläche steht */
export function watchInstall() {
  install.installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  install.ios = isIos(navigator.userAgent, navigator.maxTouchPoints);
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); install.prompt = e as PromptEvent; });
  addEventListener("appinstalled", () => { install.installed = true; install.prompt = null; });
}
