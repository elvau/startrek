/*
 * Reise importieren (#457): Dateien im Browser vorbereiten. Bilder werden verkleinert (spart Datenvolumen und KI-Kosten),
 * PDF geht unverändert mit, Word, Excel und CSV liest die App selbst als Text (die KI bekommt davon nur den Text).
 * Word (.docx) und Excel (.xlsx) sind ZIP-Archive mit XML; dafür reicht ein kleiner Leser ohne weitere Bibliothek.
 */
import { IMPORT_FILE_MAX, type ImportFile } from "./ai";

export type Prepared = { kind: "file"; name: string; file: ImportFile } | { kind: "text"; name: string; text: string };
export type PrepError = { error: "badFile" | "tooBig"; name: string };

export const ACCEPT = "image/*,application/pdf,.pdf,.docx,.xlsx,.csv,.txt,text/csv,text/plain";
const IMG_MAX = 1800;

/* ---------- ZIP ---------- */

/** Einträge eines ZIP-Archivs (Name → Inhalt), nur die genannten bzw. alle, die passen */
export async function unzip(buf: ArrayBuffer, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf), u8 = new Uint8Array(buf), out = new Map<string, Uint8Array>();
  // Ende des zentralen Verzeichnisses: von hinten suchen (Kommentar höchstens 64 KB)
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("kein ZIP");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name) || v.getUint32(local, true) !== 0x04034b50) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const raw = u8.subarray(start, start + size);
    if (method === 0) out.set(name, raw.slice());
    else if (method === 8) out.set(name, new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
  }
  return out;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10)) : ENT[e] ?? m));

/** Text eines Word-Dokuments: Absätze als Zeilen, Tabellenzellen mit Tab */
export async function docxText(buf: ArrayBuffer): Promise<string> {
  const xml = new TextDecoder().decode((await unzip(buf, n => n === "word/document.xml")).get("word/document.xml") || new Uint8Array());
  return unxml(xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>\s*<\/w:tc>/g, "\t").replace(/<\/w:tr>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Text einer Excel-Mappe: je Blatt die Zeilen, Zellen mit Tab getrennt */
export async function xlsxText(buf: ArrayBuffer): Promise<string> {
  const files = await unzip(buf, n => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const dec = new TextDecoder();
  const shared = [...dec.decode(files.get("xl/sharedStrings.xml") || new Uint8Array()).matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map(m => unxml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join("")));
  const sheets = [...files.keys()].filter(n => n.startsWith("xl/worksheets/")).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  return sheets.map(n => [...dec.decode(files.get(n)).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(r =>
    [...r[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(c => {
      const attrs = c[1], inner = c[2] || "";
      const val = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      if (/t="s"/.test(attrs)) return shared[Number(val)] ?? "";
      if (/t="inlineStr"/.test(attrs)) return unxml([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(""));
      return unxml(val);
    }).join("\t").replace(/\t+$/, "")).filter(Boolean).join("\n")).filter(Boolean).join("\n\n");
}

/* ---------- Dateien ---------- */

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Bild verkleinern (längste Seite höchstens 1800 px) und als JPEG; ohne Canvas (Tests) unverändert */
async function shrink(f: Blob): Promise<{ mime: ImportFile["mime"]; data: string }> {
  if (typeof createImageBitmap === "function" && typeof OffscreenCanvas === "function") {
    try {
      const bmp = await createImageBitmap(f);
      const k = Math.min(1, IMG_MAX / Math.max(bmp.width, bmp.height));
      const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
      c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      const out = await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
      return { mime: "image/jpeg", data: toBase64(new Uint8Array(await out.arrayBuffer())) };
    } catch { /* unbekanntes Bildformat: unten unverändert, wenn erlaubt */ }
  }
  const mime = (["image/jpeg", "image/png", "image/webp"] as const).find(m => m === f.type);
  if (!mime) throw new Error("badFile");
  return { mime, data: toBase64(new Uint8Array(await f.arrayBuffer())) };
}

const ext = (name: string) => name.toLowerCase().split(".").pop() || "";

/** eine Datei für den Import vorbereiten: als Datei für die KI oder als Text */
export async function prepare(f: File): Promise<Prepared | PrepError> {
  const name = f.name || "Datei", e = ext(name);
  try {
    if (f.type.startsWith("image/")) {
      const r = await shrink(f);
      return r.data.length > IMPORT_FILE_MAX ? { error: "tooBig", name } : { kind: "file", name, file: r };
    }
    if (f.type === "application/pdf" || e === "pdf") {
      if (f.size > (IMPORT_FILE_MAX / 4) * 3) return { error: "tooBig", name };
      return { kind: "file", name, file: { mime: "application/pdf", data: toBase64(new Uint8Array(await f.arrayBuffer())) } };
    }
    if (e === "docx") return { kind: "text", name, text: await docxText(await f.arrayBuffer()) };
    if (e === "xlsx") return { kind: "text", name, text: await xlsxText(await f.arrayBuffer()) };
    if (e === "csv" || e === "txt" || f.type === "text/csv" || f.type === "text/plain") return { kind: "text", name, text: (await f.text()).slice(0, 20000) };
  } catch { /* kaputt oder unbekannt */ }
  return { error: "badFile", name };
}
