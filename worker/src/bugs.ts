/*
 * Fehlermeldungen aus der Beta: Bild in den R2-Speicher (löscht nach 30 Tagen per Regel im Dashboard),
 * Meldung als Issue in ein privates GitHub-Repo. Nur mit Anmeldung, wenige Meldungen pro Tag.
 */
import { verifyAnyIdToken } from "../../app/src/lib/agent/auth";
import { BUG_IMAGE_TYPES, BUG_MAX_IMAGE, bugBody, bugTitle, parseBugReport } from "../../app/src/lib/bugs/types";

export interface BugEnv {
  /** privates Repo für die Meldungen, z. B. „elvau/splitandfly-bugs“ */
  BUG_REPO?: string;
  /** Fine-grained Token nur für Issues in BUG_REPO (Secret) */
  GITHUB_TOKEN?: string;
  /** Meldungen pro Person und Tag (Standard 5) */
  BUG_DAILY?: string;
  /** R2-Speicher für Bildschirmfotos; fehlt er, gehen Meldungen ohne Bild */
  BUG_BUCKET?: R2Bucket;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_TEST_PROJECT_ID?: string;
}

type Json = (body: unknown, status: number, headers: Record<string, string>) => Response;
type Count = (uid: string, kind: string) => Promise<{ used: number; bump: () => Promise<void> }>;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Dateityp an den ersten Bytes erkennen (nicht der Angabe des Browsers trauen) */
export function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function reportBug(req: Request, env: BugEnv, h: Record<string, string>, json: Json, count: Count, f: typeof fetch = fetch): Promise<Response> {
  if (!env.GITHUB_TOKEN || !env.BUG_REPO) return json({ error: "Fehlermeldungen sind noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden" }, 401, h);
  let uid: string;
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "Anfrage ist kein Formular" }, 400, h); }
  let raw: unknown;
  try { raw = JSON.parse(String(form.get("report") || "")); } catch { return json({ error: "Meldung ist kein JSON" }, 400, h); }
  const r = parseBugReport(raw);
  if (typeof r === "string") return json({ error: r }, 400, h);

  const limit = Number(env.BUG_DAILY) || 5;
  const quota = await count(uid, "bug");
  if (quota.used >= limit) return json({ error: `Tageslimit erreicht (${limit} Meldungen)` }, 429, h);

  // Bild: prüfen, unter zufälligem Namen ablegen; der Name ist der einzige Zugang
  let image: string | undefined;
  let imageNote = "";
  const file = form.get("image");
  if (file && typeof file !== "string") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniff(bytes);
    if (bytes.length > BUG_MAX_IMAGE) return json({ error: "Bild ist zu groß" }, 413, h);
    if (!type || !BUG_IMAGE_TYPES.includes(type)) return json({ error: "Nur JPG, PNG oder WebP" }, 415, h);
    if (env.BUG_BUCKET) {
      const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${EXT[type]}`;
      await env.BUG_BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
      image = `${new URL(req.url).origin}/bug-image/${key}`;
    } else imageNote = "\n\n_Ein Bild wurde mitgeschickt, aber der Bildspeicher ist nicht eingerichtet._";
  }

  const res = await f(`https://api.github.com/repos/${env.BUG_REPO}/issues`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "splitandfly-bugs", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    body: JSON.stringify({ title: bugTitle(r), body: bugBody(r, image, `Konto ${uid.slice(0, 8)}…`) + imageNote })
  });
  if (!res.ok) {
    console.log(JSON.stringify({ at: "bug", status: res.status, body: (await res.text()).slice(0, 300) }));
    return json({ error: "Meldung konnte nicht gespeichert werden" }, 502, h);
  }
  await quota.bump();
  const issue = await res.json() as { number?: number };
  return json({ ok: true, number: issue.number, remaining: Math.max(0, limit - quota.used - 1) }, 200, h);
}

/** Bildschirmfoto zu einer Meldung ausliefern (nur mit dem zufälligen Namen aus dem Issue) */
export async function bugImage(path: string, env: BugEnv): Promise<Response> {
  const key = path.replace(/^\/bug-image\//, "");
  if (!env.BUG_BUCKET || !/^\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return new Response("Nicht gefunden", { status: 404 });
  const obj = await env.BUG_BUCKET.get(key);
  if (!obj) return new Response("Nicht gefunden (Bilder werden nach 30 Tagen gelöscht)", { status: 404 });
  return new Response(obj.body, {
    headers: { "content-type": obj.httpMetadata?.contentType || "application/octet-stream", "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" }
  });
}
