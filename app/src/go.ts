/*
 * Weiterleitung für Anbieter-Links aus dem KI-Konnektor (…/go/?l=…, worker/src/go.ts): Der Such-Dienst prüft die
 * Signatur und zählt den Klick, dann geht es zum Anbieter, mit splitandfly.com als Herkunft wie aus der App.
 * Antwortet er nicht, steht das Ziel zum Antippen da (mit Adresse, keine stille Weiterleitung); bei falscher Signatur nur die App.
 */
const BASE = ((import.meta.env.VITE_FLIGHTS_URL as string | undefined) || "").replace(/\/$/, "");

/** Ziel aus dem Link selbst (ungeprüft, nur zum Anzeigen) */
export function shownTarget(l: string): string {
  try {
    const bytes = Uint8Array.from(atob(l.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const u = JSON.parse(new TextDecoder().decode(bytes))?.u;
    return typeof u === "string" && /^https:\/\/[^\s]+$/.test(u) ? u : "";
  } catch { return ""; }
}

async function go(token: string, box: HTMLElement) {
  if (token && BASE) {
    try {
      const r = await fetch(`${BASE}/go`, { method: "POST", body: token, signal: AbortSignal.timeout(4000) });
      const u = r.ok ? (await r.json())?.u : null;
      if (typeof u === "string" && u.startsWith("https://")) { location.replace(u); return; }
      // Signatur falsch: kein fremdes Ziel anbieten
      if (r.status === 400) token = "";
    } catch { /* unten: Ziel zum Antippen */ }
  }
  const u = shownTarget(token), a = document.createElement("a");
  a.href = u || "../";
  a.rel = "noopener nofollow";
  a.textContent = u ? `${new URL(u).hostname} →` : "Split&Fly →";
  box.replaceChildren(a);
}

const box = typeof document !== "undefined" ? document.getElementById("go") : null;
if (box) void go(new URLSearchParams(location.search).get("l") || "", box);
