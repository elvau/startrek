/* Admin-Ansicht in der App: wer Admin ist, entscheidet der Such-Dienst (ADMIN_UIDS); einmal je Anmeldung gefragt */
import { i18n, t } from "../i18n/index.svelte";
import { FLIGHTS_URL } from "../flights/app";
import { idToken } from "../cloud/cloud.svelte";
import type { UsageReport } from "./usage";

export const admin = $state<{ uid: string; is: boolean; open: boolean }>({ uid: "", is: false, open: false });

export async function fetchUsage(): Promise<{ status: number; report?: UsageReport; error?: string }> {
  if (!FLIGHTS_URL) return { status: 0, error: t("search.notReady") };
  const token = await idToken();
  if (!token) return { status: 401 };
  const res = await fetch(`${FLIGHTS_URL}/admin/usage`, { headers: { authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { status: res.status, error: i18n.lang === "de" && data.error ? data.error : t("search.status", { s: res.status }) };
  return { status: res.status, report: data as UsageReport };
}

/** Admin? Nur beim ersten Öffnen des Kontomenüs je Anmeldung; andere bekommen 403 ohne weitere Kosten */
export async function checkAdmin(uid: string) {
  if (!uid || admin.uid === uid) return;
  admin.uid = uid;
  admin.is = false;
  try {
    if (!FLIGHTS_URL) return;
    const token = await idToken();
    if (!token) return;
    const res = await fetch(`${FLIGHTS_URL}/admin/usage?check=1`, { headers: { authorization: `Bearer ${token}` } });
    admin.is = res.ok;
  } catch { /* offline: kein Eintrag */ }
}
