// Shared error rendering used by every section and action that can fail:
// Next, Context, Prompt, Review, Plan, Validate, Open Folder, and the
// Summary load. Neutral, no business-code interpretation — see
// gui/shared/gui-execution-error.ts.
import type { GuiExecutionError } from "../shared/gui-execution-error.js";
import { escapeHtml } from "./html.js";

export interface ErrorPanelHandlers {
  onRetry(): void;
  onOpenSettings(): void;
  onCopyDetails(details: string): void;
}

export function renderSharedErrorPanel(
  error: GuiExecutionError,
  handlers: ErrorPanelHandlers,
): HTMLElement {
  const element = document.createElement("div");

  element.className = "error-panel";

  element.innerHTML = `
    <div class="error-title">Impossible d'exécuter la commande.</div>
    <pre class="error-details mono">${escapeHtml(error.details)}</pre>
    <div class="error-actions">
      <button class="ghost error-copy">Copier les détails</button>
      <button class="ghost error-retry">Réessayer</button>
      <button class="ghost error-settings">Ouvrir les Réglages</button>
    </div>
  `;

  element.querySelector(".error-copy")?.addEventListener("click", () => {
    handlers.onCopyDetails(error.details);
  });

  element.querySelector(".error-retry")?.addEventListener("click", () => {
    handlers.onRetry();
  });

  element.querySelector(".error-settings")?.addEventListener("click", () => {
    handlers.onOpenSettings();
  });

  return element;
}
