// Besucherzahlen über Cloudflare Web Analytics: cookielos, ohne IP-Speicherung.
// Gezählt wird nur auf splitandfly.com, nicht auf der Testumgebung, im Emulator oder lokal.
// Der Token ist öffentlich (steht im Seitenquelltext), kein Geheimnis.

export const BEACON_TOKEN = "2949888ec72b404c982ef319cdfafffc";
const PROD_HOSTS = ["splitandfly.com", "www.splitandfly.com"];

export function countVisits(host: string, emulator: boolean): boolean {
  return !emulator && PROD_HOSTS.includes(host);
}

export function loadBeacon(): void {
  if (!countVisits(location.hostname, !!import.meta.env.VITE_FIREBASE_EMULATOR)) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.dataset.cfBeacon = JSON.stringify({ token: BEACON_TOKEN, spa: true });
  document.head.appendChild(s);
}
