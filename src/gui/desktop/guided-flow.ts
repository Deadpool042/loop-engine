export type GuidedFlowStepId =
  | "project"
  | "work"
  | "prepare"
  | "execute"
  | "result";

export type GuidedFlowStepStatus = "done" | "active" | "pending" | "blocked";

export type GuidedFlowStep = {
  id: GuidedFlowStepId;
  label: string;
  status: GuidedFlowStepStatus;
};

export type GuidedFlowState = {
  hasProject: boolean;
  contextLoading: boolean;
  hasCandidate: boolean;
  candidateAddressable: boolean;
  planLoading: boolean;
  hasPlan: boolean;
  hasPlanError: boolean;
  hasExecutionOutcome: boolean;
  /** True while an execution-decision renewal or draft is awaiting the user's action, even after a plan error has been resolved. */
  hasExecutionDecisionInProgress?: boolean;
};

const labels: Record<GuidedFlowStepId, string> = {
  project: "Projet",
  work: "Travail",
  prepare: "Préparation",
  execute: "Exécution",
  result: "Résultat",
};

export function getFocusedGuidedFlowStepId(
  steps: readonly GuidedFlowStep[],
): GuidedFlowStepId {
  return (
    steps.find((step) => step.status === "active")?.id ??
    steps.find((step) => step.status === "blocked")?.id ??
    "project"
  );
}

export function buildGuidedFlowSteps(
  state: GuidedFlowState,
): readonly GuidedFlowStep[] {
  if (!state.hasProject) {
    return [
      { id: "project", label: labels.project, status: "active" },
      { id: "work", label: labels.work, status: "pending" },
      { id: "prepare", label: labels.prepare, status: "pending" },
      { id: "execute", label: labels.execute, status: "pending" },
      { id: "result", label: labels.result, status: "pending" },
    ];
  }

  const workReady = state.hasCandidate && state.candidateAddressable;
  const workBlocked = state.hasCandidate && !state.candidateAddressable;
  const decisionInProgress = state.hasExecutionDecisionInProgress ?? false;

  return [
    { id: "project", label: labels.project, status: "done" },
    {
      id: "work",
      label: labels.work,
      status: state.contextLoading
        ? "active"
        : workBlocked
          ? "blocked"
          : workReady && (state.planLoading || state.hasPlan || state.hasPlanError || decisionInProgress)
            ? "done"
            : "active",
    },
    {
      id: "prepare",
      label: labels.prepare,
      status: !workReady && !decisionInProgress
        ? "pending"
        : state.hasPlan
          ? "done"
          : state.hasPlanError || decisionInProgress
            ? "blocked"
            : state.planLoading
              ? "active"
              : "pending",
    },
    {
      id: "execute",
      label: labels.execute,
      status: !state.hasPlan
        ? "pending"
        : state.hasExecutionOutcome
          ? "done"
          : "active",
    },
    {
      id: "result",
      label: labels.result,
      status: state.hasExecutionOutcome ? "active" : "pending",
    },
  ];
}
