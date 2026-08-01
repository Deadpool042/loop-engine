import type { AutomationOrchestratorPipelineSummary } from "./pipeline-summary-types.js";
import type { AutomationOrchestratorPipelineAdmissionDecision } from "./pipeline-admission-types.js";

type RecordValue = Readonly<Record<string, unknown>>;
function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function decision(
  status: AutomationOrchestratorPipelineAdmissionDecision["status"],
  reason: AutomationOrchestratorPipelineAdmissionDecision["reason"],
  summary: RecordValue | null,
): AutomationOrchestratorPipelineAdmissionDecision {
  const valid = summary !== null;
  return Object.freeze({
    status,
    admitted: status === "admitted",
    reason,
    progression:
      valid &&
      (summary.progression === "evaluation" ||
        summary.progression === "selection" ||
        summary.progression === "dispatch")
        ? summary.progression
        : null,
    requestId: valid ? stringOrNull(summary.requestId) : null,
    delegationId: valid ? stringOrNull(summary.delegationId) : null,
    candidateId: valid ? stringOrNull(summary.candidateId) : null,
    targetId: valid ? stringOrNull(summary.targetId) : null,
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}
function validFlags(value: RecordValue): boolean {
  return (
    value.dispatchOccurred === false &&
    value.delegationOccurred === false &&
    value.providerInvoked === false &&
    value.forgeInvoked === false &&
    value.executionStarted === false
  );
}
function stage(
  value: unknown,
  statuses: readonly string[],
  requestId: unknown,
  delegationId: unknown,
  candidateId: unknown,
  targetId: unknown,
): boolean {
  return (
    record(value) &&
    statuses.includes(value.status as string) &&
    value.requestId === requestId &&
    value.delegationId === delegationId &&
    value.candidateId === candidateId &&
    value.targetId === targetId
  );
}
/** Pure declarative admission decision for a compact public summary only. */
export function decideAutomationOrchestratorPipelineAdmission(
  summary: AutomationOrchestratorPipelineSummary,
): AutomationOrchestratorPipelineAdmissionDecision {
  const source: unknown = summary;
  if (
    !record(source) ||
    source.status !== "valid" ||
    source.valid !== true ||
    source.validationSubjectStatus !== "complete" ||
    !validFlags(source)
  )
    return decision("indeterminate", "invalid_summary", null);
  const { progression, requestId, delegationId, candidateId, targetId } =
    source;
  if (
    typeof requestId !== "string" ||
    typeof delegationId !== "string" ||
    (candidateId !== null && typeof candidateId !== "string") ||
    (targetId !== null && typeof targetId !== "string")
  )
    return decision("indeterminate", "invalid_summary", null);
  if (
    progression === "evaluation" &&
    source.selection === null &&
    source.dispatch === null &&
    candidateId === null &&
    targetId === null &&
    stage(
      source.evaluation,
      ["denied", "indeterminate"],
      requestId,
      delegationId,
      null,
      null,
    )
  )
    return record(source.evaluation) && source.evaluation.status === "denied"
      ? decision("rejected", "pipeline_rejected", source)
      : decision("indeterminate", "pipeline_indeterminate", source);
  if (
    progression === "selection" &&
    source.dispatch === null &&
    targetId === null &&
    stage(
      source.evaluation,
      ["eligible"],
      requestId,
      delegationId,
      null,
      null,
    ) &&
    stage(
      source.selection,
      ["rejected", "indeterminate"],
      requestId,
      delegationId,
      candidateId,
      null,
    )
  )
    return record(source.selection) && source.selection.status === "rejected"
      ? decision("rejected", "pipeline_rejected", source)
      : decision("indeterminate", "pipeline_indeterminate", source);
  if (
    progression === "dispatch" &&
    stage(
      source.evaluation,
      ["eligible"],
      requestId,
      delegationId,
      null,
      null,
    ) &&
    stage(
      source.selection,
      ["selected"],
      requestId,
      delegationId,
      candidateId,
      null,
    ) &&
    stage(
      source.dispatch,
      ["prepared", "rejected", "indeterminate"],
      requestId,
      delegationId,
      candidateId,
      targetId,
    )
  )
    return record(source.dispatch) && source.dispatch.status === "prepared"
      ? decision("admitted", "dispatch_prepared", source)
      : record(source.dispatch) && source.dispatch.status === "rejected"
        ? decision("rejected", "pipeline_rejected", source)
        : decision("indeterminate", "pipeline_indeterminate", source);
  return decision("indeterminate", "invalid_summary", null);
}
