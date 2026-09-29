/* KI-Planer: Dialog von überall öffnen */
import { app } from "../store.svelte";

export const agentPlanner = $state({ open: false });

export function openAgentPlanner() {
  app.editing = null;
  agentPlanner.open = true;
}
