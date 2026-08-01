import type {
  AutomationOrchestratorPipelineResult,
  AutomationOrchestratorPipelineValidationResult,
} from "./pipeline-types.js";
import type {
  AutomationOrchestratorPipelineSummary,
  AutomationOrchestratorPipelineSummaryCounts,
  AutomationOrchestratorPipelineSummaryStage,
} from "./pipeline-summary-types.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isProgression(
  value: unknown,
): value is "evaluation" | "selection" | "dispatch" {
  return (
    value === "evaluation" || value === "selection" || value === "dispatch"
  );
}

function isStageStatusForKind(
  value: unknown,
  kind: "evaluation" | "selection" | "dispatch",
): value is AutomationOrchestratorPipelineSummaryStage["status"] {
  if (kind === "evaluation") {
    return (
      value === "eligible" || value === "denied" || value === "indeterminate"
    );
  }
  if (kind === "selection") {
    return (
      value === "selected" || value === "rejected" || value === "indeterminate"
    );
  }
  return (
    value === "prepared" || value === "rejected" || value === "indeterminate"
  );
}

function counts(
  diagnostics: number,
  findings: number,
  failures: number,
  evidence: number,
): AutomationOrchestratorPipelineSummaryCounts {
  return Object.freeze({ diagnostics, findings, failures, evidence });
}

function invalidSummary(): AutomationOrchestratorPipelineSummary {
  return Object.freeze({
    status: "invalid" as const,
    valid: false,
    progression: null,
    validationSubjectStatus: null,
    evaluation: null,
    selection: null,
    dispatch: null,
    requestId: null,
    delegationId: null,
    candidateId: null,
    targetId: null,
    counts: counts(0, 0, 0, 0),
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}

function flagsAreFalse(decision: unknown, dispatch: boolean): boolean {
  return (
    isRecord(decision) &&
    decision.delegationOccurred === false &&
    decision.providerInvoked === false &&
    decision.forgeInvoked === false &&
    decision.executionStarted === false &&
    (!dispatch || decision.dispatchOccurred === false)
  );
}

function stage(
  result: unknown,
  kind: "evaluation" | "selection" | "dispatch",
  requestId: string,
  delegationId: string,
  candidateId: string | null,
  targetId: string | null,
): AutomationOrchestratorPipelineSummaryStage | null {
  if (
    !isRecord(result) ||
    !isStageStatusForKind(result.status, kind) ||
    !isRecord(result.decision)
  )
    return null;
  if (
    result.decision.status !== result.status ||
    !flagsAreFalse(result.decision, kind === "dispatch")
  )
    return null;
  const detail = result[kind];
  if (!Array.isArray(result.decision.evidence)) return null;
  if (detail === null && result.status !== "indeterminate") return null;
  if (
    detail !== null &&
    (!isRecord(detail) ||
      detail.status !== result.status ||
      !Array.isArray(detail.evidence))
  )
    return null;
  if (kind === "evaluation") {
    if (
      !isRecord(detail) ||
      !Array.isArray(detail.findings) ||
      !isRecord(detail.input) ||
      !isRecord(detail.input.request)
    )
      return null;
  }
  const findingCount =
    kind === "evaluation" && isRecord(detail) && Array.isArray(detail.findings)
      ? detail.findings.length
      : 0;
  const failureCount =
    result.failure === null ? 0 : isRecord(result.failure) ? 1 : -1;
  if (failureCount < 0) return null;
  return Object.freeze({
    status: result.status,
    requestId,
    delegationId,
    candidateId,
    targetId,
    evidenceCount:
      isRecord(detail) && Array.isArray(detail.evidence)
        ? detail.evidence.length
        : result.decision.evidence.length,
    findingCount,
    failureCount,
  });
}

function subjectMatches(
  subject: unknown,
  progression: "evaluation" | "selection" | "dispatch",
  requestId: string,
  delegationId: string,
  candidateId: string | null,
  targetId: string | null,
): boolean {
  return (
    isRecord(subject) &&
    subject.status === "complete" &&
    subject.progression === progression &&
    subject.requestId === requestId &&
    subject.delegationId === delegationId &&
    subject.candidateId === candidateId &&
    subject.targetId === targetId
  );
}

/**
 * Pure projection of already composed public pipeline and validation results.
 * It neither executes nor validates stages and rejects every untrusted shape.
 */
export function summarizeAutomationOrchestratorPipeline(
  pipeline: AutomationOrchestratorPipelineResult,
  validation: AutomationOrchestratorPipelineValidationResult,
): AutomationOrchestratorPipelineSummary {
  const source: unknown = pipeline;
  const checked: unknown = validation;
  if (
    !isRecord(source) ||
    !isRecord(checked) ||
    !Array.isArray(checked.diagnostics)
  )
    return invalidSummary();
  if (
    checked.status !== "valid" ||
    checked.valid !== true ||
    !isRecord(checked.subject)
  )
    return invalidSummary();
  if (!isProgression(source.progression)) return invalidSummary();

  const evaluation = source.delegationEvaluation;
  if (
    !isRecord(evaluation) ||
    !isRecord(evaluation.decision) ||
    !isRecord(evaluation.evaluation)
  )
    return invalidSummary();
  const request = evaluation.evaluation.input;
  const declared = evaluation.decision.declaredDelegation;
  if (
    !isRecord(request) ||
    !isRecord(request.request) ||
    !isString(request.request.requestId) ||
    !isRecord(declared) ||
    !isString(declared.delegationId)
  )
    return invalidSummary();
  const requestId = request.request.requestId;
  const delegationId = declared.delegationId;

  const selection = source.delegationSelection;
  const dispatch = source.delegationDispatch;
  const selectionCandidate =
    isRecord(selection) && isRecord(selection.decision)
      ? selection.decision.candidate
      : null;
  const candidateId =
    isRecord(selectionCandidate) && isString(selectionCandidate.candidateId)
      ? selectionCandidate.candidateId
      : null;
  const dispatchTarget =
    isRecord(dispatch) && isRecord(dispatch.decision)
      ? dispatch.decision.target
      : null;
  const targetId =
    isRecord(dispatchTarget) && isString(dispatchTarget.targetId)
      ? dispatchTarget.targetId
      : null;

  if (
    !subjectMatches(
      checked.subject,
      source.progression,
      requestId,
      delegationId,
      candidateId,
      targetId,
    )
  )
    return invalidSummary();
  if (
    source.progression === "evaluation" &&
    (selection !== null || dispatch !== null)
  )
    return invalidSummary();
  if (
    source.progression === "selection" &&
    (selection === null || dispatch !== null)
  )
    return invalidSummary();
  if (
    source.progression === "dispatch" &&
    (selection === null || dispatch === null)
  )
    return invalidSummary();

  const evaluationSummary = stage(
    evaluation,
    "evaluation",
    requestId,
    delegationId,
    null,
    null,
  );
  const selectionSummary =
    selection === null
      ? null
      : stage(
          selection,
          "selection",
          requestId,
          delegationId,
          candidateId,
          null,
        );
  const dispatchSummary =
    dispatch === null
      ? null
      : stage(
          dispatch,
          "dispatch",
          requestId,
          delegationId,
          candidateId,
          targetId,
        );
  if (
    evaluationSummary === null ||
    (selection !== null && selectionSummary === null) ||
    (dispatch !== null && dispatchSummary === null)
  )
    return invalidSummary();
  if (
    source.progression === "evaluation" &&
    evaluationSummary.status === "eligible"
  )
    return invalidSummary();
  if (
    source.progression === "selection" &&
    (evaluationSummary.status !== "eligible" ||
      selectionSummary?.status === "selected")
  )
    return invalidSummary();
  if (
    source.progression === "dispatch" &&
    (evaluationSummary.status !== "eligible" ||
      selectionSummary?.status !== "selected")
  )
    return invalidSummary();

  const summaryCounts = counts(
    checked.diagnostics.length,
    evaluationSummary.findingCount,
    evaluationSummary.failureCount +
      (selectionSummary?.failureCount ?? 0) +
      (dispatchSummary?.failureCount ?? 0),
    evaluationSummary.evidenceCount +
      (selectionSummary?.evidenceCount ?? 0) +
      (dispatchSummary?.evidenceCount ?? 0),
  );
  return Object.freeze({
    status: "valid" as const,
    valid: true,
    progression: source.progression,
    validationSubjectStatus: "complete" as const,
    evaluation: evaluationSummary,
    selection: selectionSummary,
    dispatch: dispatchSummary,
    requestId,
    delegationId,
    candidateId,
    targetId,
    counts: summaryCounts,
    dispatchOccurred: false,
    delegationOccurred: false,
    providerInvoked: false,
    forgeInvoked: false,
    executionStarted: false,
  });
}
