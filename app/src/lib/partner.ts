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

/** Viator-Partnerkennung (öffentlich, steht in jedem Partner-Link) */
export const VIATOR_PARTNER = { pid: "P00322974", mcid: "42383", medium: "link" };

/** Viator-Link mit Partnerkennung (nur wenn Partner-Links an sind) */
export function viatorAffiliate(url: string): string {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(VIATOR_PARTNER)) u.searchParams.set(k, v);
    return u.toString();
  } catch { return url; }
}
