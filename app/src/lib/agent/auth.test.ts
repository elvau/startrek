import { beforeEach, describe, expect, it } from "vitest";
import { resetKeys, verifyIdToken } from "./auth";

const b64u = (b: Uint8Array | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : b;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function setup() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  const sign = async (payload: object, kid = "k1") => {
    const h = b64u(JSON.stringify({ alg: "RS256", kid })), p = b64u(JSON.stringify(payload));
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${h}.${p}`)));
    return `${h}.${p}.${b64u(sig)}`;
  };
  let calls = 0;
  const fetchFn = (async () => { calls++; return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "public, max-age=100" } }); }) as unknown as typeof fetch;
  return { sign, fetchFn, calls: () => calls };
}

const NOW = Date.UTC(2027, 0, 1);
const claims = (o: object = {}) => ({ aud: "proj", iss: "https://securetoken.google.com/proj", sub: "u1", iat: NOW / 1000 - 10, exp: NOW / 1000 + 3000, ...o });

describe("Anmeldung im Such-Dienst", () => {
  beforeEach(resetKeys);

  it("gültiges Token ergibt die Nutzer-ID, Schlüssel werden zwischengespeichert", async () => {
    const s = await setup();
    expect(await verifyIdToken(await s.sign(claims()), "proj", s.fetchFn, NOW)).toBe("u1");
    expect(await verifyIdToken(await s.sign(claims({ sub: "u2" })), "proj", s.fetchFn, NOW)).toBe("u2");
    expect(s.calls()).toBe(1);
  });

  it("abgelaufen, falsches Projekt, falsche Signatur, unbekannter Schlüssel", async () => {
    const s = await setup();
    await expect(verifyIdToken(await s.sign(claims({ exp: NOW / 1000 - 1 })), "proj", s.fetchFn, NOW)).rejects.toThrow(/abgelaufen/);
    await expect(verifyIdToken(await s.sign(claims({ aud: "andere" })), "proj", s.fetchFn, NOW)).rejects.toThrow(/Projekt/);
    await expect(verifyIdToken(await s.sign(claims(), "k9"), "proj", s.fetchFn, NOW)).rejects.toThrow(/ungültig/);
    const t = await s.sign(claims());
    const forged = t.split(".").slice(0, 2).join(".") + "." + b64u(new Uint8Array(256));
    await expect(verifyIdToken(forged, "proj", s.fetchFn, NOW)).rejects.toThrow(/ungültig/);
    await expect(verifyIdToken("kein.token", "proj", s.fetchFn, NOW)).rejects.toThrow(/ungültig/);
  });
});
