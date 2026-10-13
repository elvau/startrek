import { describe, expect, it } from "vitest";
import { providerName } from "./broker";

describe("Hinweis beim Wechsel zum Anbieter", () => {
  it("Name angegeben, sonst die Adresse ohne www., Weiterleitungen ohne Namen", () => {
    expect(providerName("https://www.booking.com/x", "Booking.com")).toBe("Booking.com");
    expect(providerName("https://www.flixbus.de/suche")).toBe("flixbus.de");
    expect(providerName("https://tp.media/r?u=https%3A%2F%2Fx")).toBe("");
    expect(providerName("kaputt")).toBe("");
  });
});
