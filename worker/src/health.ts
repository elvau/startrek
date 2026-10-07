import { partnerOn } from "../../app/src/lib/partner";
import { configuredStays, type StayEnv } from "../../app/src/lib/stays/search";

/** Antwort von /health: Partner-Schalter und angebundene Quellen der Unterkunftssuche, nie Schlüssel */
export const healthBody = (env: StayEnv & Parameters<typeof partnerOn>[0]) =>
  ({ ok: true, dienst: "Reisekasse Flugsuche", partner: partnerOn(env), stays: configuredStays(env) });
