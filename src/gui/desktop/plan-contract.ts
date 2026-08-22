export type PlanDetail = Readonly<{
  project: string;
  candidate: Readonly<{
    id: string;
    text: string;
    kind: "safe" | "warning" | "blocked";
    status: string;
  }>;
  steps: readonly Readonly<{
    name: string;
    details: readonly string[];
  }>[];
  profile: Readonly<{
    id: string;
    provider: string;
    model: string;
    effort: string;
    category: string;
    reasons: readonly string[];
    contextBudgetTokens: number;
    fallbackActive: boolean;
    fallbackReason: string | null;
  }> | null;
  context: Readonly<{
    files: readonly string[];
    estimatedTokens: number;
    truncated: boolean;
  }> | null;
  writableFileScope: readonly string[] | null;
  brief: Readonly<{
    objective: string;
    deliverables: readonly string[];
    outOfScope: readonly string[];
  }> | null;
}>;

export type PlanFailure = Readonly<{
  code: string;
  message: string;
}>;

export function hasAddressableCandidate(
  candidate: Readonly<{ id?: string }> | null | undefined,
): candidate is Readonly<{ id: string }> {
  return candidate?.id !== undefined;
}

export function isPlanForSelectedProject(
  planProjectName: string | null,
  selectedProjectName: string | null,
): boolean {
  return planProjectName !== null && planProjectName === selectedProjectName;
}

const STATIC_PLAN_STEP_LABELS: Readonly<Record<string, string>> = Object.freeze(
  {
    "Prepare short project context (context)":
      "Préparation du contexte projet borné (context)",
    "Prepare delegation prompt (prompt)":
      "Préparation du prompt de délégation (prompt)",
    "Await explicit agent execution in mode execute":
      "Attente d'une exécution explicite de l’agent en mode execute",
    "Run local validation and audit before commit (validate, audit)":
      "Validation et audit locaux avant commit (validate, audit)",
    "Commit only in mode commit": "Commit uniquement en mode commit",
    "Publish only in mode publish": "Publication uniquement en mode publish",
  },
);

function formatPlanStep(
  plan: PlanDetail,
  stepName: string,
  detail: string,
): string {
  if (
    stepName === "planning" &&
    detail === `Resolving project: ${plan.project}`
  ) {
    return `Résolution du projet : ${plan.project}`;
  }

  if (
    stepName === "ready" &&
    detail === `Selected candidate: ${plan.candidate.text}`
  ) {
    return `Candidat confirmé : ${plan.candidate.id} — ${plan.candidate.text}`;
  }

  if (
    stepName === "completed" &&
    detail === `Select roadmap candidate: ${plan.candidate.text}`
  ) {
    return `Sélection du candidat de roadmap : ${plan.candidate.id} — ${plan.candidate.text}`;
  }

  return STATIC_PLAN_STEP_LABELS[detail] ?? "Étape complémentaire du plan.";
}

export function formatPlanSteps(plan: PlanDetail): readonly string[] {
  return plan.steps.flatMap((step) =>
    step.details.map((detail) => formatPlanStep(plan, step.name, detail)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function parseProfile(
  value: unknown,
): PlanDetail["profile"] | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isRecord(value.selection)) return undefined;
  if (
    value.selection.outcome !== "selected" ||
    !isRecord(value.selection.profile)
  ) {
    return null;
  }

  const { profile } = value.selection;
  const requirements = value.requirements;
  if (
    typeof profile.id !== "string" ||
    typeof profile.provider !== "string" ||
    typeof profile.model !== "string" ||
    typeof profile.effort !== "string" ||
    !isRecord(requirements) ||
    typeof requirements.category !== "string" ||
    !isStringArray(value.reasons) ||
    !isRecord(requirements.contextBudget) ||
    typeof requirements.contextBudget.maxEstimatedTokens !== "number"
  ) {
    return undefined;
  }

  // Additive and optional: absent on older responses, treated as no fallback.
  const fallback = isRecord(value.fallback) ? value.fallback : undefined;
  const fallbackActive = fallback?.active === true;
  const fallbackReason =
    fallbackActive && typeof fallback?.reason === "string"
      ? fallback.reason
      : null;

  return Object.freeze({
    id: profile.id,
    provider: profile.provider,
    model: profile.model,
    effort: profile.effort,
    category: requirements.category,
    reasons: Object.freeze([...value.reasons]),
    contextBudgetTokens: requirements.contextBudget.maxEstimatedTokens,
    fallbackActive,
    fallbackReason,
  });
}

function parseBrief(value: unknown): PlanDetail["brief"] | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    typeof value.objective !== "string" ||
    value.objective.trim().length === 0 ||
    !isStringArray(value.deliverables) ||
    value.deliverables.length === 0 ||
    !isStringArray(value.outOfScope) ||
    value.outOfScope.length === 0
  ) {
    return undefined;
  }

  return Object.freeze({
    objective: value.objective,
    deliverables: Object.freeze([...value.deliverables]),
    outOfScope: Object.freeze([...value.outOfScope]),
  });
}

function parseContext(value: unknown): PlanDetail["context"] | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.files)) {
    return undefined;
  }

  const files = value.files.map((file) => (isRecord(file) ? file.path : null));
  if (
    !isStringArray(files) ||
    typeof value.estimatedTokens !== "number" ||
    typeof value.truncated !== "boolean"
  ) {
    return undefined;
  }

  return Object.freeze({
    files: Object.freeze([...files]),
    estimatedTokens: value.estimatedTokens,
    truncated: value.truncated,
  });
}

export function parsePlanDetail(value: unknown): PlanDetail | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.mode !== "plan" ||
    value.status !== "completed" ||
    value.failure !== null ||
    typeof value.project !== "string" ||
    !isRecord(value.candidate) ||
    typeof value.candidate.id !== "string" ||
    typeof value.candidate.text !== "string" ||
    (value.candidate.kind !== "safe" &&
      value.candidate.kind !== "warning" &&
      value.candidate.kind !== "blocked") ||
    typeof value.candidate.status !== "string" ||
    !Array.isArray(value.steps)
  ) {
    return null;
  }

  const steps = value.steps.map((step) =>
    isRecord(step) &&
    typeof step.name === "string" &&
    isStringArray(step.details)
      ? { name: step.name, details: step.details }
      : null,
  );
  const profile = parseProfile(value.agentPolicy);
  const context = parseContext(value.contextPackage);
  const brief = parseBrief(value.brief);
  const writableFileScope =
    value.writableFileScope === null
      ? null
      : isStringArray(value.writableFileScope)
        ? Object.freeze([...value.writableFileScope])
        : undefined;
  if (
    steps.some((step) => step === null) ||
    profile === undefined ||
    context === undefined ||
    brief === undefined ||
    writableFileScope === undefined
  ) {
    return null;
  }

  return Object.freeze({
    project: value.project,
    candidate: Object.freeze({
      id: value.candidate.id,
      text: value.candidate.text,
      kind: value.candidate.kind,
      status: value.candidate.status,
    }),
    steps: Object.freeze(
      steps.map((step) =>
        Object.freeze({
          name: step!.name,
          details: Object.freeze([...step!.details]),
        }),
      ),
    ),
    profile,
    context,
    writableFileScope,
    brief,
  });
}

export function parsePlanFailure(value: unknown): PlanFailure | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.mode !== "plan" ||
    (value.status !== "blocked" && value.status !== "failed") ||
    !isRecord(value.failure) ||
    typeof value.failure.code !== "string" ||
    typeof value.failure.message !== "string"
  ) {
    return null;
  }

  return Object.freeze({
    code: value.failure.code,
    message: value.failure.message,
  });
}
