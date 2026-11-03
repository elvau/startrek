import { describe, expect, it } from "vitest";
import { checkUsername, suggestUsername, usernameKey } from "./username";

describe("Benutzername (#650)", () => {
  it("gültige Namen", () => {
    for (const n of ["reh42", "Dani_B", "jörg.müller", "fjordfan", "Łucja", "abc"]) expect(checkUsername(n), n).toBeNull();
  });
  it("Länge, Zeichen, Punkt am Rand", () => {
    expect(checkUsername("ab")).toBe("short");
    expect(checkUsername("a".repeat(21))).toBe("long");
    expect(checkUsername("mit leer")).toBe("chars");
    expect(checkUsername("a@b.de")).toBe("chars");
    expect(checkUsername(".reh")).toBe("chars");
    expect(checkUsername("reh.")).toBe("chars");
  });
  it("gesperrt: Marke, Rollen, Telefonnummer, Beleidigung", () => {
    expect(checkUsername("SplitAndFly")).toBe("reserved");
    expect(checkUsername("split_and_fly_team")).toBe("reserved");
    expect(checkUsername("admin1")).toBe("reserved");
    expect(checkUsername("tel01761234567")).toBe("contact");
    expect(checkUsername("fuckyou")).toBe("rude");
  });
  it("Schlüssel ohne Groß-/Kleinschreibung, Vorschlag gültig", () => {
    expect(usernameKey(" Reh42 ")).toBe("reh42");
    const s = suggestUsername("Bär", () => 0.5);
    expect(s).toBe("bär55");
    expect(checkUsername(s)).toBeNull();
  });
});
