/*
 * Reisen im Konto für den Claude-Konnektor: Firestore über REST mit einem Dienstkonto (Secret FIREBASE_SERVICE_ACCOUNT,
 * JSON aus der Firebase-Konsole). Das Dienstkonto umgeht die Sicherheitsregeln, darum prüft dieser Baustein selbst:
 * lesen nur Mitglieder, ändern nur Besitzer und Bearbeiter, Mitglieder und Einladung bleiben unangetastet.
 */

export interface StoreEnv {
  /** Dienstkonto als JSON (Secret); fehlt es, kann der Konnektor nur suchen */
  FIREBASE_SERVICE_ACCOUNT?: string;
  FIREBASE_PROJECT_ID?: string;
  /** nur für Tests: Firestore-Emulator, z. B. http://127.0.0.1:8080 */
  FIRESTORE_EMULATOR?: string;
}

export interface TripRecord { id: string; name: string; data: string; owner: string; members: Record<string, string>; updateTime: string }

export interface TripStore {
  list(uid: string): Promise<TripRecord[]>;
  get(id: string): Promise<TripRecord | null>;
  create(id: string, name: string, data: string, uid: string, displayName: string): Promise<void>;
  /** nur, wenn die Reise seit dem Lesen nicht geändert wurde (sonst Fehler „conflict“) */
  update(rec: TripRecord, name: string, data: string, uid: string): Promise<void>;
}

/* ---------- Werte im Firestore-Format ---------- */

type FsValue = Record<string, unknown>;
export function toFs(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
  throw new Error("Wert nicht speicherbar");
}
export function fromFs(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (((v.arrayValue as { values?: FsValue[] }).values) || []).map(fromFs);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(((v.mapValue as { fields?: Record<string, FsValue> }).fields) || {}).map(([k, x]) => [k, fromFs(x)]));
  return undefined;
}

function record(doc: { name: string; fields?: Record<string, FsValue>; updateTime: string }): TripRecord {
  const f = doc.fields || {};
  return {
    id: doc.name.split("/").pop()!, name: String(fromFs(f.name) ?? ""), data: String(fromFs(f.data) ?? ""), owner: String(fromFs(f.owner) ?? ""),
    members: (fromFs(f.members) as Record<string, string>) || {}, updateTime: doc.updateTime
  };
}

/* ---------- Anmeldung als Dienstkonto (JWT → Zugangsschlüssel, eine Stunde gültig) ---------- */

const b64url = (b: Uint8Array | string) => btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
let cached: { token: string; exp: number; email: string } | null = null;

async function accessToken(sa: { client_email: string; private_key: string }, f: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.email === sa.client_email && cached.exp > now + 60) return cached.token;
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  const res = await f("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${head}.${claims}.${b64url(sig)}`
  });
  const data = await res.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(`Anmeldung Dienstkonto: ${data.error_description || res.status}`);
  cached = { token: data.access_token, exp: now + (data.expires_in || 3600), email: sa.client_email };
  return cached.token;
}

/** Firestore-Zugang; null, wenn kein Dienstkonto eingerichtet ist */
export function tripStore(env: StoreEnv, f: typeof fetch = fetch): TripStore | null {
  const emu = env.FIRESTORE_EMULATOR?.replace(/\/$/, "");
  let sa: { client_email: string; private_key: string; project_id?: string } | null = null;
  if (!emu) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return null;
    try { sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT); } catch { return null; }
    if (!sa?.client_email || !sa.private_key) return null;
  }
  const project = env.FIREBASE_PROJECT_ID || sa?.project_id || "startrek-1b6a7";
  const root = `projects/${project}/databases/(default)/documents`;
  const base = `${emu || "https://firestore.googleapis.com"}/v1/${root}`;
  const auth = async () => ({ authorization: `Bearer ${emu ? "owner" : await accessToken(sa!, f)}`, "content-type": "application/json" });
  async function call(url: string, init: RequestInit = {}) {
    const res = await f(url, { ...init, headers: { ...(await auth()), ...(init.headers || {}) } });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (data.error as { message?: string; status?: string } | undefined);
      throw Object.assign(new Error(`Firestore ${res.status}: ${msg?.message || ""}`), { status: res.status, code: msg?.status });
    }
    return data;
  }
  const docName = (id: string) => `${root}/trips/${id}`;
  return {
    async list(uid) {
      const rows = await call(`${base}:runQuery`, {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "trips" }], where: { fieldFilter: { field: { fieldPath: "memberIds" }, op: "ARRAY_CONTAINS", value: { stringValue: uid } } }, limit: 100 } })
      }) as unknown as { document?: { name: string; fields?: Record<string, FsValue>; updateTime: string } }[];
      return (Array.isArray(rows) ? rows : []).filter(r => r.document).map(r => record(r.document!));
    },
    async get(id) {
      try { return record(await call(`${base}/trips/${encodeURIComponent(id)}`) as never); }
      catch (e) { if ((e as { status?: number }).status === 404) return null; throw e; }
    },
    async create(id, name, data, uid, displayName) {
      const fields = { name, data, owner: uid, memberIds: [uid], members: { [uid]: "owner" }, memberNames: { [uid]: displayName }, invite: null, updatedBy: uid };
      await call(`${base}:commit`, {
        method: "POST",
        body: JSON.stringify({ writes: [{
          update: { name: docName(id), fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFs(v)])) },
          currentDocument: { exists: false },
          updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }]
        }] })
      });
    },
    async update(rec, name, data, uid) {
      try {
        await call(`${base}:commit`, {
          method: "POST",
          body: JSON.stringify({ writes: [{
            update: { name: docName(rec.id), fields: { name: toFs(name), data: toFs(data), updatedBy: toFs(uid) } },
            updateMask: { fieldPaths: ["name", "data", "updatedBy"] },
            currentDocument: { updateTime: rec.updateTime },
            updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }]
          }] })
        });
      } catch (e) {
        if ((e as { code?: string }).code === "FAILED_PRECONDITION") throw Object.assign(new Error("conflict"), { conflict: true });
        throw e;
      }
    }
  };
}

/** Rolle des Nutzers in der Reise (owner, editor, viewer) oder null */
export const roleOf = (rec: TripRecord, uid: string): string | null => rec.members[uid] || null;
export const canEdit = (rec: TripRecord, uid: string) => ["owner", "editor"].includes(roleOf(rec, uid) || "");
