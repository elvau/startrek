/* KI-Assistent: Chatfenster unten rechts, von überall zu öffnen */
import { app } from "../store.svelte";

export const agentChat = $state({ open: false });

export function openChat() {
  app.editing = null;
  agentChat.open = true;
}
