import { describe, expect, it } from "vitest";
import { docxText, prepare, toBase64, xlsxText } from "./files";

// kleine Word- und Excel-Dateien (ZIP mit XML), erzeugt mit Pythons zipfile
const DOCX = "UEsDBBQAAAAIAJZNVF3HHBc8CgAAAAgAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLMJqSxILda3AwBQSwMEFAAAAAgAlk1UXUWTlsKKAAAALAEAABEAAAB3b3JkL2RvY3VtZW50LnhtbLMpt0rJTy7NTc0rUajIzckrtiq3VapQsrMpt0rKT6kE0QUgoghElNj5Jubk5BclJyqoJeYWWCsE5+flpdrog2RAZBGYLEDXZK7gd3hJckYJTCWQSEzSh8gZWloqPGpag9WMkqQcMAUxJhndWMe8vEQs+vRhajF1WOJWrg+xRx9qqz7M+/qI8LEDAFBLAQIUAxQAAAAIAJZNVF3HHBc8CgAAAAgAAAATAAAAAAAAAAAAAACAAQAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQDFAAAAAgAlk1UXUWTlsKKAAAALAEAABEAAAAAAAAAAAAAAIABOwAAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAACAAIAgAAAAPQAAAAAAA==";
const XLSX = "UEsDBBQAAAAIAJZNVF3N9PbmUwAAAIoAAAAUAAAAeGwvc2hhcmVkU3RyaW5ncy54bWyzKS4usbMpzrSzKbHzS8xNtdEHcvVBfIiYY05JahGGYF5eIqpYEUjYKTUPIloEEVCoyM2xKi5ITE61VSooSi1OLSpLVbJTcEotSoerA5ugD3IEAFBLAwQUAAAACACWTVRdFTsctIEAAAAXAQAAGAAAAHhsL3dvcmtzaGVldHMvc2hlZXQxLnhtbG3QUQqDMAwG4KtID7DY9kmIAcdusBOIFCyKQhrs9Ved1CI+pekfPkgwrjyF0TkhPMqnl56Q11hxq7QiHPZHp1UlrQqp36hG2AhhOLN3memcQTIyZDJkimFzg8zx2zwTNhO2IOyN+Gd+mf3ivsJpxgdCIcfxhZCWhL2/cCiWhusWP1BLAQIUAxQAAAAIAJZNVF3N9PbmUwAAAIoAAAAUAAAAAAAAAAAAAACAAQAAAAB4bC9zaGFyZWRTdHJpbmdzLnhtbFBLAQIUAxQAAAAIAJZNVF0VOxy0gQAAABcBAAAYAAAAAAAAAAAAAACAAYUAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWxQSwUGAAAAAAIAAgCIAAAAPAEAAAAA";
const buf = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

describe("Dateien für den Import (#457)", () => {
  it("Word: Absätze als Zeilen, Tabellenzellen mit Tab, Zeichen dekodiert", async () => {
    expect(await docxText(buf(DOCX))).toBe("Mallorca & Sonne\n7 Nächte\t199 €\nAnna\t9");
  });
  it("Excel: Zeilen mit Tab, geteilte und eingebettete Texte", async () => {
    expect(await xlsxText(buf(XLSX))).toBe("Name\tAlter\nAnna\t9\nBen Berg\terw.");
  });
  it("vorbereiten: PDF als Datei, Word/CSV als Text, Unbekanntes abgelehnt", async () => {
    const pdf = await prepare(new File([new Uint8Array([37, 80, 68, 70])], "a.pdf", { type: "application/pdf" }));
    expect(pdf).toEqual({ kind: "file", name: "a.pdf", file: { mime: "application/pdf", data: toBase64(new Uint8Array([37, 80, 68, 70])) } });
    expect(await prepare(new File([buf(DOCX)], "liste.docx"))).toMatchObject({ kind: "text", name: "liste.docx" });
    expect(await prepare(new File(["Name;Alter\nAnna;9"], "liste.csv", { type: "text/csv" }))).toEqual({ kind: "text", name: "liste.csv", text: "Name;Alter\nAnna;9" });
    expect(await prepare(new File(["x"], "a.zip", { type: "application/zip" }))).toEqual({ error: "badFile", name: "a.zip" });
    expect(await prepare(new File(["kaputt"], "b.docx"))).toEqual({ error: "badFile", name: "b.docx" });
    expect(await prepare(new File([new Uint8Array(4_300_000)], "gross.pdf", { type: "application/pdf" }))).toEqual({ error: "tooBig", name: "gross.pdf" });
  });
});
