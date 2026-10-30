/*
 * Anbieter-Links aus dem KI-Konnektor laufen über splitandfly.com/go/?l=… (app/go/index.html): Der Klick kommt so wie in
 * der App von splitandfly.com (Herkunft für die Partnerprogramme) und wird gezählt. Das Ziel steht signiert im Link
 * (seal mit MCP_KEY_SECRET); die Seite leitet nur weiter, wenn der Such-Dienst die Signatur bestätigt (keine offene
 * Weiterleitung).
 */
import { seal, unseal } from "./apikey";
import { noteClick, type UsageEnv } from "./usage";

const KIND = "go";
/** Kennung für die Zählung wie in der App (app/src/lib/partners/click.ts) */
const clickId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const clickCat = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").slice(0, 20);
const https = (u: unknown): u is string => typeof u === "string" && u.length <= 3000 && /^https:\/\/[^\s]+$/.test(u);

/** Link über die Weiterleitung; partner: Anbieter (sonst der Host), cat: Kapitel */
export async function goLink(secret: string, appUrl: string, url: string, partner: string, cat: string): Promise<string> {
  if (!https(url)) return url;
  const p = clickId(partner) || clickId(new URL(url).hostname.replace(/^www\./, "")) || "link";
  const token = await seal(secret, KIND, { u: url, p, c: clickCat(cat) || "misc" });
  return `${appUrl.replace(/\/?$/, "/")}go/?l=${token}`;
}

/** Ziel eines Weiterleitungs-Links bei gültiger Signatur (Klick wird gezählt), sonst null */
export async function openGo(secret: string, token: string, env: UsageEnv): Promise<string | null> {
  const v = await unseal<{ u?: unknown; p?: unknown; c?: unknown }>(secret, KIND, token.trim(), 6000);
  if (!v || !https(v.u)) return null;
  noteClick(env, { p: v.p, c: v.c });
  return v.u;
}
