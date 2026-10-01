/* KI-Assistent: Chatfenster unten rechts, von überall zu öffnen */
import { app } from "../store.svelte";

/** unread: Ergebnis kam, während das Fenster zu war (der Knopf meldet es) */
export const agentChat = $state({ open: false, unread: "" as "" | "done" | "question" | "none" | "error" });

export function openChat() {
  app.editing = null;
  agentChat.open = true;
  agentChat.unread = "";
}
