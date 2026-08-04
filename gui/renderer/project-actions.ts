// Pure, DOM-free helpers backing the project actions bar (Validate, Review,
// Prompt, Open Folder, Copy Prompt). Kept separate from app.ts so the
// decision logic stays unit-testable without a DOM.
import type { ProjectPromptReport } from "../shared/project-prompt.js";
import type { LazySectionState } from "./section-loader.js";

// Mirrors the exact text the Prompt section's own "Copier" button produces,
// so "Copy Prompt" in the actions bar copies the identical, currently
// loaded prompt — nothing is refetched or reformatted.
export function promptCopyText(
  state: LazySectionState<ProjectPromptReport> | undefined,
): string | null {
  if (!state || state.status !== "success") {
    return null;
  }

  return JSON.stringify(state.value, null, 2);
}
