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
  hasPlan: boolean;
  hasExecutionOutcome: boolean;
};

const labels: Record<GuidedFlowStepId, string> = {
  project: "Projet",
  work: "Travail",
  prepare: "Préparation",
  execute: "Exécution",
  result: "Résultat",
};

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

  return [
    { id: "project", label: labels.project, status: "done" },
    {
      id: "work",
      label: labels.work,
      status: state.contextLoading
        ? "active"
        : workReady
          ? "done"
          : workBlocked
            ? "blocked"
            : "active",
    },
    {
      id: "prepare",
      label: labels.prepare,
      status: !workReady ? "pending" : state.hasPlan ? "done" : "active",
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
