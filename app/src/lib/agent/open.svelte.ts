/* KI-Assistent: Chatfenster unten rechts, von überall zu öffnen */
import { app } from "../store.svelte";

/** unread: Ergebnis kam, während das Fenster zu war (der Knopf meldet es) */
/** Gruppenchat der Reise: offen; immer nur eines der beiden Fenster */
export const groupChat = $state({ open: false });

export const agentChat = $state({ open: false, unread: "" as "" | "done" | "question" | "none" | "error" });

export function openChat() {
  app.editing = null;
  groupChat.open = false;
  agentChat.open = true;
  agentChat.unread = "";
}
