/*
 * Schlüssel für den KI-Konnektor: signiert statt gespeichert. Der Schlüssel enthält Kontokennung, Schlüsselkennung
 * und Anzeigename, dazu eine Signatur (HMAC-SHA-256) mit MCP_KEY_SECRET. Sperren: Schlüsselkennung in MCP_REVOKED
 * eintragen; neues Secret macht alle Schlüssel ungültig.
 */

export interface KeyEnv {
  /** Secret zum Signieren der Schlüssel; fehlt es, ist der Konnektor aus */
  MCP_KEY_SECRET?: string;
  /** gesperrte Schlüsselkennungen, kommagetrennt */
  MCP_REVOKED?: string;
}

export interface KeyInfo { uid: string; kid: string; name: string; at: string }

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

export function newKid(): string {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return b64url(a);
}

export async function issueKey(secret: string, info: KeyInfo): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ u: info.uid, k: info.kid, n: info.name.slice(0, 60), t: info.at })));
  return `sf_${body}.${b64url(await hmac(secret, body))}`;
}

/** Signatur in konstanter Zeit vergleichen */
async function signedBy(secret: string, data: string, sig: string): Promise<boolean> {
  let given: Uint8Array;
  try { given = fromB64url(sig); } catch { return false; }
  const want = await hmac(secret, data);
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ given[i];
  return !diff;
}

/** beliebige Angaben signiert verpacken (OAuth, oauth.ts); die Art geht mit in die Signatur, damit eine Sorte nicht als andere gilt */
export async function seal(secret: string, kind: string, data: object): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(data)));
  return `${body}.${b64url(await hmac(secret, `${kind}.${body}`))}`;
}

/** Gegenstück zu seal: Angaben bei gültiger Signatur, sonst null */
export async function unseal<T = Record<string, unknown>>(secret: string, kind: string, token: string, max = 2000): Promise<T | null> {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined || body.length > max) return null;
  if (!(await signedBy(secret, `${kind}.${body}`, sig))) return null;
  try { const v = JSON.parse(new TextDecoder().decode(fromB64url(body))); return v && typeof v === "object" ? v as T : null; } catch { return null; }
}

export const isRevoked = (env: KeyEnv, kid: string) => (env.MCP_REVOKED || "").split(",").map(s => s.trim()).filter(Boolean).includes(kid);

/** Schlüssel prüfen: Signatur in konstanter Zeit, nicht gesperrt; sonst null */
export async function verifyKey(env: KeyEnv, key: string): Promise<KeyInfo | null> {
  if (!env.MCP_KEY_SECRET || !key.startsWith("sf_")) return null;
  const [body, sig] = key.slice(3).split(".");
  if (!body || !sig || body.length > 400) return null;
  if (!(await signedBy(env.MCP_KEY_SECRET, body, sig))) return null;
  let p: { u?: unknown; k?: unknown; n?: unknown; t?: unknown };
  try { p = JSON.parse(new TextDecoder().decode(fromB64url(body))); } catch { return null; }
  if (typeof p.u !== "string" || typeof p.k !== "string") return null;
  if (isRevoked(env, p.k)) return null;
  return { uid: p.u, kid: p.k, name: typeof p.n === "string" ? p.n : "", at: typeof p.t === "string" ? p.t : "" };
}
