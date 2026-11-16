/* Firebase-Emulatoren von außen: leeren, als Admin schreiben und lesen (an den Regeln vorbei). */
import { AUTH, FIRESTORE, FS, PROJECT } from "./env.mjs";

const ADMIN = { Authorization: "Bearer owner", "content-type": "application/json" };

/** Datenbank und Konten leeren: jeder Test beginnt ohne Reste anderer Tests */
export async function resetEmu() {
  const r = await Promise.all([
    fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" }),
    fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" })
  ]);
  for (const x of r) if (!x.ok) throw new Error(`Emulator leeren: ${x.status} ${x.url}`);
}

/** Wert in die REST-Schreibweise von Firestore */
export const sv = v => Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === "string" ? { stringValue: v } : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? { integerValue: String(v) } : v === null ? { nullValue: null } : { mapValue: { fields: fields(v) } };
export const fields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, sv(v)]));

/** Dokument als Admin lesen (Antwort von Firestore, Felder unter .fields) */
export const adminGet = async path => (await fetch(`${FS}/${path}`, { headers: ADMIN })).json();
/** Dokument als Admin anlegen oder überschreiben */
export const adminPut = (path, o) => fetch(`${FS}/${path}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields: fields(o) }) });
