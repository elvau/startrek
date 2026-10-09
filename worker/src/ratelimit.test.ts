/* Läuft mit den Tests der App (cd app && npx vitest run) */
import { describe, expect, it } from "vitest";
import { checkLimit, ipKey, searchWindows, type Store } from "./ratelimit";

/** Zwischenspeicher wie im Rechenzentrum, ohne Ablauf (die Fenster stecken im Schlüssel) */
function memory(): Store & { keys: () => string[] } {
  const m = new Map<string, string>();
  return {
    match: async k => (m.has(k.url) ? new Response(m.get(k.url)) : undefined),
    put: async (k, r) => { m.set(k.url, await r.text()); },
    keys: () => [...m.keys()]
  };
}

describe("Mengenbegrenzung der Suchen", () => {
  const T = Date.parse("2026-10-01T10:00:05Z");

  it("Standard 60 pro Minute und 600 pro Stunde, einstellbar", () => {
    expect(searchWindows({})).toEqual([{ limit: 60, sec: 60 }, { limit: 600, sec: 3600 }]);
    expect(searchWindows({ SEARCH_PER_MIN: "10", SEARCH_PER_HOUR: "50" })).toEqual([{ limit: 10, sec: 60 }, { limit: 50, sec: 3600 }]);
  });

  it("über der Minutengrenze gesperrt bis zur nächsten Minute, andere IPs nicht betroffen", async () => {
    const s = memory();
    const w = [{ limit: 3, sec: 60 }];
    for (let i = 0; i < 3; i++) expect((await checkLimit(s, "1.2.3.4", w, T)).ok).toBe(true);
    expect(await checkLimit(s, "1.2.3.4", w, T)).toEqual({ ok: false, retryAfter: 55 });
    expect((await checkLimit(s, "5.6.7.8", w, T)).ok).toBe(true);
    // neue Minute: wieder frei
    expect((await checkLimit(s, "1.2.3.4", w, T + 60_000)).ok).toBe(true);
  });

  it("Stundengrenze greift auch über mehrere Minuten; gesperrte Anfragen zählen nicht mit", async () => {
    const s = memory();
    const w = [{ limit: 2, sec: 60 }, { limit: 3, sec: 3600 }];
    expect((await checkLimit(s, "ip", w, T)).ok).toBe(true);
    expect((await checkLimit(s, "ip", w, T)).ok).toBe(true);
    expect((await checkLimit(s, "ip", w, T)).ok).toBe(false);
    expect((await checkLimit(s, "ip", w, T + 60_000)).ok).toBe(true);
    const blocked = await checkLimit(s, "ip", w, T + 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(3600 - 65);
  });

  it("ohne IP (lokal, Tests) keine Begrenzung", async () => {
    const s = memory();
    expect(await checkLimit(s, null, [{ limit: 0, sec: 60 }], T)).toEqual({ ok: true, retryAfter: 0 });
    expect(s.keys()).toEqual([]);
  });
  it("IPv6 zählt je /64-Netz, IPv4 je Adresse", () => {
    expect(ipKey("2001:db8:85a3:0042:1000:8a2e:370:7334")).toBe("2001:db8:85a3:42::/64");
    expect(ipKey("2001:db8:85a3:42::1")).toBe("2001:db8:85a3:42::/64");
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipKey(null)).toBeNull();
  });
});
