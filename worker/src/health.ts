import { partnerOn } from "../../app/src/lib/partner";
import { configuredStays, type StayEnv } from "../../app/src/lib/stays/search";

/**
 * Antwort von /health: Partner-Schalter und angebundene Quellen der Unterkunftssuche, nie Schlüssel.
 * version: Stand des Dienstes (Version der App aus app/package.json); daran erkennt der Rauchtest nach einem Release,
 * dass der neue Stand antwortet. stand: Commit, aus dem GitHub den Dienst veröffentlicht hat (Variable STAND beim
 * Veröffentlichen); damit gilt das auch, wenn die Version gleich geblieben ist.
 */
export const healthBody = (env: StayEnv & Parameters<typeof partnerOn>[0] & { STAND?: string }, version?: string) =>
  ({ ok: true, dienst: "Reisekasse Flugsuche", ...(version ? { version } : {}), ...(env.STAND ? { stand: env.STAND } : {}), partner: partnerOn(env), stays: configuredStays(env) });
