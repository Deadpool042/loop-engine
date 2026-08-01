import type { AutomationOrchestratorPipelineAdmissionDecision } from "./pipeline-admission-types.js";
import type {
  AutomationOrchestratorPipelineHandoffReason,
  AutomationOrchestratorPipelineWorkerHandoff,
} from "./pipeline-worker-handoff-types.js";

type RecordValue = Readonly<Record<string, unknown>>;

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flagsAreFalse(source: RecordValue): boolean {
  return (
    source.dispatchOccurred === false &&
    source.delegationOccurred === false &&
    source.providerInvoked === false &&
    source.forgeInvoked === false &&
    source.executionStarted === false &&
    source.workerSelected !== true &&
    source.commandCreated !== true
  );
}

function identifiersFor(
  source: RecordValue,
  progression: "evaluation" | "selection" | "dispatch",
): Readonly<{
  requestId: string;
  delegationId: string;
  candidateId: string | null;
  targetId: string | null;
}> | null {
  if (
    typeof source.requestId !== "string" ||
    typeof source.delegationId !== "string" ||
    (source.candidateId !== null && typeof source.candidateId !== "string") ||
    (source.targetId !== null && typeof source.targetId !== "string")
  )
    return null;
  if (
    (progression === "evaluation" &&
      (source.candidateId !== null || source.targetId !== null)) ||
    (progression === "selection" &&
      (typeof source.candidateId !== "string" || source.targetId !== null)) ||
    (progression === "dispatch" &&
      (typeof source.candidateId !== "string" ||
        typeof source.targetId !== "string"))
  )
    return null;
  return Object.freeze({
    requestId: source.requestId,
    delegationId: source.delegationId,
    candidateId: source.candidateId,
    targetId: source.targetId,
  });
}

function handoff(
  status: AutomationOrchestratorPipelineWorkerHandoff["status"],
  reason: AutomationOrchestratorPipelineHandoffReason,
  identifiers: Readonly<{
    requestId: string;
    delegationId: string;
    candidateId: string | null;
    targetId: string | null;
  }> | null,
  progression: "dispatch" | null,
): AutomationOrchestratorPipelineWorkerHandoff {
  return Object.freeze({
    status,
    prepared: status === "prepared",
    reason,
    progression,
    requestId: identifiers?.requestId ?? null,
    delegationId: identifiers?.delegationId ?? null,
    candidateId: identifiers?.candidateId ?? null,
    targetId: identifiers?.targetId ?? null,
    workerSelected: false,
    commandCreated: false,
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}

/** Pure construction of a future worker handoff from a public admission only. */
export function prepareAutomationOrchestratorPipelineWorkerHandoff(
  admission: AutomationOrchestratorPipelineAdmissionDecision,
): AutomationOrchestratorPipelineWorkerHandoff {
  const source: unknown = admission;
  if (!record(source) || !flagsAreFalse(source))
    return handoff("rejected", "invalid_admission", null, null);

  if (
    source.status === "admitted" &&
    source.admitted === true &&
    source.reason === "dispatch_prepared" &&
    source.progression === "dispatch"
  ) {
    const identifiers = identifiersFor(source, "dispatch");
    return identifiers === null
      ? handoff("rejected", "invalid_admission", null, null)
      : handoff("prepared", "admission_accepted", identifiers, "dispatch");
  }

  if (
    (source.status === "rejected" &&
      source.admitted === false &&
      source.reason === "pipeline_rejected") ||
    (source.status === "indeterminate" &&
      source.admitted === false &&
      source.reason === "pipeline_indeterminate")
  ) {
    if (
      source.progression !== "evaluation" &&
      source.progression !== "selection" &&
      source.progression !== "dispatch"
    )
      return handoff("rejected", "invalid_admission", null, null);
    const identifiers = identifiersFor(source, source.progression);
    return identifiers === null
      ? handoff("rejected", "invalid_admission", null, null)
      : handoff(
          "rejected",
          "admission_rejected",
          identifiers,
          source.progression === "dispatch" ? "dispatch" : null,
        );
  }

  return handoff("rejected", "invalid_admission", null, null);
}
