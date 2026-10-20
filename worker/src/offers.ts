/*
 * Angebotsspeicher (#462): ausgelesene Angebote in Firestore (Sammlungen offers und offerInputs), nur über das
 * Dienstkonto des Such-Dienstes, nie von der App aus (Regeln sperren beides). Gespeichert werden nur neutrale
 * Angebotsdaten bis zum Ablauf (expiresAt, zum Löschen per TTL-Richtlinie in Firestore); keine Dateien, keine Namen.
 */
import { fromFs, fsClient, toFs, type StoreEnv } from "./firestore";
import { cacheable, expiryOf, inputKey, offerKey } from "../../app/src/lib/import/cache";
import { parseImportAi, type ImportedOffer, type ImportRequest } from "../../app/src/lib/import/ai";

export interface OfferHit { offer: ImportedOffer; until: string }
export interface OfferStore {
  find(r: ImportRequest, today?: string): Promise<OfferHit | null>;
  save(r: ImportRequest, o: ImportedOffer, today?: string): Promise<void>;
}

const fields = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, toFs(v)]));
const read = (doc: { fields?: Record<string, Record<string, unknown>> }) => Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, fromFs(v)])) as Record<string, unknown>;

export function offerStore(env: StoreEnv, f: typeof fetch = fetch): OfferStore | null {
  const c = fsClient(env, f);
  if (!c) return null;
  const get = async (path: string) => {
    try { return read(await c.call(`${c.base}/${path}`) as never); }
    catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
  };
  return {
    async find(r, today = new Date().toISOString().slice(0, 10)) {
      const inp = await get(`offerInputs/${await inputKey(r)}`);
      if (!inp || typeof inp.offer !== "string" || String(inp.until) < today) return null;
      const doc = await get(`offers/${inp.offer}`);
      if (!doc || typeof doc.data !== "string" || String(doc.until) < today) return null;
      return { offer: parseImportAi(JSON.parse(doc.data)), until: String(doc.until) };
    },
    async save(r, o, today = new Date().toISOString().slice(0, 10)) {
      if (!cacheable(o)) return;
      const until = expiryOf(o, today);
      if (!until) return;
      const ok = await offerKey(o), ik = await inputKey(r);
      const expiresAt = { timestampValue: `${until}T23:59:59Z` };
      await c.call(`${c.base}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: [
          { update: { name: `${c.root}/offers/${ok}`, fields: { ...fields({ data: JSON.stringify(o), until }), expiresAt } }, updateTransforms: [{ fieldPath: "savedAt", setToServerValue: "REQUEST_TIME" }] },
          { update: { name: `${c.root}/offerInputs/${ik}`, fields: { ...fields({ offer: ok, until }), expiresAt } } }
        ] })
      });
    }
  };
}
