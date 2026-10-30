/*
 * Angebotsspeicher (#462): ausgelesene Angebote in Firestore (Sammlungen offers und offerInputs), nur über das
 * Dienstkonto des Such-Dienstes, nie von der App aus (Regeln sperren beides). Gespeichert werden nur neutrale
 * Angebotsdaten bis zum Ablauf (expiresAt); keine Dateien, keine Namen. Gelöscht wird ohne TTL-Richtlinie (die braucht
 * Abrechnung in Google Cloud), sondern täglich per Zeitplan des Such-Dienstes (sweep); Abgelaufenes wird nie mehr gelesen.
 */
import { fromFs, fsClient, toFs, type StoreEnv } from "./firestore";
import { cacheable, expiryOf, inputKey, offerKey } from "../../app/src/lib/import/cache";
import { parseImportAi, type ImportedOffer, type ImportRequest } from "../../app/src/lib/import/ai";

export interface OfferHit { offer: ImportedOffer; until: string }
export interface OfferStore {
  find(r: ImportRequest, today?: string): Promise<OfferHit | null>;
  save(r: ImportRequest, o: ImportedOffer, today?: string): Promise<void>;
  /** abgelaufene Einträge löschen (täglich per Zeitplan); gibt die Zahl zurück */
  sweep(now?: Date): Promise<number>;
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
    async sweep(now = new Date()) {
      let n = 0;
      for (const col of ["offers", "offerInputs", "mcpOffers"]) {
        const rows = await c.call(`${c.base}:runQuery`, {
          method: "POST",
          body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: "expiresAt" }, op: "LESS_THAN", value: { timestampValue: now.toISOString() } } }, limit: 300 } })
        }) as unknown as { document?: { name: string } }[];
        const names = (Array.isArray(rows) ? rows : []).flatMap(x => (x.document ? [x.document.name] : []));
        if (names.length) await c.call(`${c.base}:commit`, { method: "POST", body: JSON.stringify({ writes: names.map(name => ({ delete: name })) }) });
        n += names.length;
      }
      return n;
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

/**
 * Suchergebnisse des KI-Konnektors für add_flight/add_stay: einige Stunden je Schlüssel bzw. Verbindung, in Firestore
 * (Sammlung mcpOffers). Der Zwischenspeicher von Cloudflare gilt nur im eigenen Rechenzentrum; Suche und Übernahme laufen
 * bei Chat-Apps oft über verschiedene, dann fehlte das Angebot („Offer not found“). Kennung: Prüfwert aus Schlüssel und
 * Angebot, kein Bezug zum Konto lesbar. Aufgeräumt wird mit sweep oben.
 */
export interface KeyedStore<T> { put(key: string, list: [string, T][]): Promise<void>; get(key: string, id: string): Promise<T | null> }

export function mcpOfferStore<T>(env: StoreEnv, f: typeof fetch = fetch, hours = 6): KeyedStore<T> | null {
  const c = fsClient(env, f);
  if (!c) return null;
  const name = async (key: string, id: string) => {
    const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}\n${id}`)));
    return [...d].map(b => b.toString(16).padStart(2, "0")).join("");
  };
  return {
    async put(key, list) {
      if (!list.length) return;
      const expiresAt = { timestampValue: new Date(Date.now() + hours * 3600_000).toISOString() };
      const writes = await Promise.all(list.map(async ([id, v]) => ({ update: { name: `${c.root}/mcpOffers/${await name(key, id)}`, fields: { ...fields({ data: JSON.stringify(v) }), expiresAt } } })));
      await c.call(`${c.base}:commit`, { method: "POST", body: JSON.stringify({ writes }) });
    },
    async get(key, id) {
      let doc: { fields?: Record<string, Record<string, unknown>> };
      try { doc = await c.call(`${c.base}/mcpOffers/${await name(key, id)}`) as never; }
      catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
      const until = String(doc.fields?.expiresAt?.timestampValue || "");
      const d = read(doc);
      if (!until || until < new Date().toISOString() || typeof d.data !== "string") return null;
      return JSON.parse(d.data) as T;
    }
  };
}
