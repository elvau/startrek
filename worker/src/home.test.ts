/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { findHome } from "./home";

const files: Record<string, string> = {
  "https://app/plz.txt": "479060436401419Kempen|421030425602148Wuppertal|421050425602148Wuppertal",
  "https://app/plz/AT.txt": "1010\tWien, Innere Stadt\t48.209\t16.372\n6020\tInnsbruck\t47.263\t11.394\n"
};
const fake = (async (u: string) => (files[u] ? new Response(files[u]) : new Response("", { status: 404 }))) as typeof fetch;

describe("Wohnort für den Konnektor (#608)", () => {
  it("findet PLZ, Ort und Ort mit PLZ, auch im Ausland", async () => {
    expect(await findHome("47906 Kempen", "DE", "https://app/", fake)).toEqual({ plz: "47906", ort: "Kempen", lat: 51.364, lon: 6.419 });
    expect(await findHome("wuppertal", "DE", "https://app/", fake)).toMatchObject({ plz: "42103", ort: "Wuppertal" });
    expect(await findHome("42105", "DE", "https://app/", fake)).toMatchObject({ plz: "42105" });
    expect(await findHome("Innsbruck", "AT", "https://app/", fake)).toEqual({ plz: "6020", ort: "Innsbruck", lat: 47.263, lon: 11.394, cc: "AT" });
    expect(await findHome("Atlantis", "DE", "https://app/", fake)).toBeNull();
    // Land ohne Daten
    expect(await findHome("Paris", "FR", "https://app/", fake)).toBeNull();
  });
});
