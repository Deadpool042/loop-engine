// Local fixtures — NOT a CLI adapter. Lot 1 explicitly does not spawn
// `pnpm loop`; the dashboard and detail panel render this static data so
// the shell is testable end to end before the CLI adapter lot lands.
// Shape mirrors the prototype (prototype/gui-cockpit/index.html) and the
// JSON contracts documented in docs/architecture/gui-cockpit.md §7.

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

export interface ProjectDetailFixture {
  readonly status: Readonly<Record<string, unknown>>;
  readonly next: Readonly<Record<string, unknown>>;
  readonly review: Readonly<Record<string, unknown>>;
  readonly plan: Readonly<Record<string, unknown>>;
}

export const FIXTURE_DETAIL: Readonly<Record<string, ProjectDetailFixture>> = {
  creatyss: {
    status: { branch: "main", clean: false, docsMissing: ["docs/roadmap/projet-creatyss.md"], health: "warning" },
    next: { candidate: "Lot 24 — corriger la validation du formulaire de paiement", risk: "warning" },
    review: { summary: "2 fichiers non couverts par un test", findings: ["src/lib/payment/validate.ts:18"] },
    plan: { mode: "plan", agentPolicy: { capability: "code-edit", effort: "medium" }, contextPackage: { files: 3, truncated: false } },
  },
  "lp-infra": {
    status: { branch: "main", clean: true, docsMissing: [], health: "good" },
    next: { candidate: null, risk: null },
    review: { summary: "Rien à signaler", findings: [] },
    plan: { mode: "plan", agentPolicy: null, contextPackage: { files: 0, truncated: false } },
  },
  n8n: {
    status: { branch: "main", clean: true, docsMissing: [], health: "good" },
    next: { candidate: "Documenter le workflow de notification Slack", risk: "safe" },
    review: { summary: "OK", findings: [] },
    plan: { mode: "plan", agentPolicy: { capability: "docs", effort: "low" }, contextPackage: { files: 1, truncated: false } },
  },
  "loop-engine": {
    status: { branch: "main", clean: false, docsMissing: [], health: "warning" },
    next: { candidate: "Vérifier le contrat JSON de la commande status (risque R-3)", risk: "warning" },
    review: { summary: "1 risque architecture ouvert (R-3)", findings: ["status: contrat --json non confirmé"] },
    plan: { mode: "plan", agentPolicy: { capability: "investigation", effort: "low" }, contextPackage: { files: 2, truncated: false } },
  },
};
