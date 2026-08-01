import type { AutomationOrchestratorPipelineWorkerHandoff } from "./pipeline-worker-handoff-types.js";
import type {
  AutomationOrchestratorWorkerCommand,
  AutomationOrchestratorWorkerCommandReason,
} from "./worker-command-types.js";

type RecordValue = Readonly<Record<string, unknown>>;

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flagsAreFalse(source: RecordValue): boolean {
  return (
    source.workerSelected === false &&
    source.commandCreated === false &&
    source.commandDispatched !== true &&
    source.dispatchOccurred === false &&
    source.delegationOccurred === false &&
    source.providerInvoked === false &&
    source.forgeInvoked === false &&
    source.executionStarted === false
  );
}

function identifiers(source: RecordValue): Readonly<{
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
}> | null {
  if (
    (source.requestId !== null && typeof source.requestId !== "string") ||
    (source.delegationId !== null && typeof source.delegationId !== "string") ||
    (source.candidateId !== null && typeof source.candidateId !== "string") ||
    (source.targetId !== null && typeof source.targetId !== "string")
  )
    return null;
  return Object.freeze({
    requestId: source.requestId as string | null,
    delegationId: source.delegationId as string | null,
    candidateId: source.candidateId as string | null,
    targetId: source.targetId as string | null,
  });
}

function command(
  status: AutomationOrchestratorWorkerCommand["status"],
  reason: AutomationOrchestratorWorkerCommandReason,
  source: Readonly<{
    requestId: string | null;
    delegationId: string | null;
    candidateId: string | null;
    targetId: string | null;
  }> | null,
): AutomationOrchestratorWorkerCommand {
  return Object.freeze({
    status,
    prepared: status === "prepared",
    reason,
    kind: status === "prepared" ? "execute_delegated_task" : null,
    requestId: source?.requestId ?? null,
    delegationId: source?.delegationId ?? null,
    candidateId: source?.candidateId ?? null,
    targetId: source?.targetId ?? null,
    workerSelected: false,
    commandDispatched: false,
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}

/** Pure construction of a future dispatch instruction from a public handoff only. */
export function prepareAutomationOrchestratorWorkerCommand(
  handoff: AutomationOrchestratorPipelineWorkerHandoff,
): AutomationOrchestratorWorkerCommand {
  const source: unknown = handoff;
  if (!record(source) || !flagsAreFalse(source))
    return command("rejected", "invalid_handoff", null);
  const values = identifiers(source);
  if (values === null) return command("rejected", "invalid_handoff", null);

  if (
    source.status === "prepared" &&
    source.prepared === true &&
    source.reason === "admission_accepted" &&
    source.progression === "dispatch" &&
    typeof values.requestId === "string" &&
    typeof values.delegationId === "string" &&
    typeof values.candidateId === "string" &&
    typeof values.targetId === "string"
  )
    return command("prepared", "handoff_prepared", values);

  if (
    source.status === "rejected" &&
    source.prepared === false &&
    source.reason === "admission_rejected" &&
    (source.progression === "dispatch" || source.progression === null)
  )
    return command("rejected", "handoff_rejected", values);

  return command("rejected", "invalid_handoff", null);
}
