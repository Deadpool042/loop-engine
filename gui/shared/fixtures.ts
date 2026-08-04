// Local fixtures — NOT a CLI adapter. Kept only for navigation-shell tests
// (see gui/tests/dashboard-fixtures.test.ts); every rendered section is now
// backed by real Loop CLI adapters (gui-cockpit.md §9, Lot 5).

export interface ProjectSummary {
  readonly name: string;
  readonly type: string;
  readonly path: string;
  readonly git: { readonly branch: string; readonly clean: boolean };
  readonly health: "good" | "warning" | "bad";
}

export const FIXTURE_PROJECTS: readonly ProjectSummary[] = [
  { name: "creatyss", type: "next-prisma", path: "../CREATYSS", git: { branch: "main", clean: false }, health: "warning" },
  { name: "lp-infra", type: "infra", path: "../lp-infra", git: { branch: "main", clean: true }, health: "good" },
  { name: "n8n", type: "automation", path: "../n8n", git: { branch: "main", clean: true }, health: "good" },
  { name: "loop-engine", type: "cli", path: ".", git: { branch: "main", clean: false }, health: "warning" },
];
