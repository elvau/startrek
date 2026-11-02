/*
 * Reisekatalog (#652 Teil 2): Preispunkte aus geprüften Übernahmen. Nur mit Anmeldung; je Konto und Eintrag ein Mal am Tag
 * und höchstens CATALOG_DAILY Einträge am Tag (Tageszähler, nach zwei Tagen gelöscht). Gespeichert werden nur die Punkte
 * (Bereich, Ort/Tour/Tabellenzeile, Betrag pro Person, Monat, Gruppengröße, Datum) in catalogStats/{eintrag} bzw.
 * catalogStats/_arrival, ohne Konto. Die Regeln lassen die App dort nur lesen.
 */
import { requireVerified, verifyAnyIdToken } from "../../app/src/lib/agent/auth";
import { addPoints, ARRIVAL_DOC, parsePoints, type PricePoint } from "../../app/src/lib/catalog/prices";
import { fsClient, type StoreEnv } from "./firestore";

export interface CatalogEnv extends StoreEnv {
  /** Einträge mit Preispunkten pro Konto und Tag (Standard 10) */
  CATALOG_DAILY?: string;
  FIREBASE_TEST_PROJECT_ID?: string;
}

type Json = (body: unknown, status: number, headers: Record<string, string>) => Response;
type Count = (uid: string, kind: string) => Promise<{ used: number; bump: () => Promise<void> }>;

export interface PointStore {
  read(doc: string): Promise<PricePoint[]>;
  write(doc: string, pts: PricePoint[]): Promise<void>;
}

/** Punkte je Dokument als JSON-Text im Feld p (eine Lese- und eine Schreibanfrage je Dokument) */
export function pointStore(env: StoreEnv, f: typeof fetch = fetch): PointStore | null {
  const c = fsClient(env, f);
  if (!c) return null;
  return {
    async read(doc) {
      try {
        const d = await c.call(`${c.base}/catalogStats/${encodeURIComponent(doc)}`) as { fields?: { p?: { stringValue?: string } } };
        const v = JSON.parse(d.fields?.p?.stringValue || "[]");
        return Array.isArray(v) ? v : [];
      } catch (e) { if ((e as { status?: number }).status === 404) return []; throw e; }
    },
    async write(doc, pts) {
      await c.call(`${c.base}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: [{ update: { name: `${c.root}/catalogStats/${doc}`, fields: { p: { stringValue: JSON.stringify(pts) } } }, updateTransforms: [{ fieldPath: "at", setToServerValue: "REQUEST_TIME" }] }] })
      });
    }
  };
}

export async function catalogPrice(req: Request, env: CatalogEnv, h: Record<string, string>, json: Json, count: Count, store: PointStore | null, today = new Date().toISOString().slice(0, 10)): Promise<Response> {
  if (!store) return json({ error: "Preispunkte sind noch nicht eingerichtet" }, 503, h);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Bitte anmelden" }, 401, h);
  let uid: string;
  try { uid = await verifyAnyIdToken(token, env.FIREBASE_PROJECT_ID || "startrek-1b6a7", env.FIREBASE_TEST_PROJECT_ID); requireVerified(token); }
  catch (e) { return json({ error: (e as Error).message }, 401, h); }

  let body: unknown;
  try { body = JSON.parse((await req.text()).slice(0, 8000)); } catch { return json({ error: "Anfrage ist kein JSON" }, 400, h); }
  const r = parsePoints(body, today);
  if (typeof r === "string") return json({ error: r }, 400, h);

  // je Eintrag ein Mal am Tag, insgesamt wenige Einträge am Tag
  const one = await count(uid, `price:${r.entry}`);
  if (one.used >= 1) return json({ error: "Heute schon gemeldet" }, 429, h);
  const all = await count(uid, "price");
  if (all.used >= (Number(env.CATALOG_DAILY) || 10)) return json({ error: "Tageslimit erreicht" }, 429, h);

  const own = r.points.filter(p => p.c !== "arrival"), arr = r.points.filter(p => p.c === "arrival");
  if (own.length) await store.write(r.entry, addPoints(await store.read(r.entry), own, today));
  if (arr.length) await store.write(ARRIVAL_DOC, addPoints(await store.read(ARRIVAL_DOC), arr, today));
  await one.bump();
  await all.bump();
  return json({ ok: true, n: r.points.length }, 200, h);
}
