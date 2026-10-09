/*
 * Anmeldung im Such-Dienst prüfen: die App schickt das Firebase-ID-Token des Nutzers mit.
 * Geprüft werden Signatur (öffentliche Schlüssel von Google), Projekt, Aussteller und Ablaufzeit.
 */
export const FIREBASE_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

type Jwk = JsonWebKey & { kid?: string };
let cached: { keys: Jwk[]; until: number } | null = null;

async function keys(fetchFn: typeof fetch, now: number): Promise<Jwk[]> {
  if (cached && cached.until > now) return cached.keys;
  const res = await fetchFn(FIREBASE_JWKS);
  if (!res.ok) throw new Error("Schlüssel für die Anmeldung nicht erreichbar");
  const age = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  cached = { keys: ((await res.json()) as { keys: Jwk[] }).keys, until: now + age * 1000 };
  return cached.keys;
}

const b64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};
const part = (s: string) => JSON.parse(new TextDecoder().decode(b64(s)));

/** gibt die Nutzer-ID zurück oder wirft einen Fehler */
export async function verifyIdToken(token: string, projectId: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<string> {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) throw new Error("Anmeldung ungültig");
  const head = part(h), body = part(p);
  if (head.alg !== "RS256") throw new Error("Anmeldung ungültig");
  const t = Math.floor(now / 1000);
  if (body.aud !== projectId || body.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("Anmeldung gehört zu einem anderen Projekt");
  if (typeof body.exp !== "number" || body.exp < t) throw new Error("Anmeldung abgelaufen, bitte neu laden");
  if (typeof body.iat !== "number" || body.iat > t + 300) throw new Error("Anmeldung ungültig");
  if (typeof body.sub !== "string" || !body.sub) throw new Error("Anmeldung ungültig");
  const jwk = (await keys(fetchFn, now)).find(k => k.kid === head.kid);
  if (!jwk) throw new Error("Anmeldung ungültig");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) throw new Error("Anmeldung ungültig");
  return body.sub;
}

/**
 * Anmeldung aus dem Hauptprojekt (splitandfly.com) oder, falls angegeben, aus dem Testprojekt (Testumgebung).
 * Konten aus dem Testprojekt bekommen die Kennung „test:…“, damit sie sich nie mit echten Konten mischen
 * (Zähler, Admin-Liste, Fehlerberichte).
 */
export async function verifyAnyIdToken(token: string, main: string, test?: string, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<string> {
  try { return await verifyIdToken(token, main, fetchFn, now); }
  catch (e) {
    if (!test || test === main || !/anderen Projekt/.test((e as Error).message)) throw e;
    return `test:${await verifyIdToken(token, test, fetchFn, now)}`;
  }
}

/**
 * Nur bestätigte E-Mail-Adressen (KI-Planer, Fehlermeldungen, Konnektor): Google und der Anmelde-Link bestätigen sie
 * immer; ohne Bestätigung ließen sich über die REST-Schnittstelle beliebig viele Konten anlegen. Erst nach verify… aufrufen.
 */
export function requireVerified(token: string) {
  const p = token.split(".")[1];
  if (!p || part(p).email_verified !== true) throw new Error("Bitte zuerst die E-Mail-Adresse bestätigen (Anmeldung mit Google oder per Link)");
}

/** nur für Tests: Schlüssel-Zwischenspeicher leeren */
export const resetKeys = () => { cached = null; };
