// Pure navigation state machine for the GUI Cockpit shell.
// No DOM, no Electron API — testable in plain Node.
// Screens mirror docs/architecture/gui-cockpit.md §4: Réglages, Dashboard,
// Détail projet (variant A merges Dashboard + Détail into one split view).

export type Screen =
  | { readonly name: "settings" }
  | { readonly name: "dashboard" }
  | { readonly name: "project-detail"; readonly project: string };

export interface NavState {
  readonly screen: Screen;
}

/**
 * Initial screen depends on whether a repo path is already configured
 * (decision 15: no repo configured → Réglages; configured → Dashboard).
 */
export function initialNav(hasRepoPath: boolean): NavState {
  return { screen: hasRepoPath ? { name: "dashboard" } : { name: "settings" } };
}

export function goToSettings(_state: NavState): NavState {
  return { screen: { name: "settings" } };
}

export function goToDashboard(_state: NavState): NavState {
  return { screen: { name: "dashboard" } };
}

export function selectProject(_state: NavState, project: string): NavState {
  if (typeof project !== "string" || project.trim().length === 0) {
    throw new TypeError("project must be a non-empty string");
  }
  return { screen: { name: "project-detail", project } };
}
