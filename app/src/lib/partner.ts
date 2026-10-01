/*
 * Partner-Links (Provision bei Buchung): Schalter im Such-Dienst, Variable PARTNER_LINKS = "on".
 * Standard aus: dann gehen keine Partner-Kennungen in Links, und die App kennzeichnet nichts als „Partner“.
 */
export interface PartnerEnv { PARTNER_LINKS?: string }

export const partnerOn = (env: PartnerEnv) => env.PARTNER_LINKS === "on";

/** Partner-Kennungen aus einem Link entfernen (Viator: pid, mcid, medium, campaign) */
export function plainLink(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ["pid", "mcid", "medium", "campaign", "marker"]) u.searchParams.delete(k);
    return u.toString();
  } catch { return url; }
}
