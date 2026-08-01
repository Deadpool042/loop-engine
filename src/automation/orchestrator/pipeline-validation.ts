import type {
  AutomationOrchestratorPipelineResult,
  AutomationOrchestratorPipelineValidationDiagnostic,
  AutomationOrchestratorPipelineValidationResult,
  AutomationOrchestratorPipelineValidationSubject,
} from "./pipeline-types.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function diagnostic(
  code: AutomationOrchestratorPipelineValidationDiagnostic["code"],
): AutomationOrchestratorPipelineValidationDiagnostic {
  return Object.freeze({ code, message: code });
}

function operationalFlagsAreFalse(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    value.delegationOccurred === false &&
    value.providerInvoked === false &&
    value.forgeInvoked === false &&
    value.executionStarted === false &&
    (value.dispatchOccurred === undefined || value.dispatchOccurred === false)
  );
}

function requestIdFrom(value: unknown): string | null {
  if (
    !isRecord(value) ||
    !isRecord(value.input) ||
    !isRecord(value.input.request)
  ) {
    return null;
  }
  return typeof value.input.request.requestId === "string"
    ? value.input.request.requestId
    : null;
}

function delegationIdFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.delegationId === "string" ? value.delegationId : null;
}

function candidateIdFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.candidateId === "string" ? value.candidateId : null;
}

function targetIdFrom(value: unknown): string | null {
  if (!isRecord(value)) return null;
  return typeof value.targetId === "string" ? value.targetId : null;
}

function progressionFrom(
  value: unknown,
): AutomationOrchestratorPipelineValidationSubject["progression"] {
  if (value === "evaluation" || value === "selection" || value === "dispatch") {
    return value;
  }
  return null;
}

function subjectFrom(
  pipeline: unknown,
): AutomationOrchestratorPipelineValidationSubject {
  if (!isRecord(pipeline)) {
    return Object.freeze({
      status: "incomplete" as const,
      progression: null,
      requestId: null,
      delegationId: null,
      candidateId: null,
      targetId: null,
    });
  }
  const progression = progressionFrom(pipeline.progression);
  const evaluation = pipeline.delegationEvaluation;
  const selection = pipeline.delegationSelection;
  const dispatch = pipeline.delegationDispatch;
  const requestId = requestIdFrom(
    isRecord(evaluation) ? evaluation.evaluation : null,
  );
  const delegationId = delegationIdFrom(
    isRecord(evaluation) && isRecord(evaluation.decision)
      ? evaluation.decision.declaredDelegation
      : null,
  );
  const candidateId = candidateIdFrom(
    isRecord(selection) && isRecord(selection.decision)
      ? selection.decision.candidate
      : null,
  );
  const targetId = targetIdFrom(
    isRecord(dispatch) && isRecord(dispatch.decision)
      ? dispatch.decision.target
      : null,
  );
  const complete =
    progression !== null &&
    requestId !== null &&
    delegationId !== null &&
    ((progression === "evaluation" &&
      selection === null &&
      dispatch === null) ||
      (progression === "selection" &&
        isRecord(selection) &&
        dispatch === null) ||
      (progression === "dispatch" &&
        isRecord(selection) &&
        candidateId !== null &&
        isRecord(dispatch)));

  if (complete) {
    return Object.freeze({
      status: "complete" as const,
      progression,
      requestId,
      delegationId,
      candidateId,
      targetId,
    });
  }
  return Object.freeze({
    status: "incomplete" as const,
    progression,
    requestId,
    delegationId,
    candidateId,
    targetId,
  });
}

function hasMatchingStatus(
  value: unknown,
  statuses: readonly string[],
): boolean {
  return (
    isRecord(value) &&
    typeof value.status === "string" &&
    statuses.includes(value.status) &&
    isRecord(value.decision) &&
    value.decision.status === value.status
  );
}

function addIf(
  diagnostics: AutomationOrchestratorPipelineValidationDiagnostic[],
  condition: boolean,
  code: AutomationOrchestratorPipelineValidationDiagnostic["code"],
): void {
  if (condition) diagnostics.push(diagnostic(code));
}

/**
 * Purely validates the existing declarative pipeline result. It never reruns,
 * repairs, copies, or changes a stage result.
 */
export function validateAutomationOrchestratorPipeline(
  pipeline: AutomationOrchestratorPipelineResult,
): AutomationOrchestratorPipelineValidationResult {
  const diagnostics: AutomationOrchestratorPipelineValidationDiagnostic[] = [];
  const source: unknown = pipeline;
  const subject = subjectFrom(source);
  if (!isRecord(source)) {
    return Object.freeze({
      status: "invalid" as const,
      valid: false as const,
      subject,
      diagnostics: Object.freeze([diagnostic("pipeline_malformed")]),
    });
  }

  const evaluation = source.delegationEvaluation;
  const selection = source.delegationSelection;
  const dispatch = source.delegationDispatch;
  const progression = source.progression;

  addIf(
    diagnostics,
    !hasMatchingStatus(evaluation, ["eligible", "denied", "indeterminate"]),
    "pipeline_malformed",
  );
  addIf(
    diagnostics,
    !isRecord(evaluation) || !operationalFlagsAreFalse(evaluation.decision),
    "pipeline_operational_flag_invalid",
  );
  if (selection !== null) {
    addIf(
      diagnostics,
      !hasMatchingStatus(selection, ["selected", "rejected", "indeterminate"]),
      "pipeline_malformed",
    );
    addIf(
      diagnostics,
      !isRecord(selection) || !operationalFlagsAreFalse(selection.decision),
      "pipeline_operational_flag_invalid",
    );
  }
  if (dispatch !== null) {
    addIf(
      diagnostics,
      !hasMatchingStatus(dispatch, ["prepared", "rejected", "indeterminate"]),
      "pipeline_malformed",
    );
    addIf(
      diagnostics,
      !isRecord(dispatch) || !operationalFlagsAreFalse(dispatch.decision),
      "pipeline_operational_flag_invalid",
    );
  }

  if (progression === "evaluation") {
    addIf(
      diagnostics,
      !isRecord(evaluation) || evaluation.status === "eligible",
      "pipeline_stage_status_invalid",
    );
    addIf(
      diagnostics,
      selection !== null || dispatch !== null,
      "pipeline_nullability_invalid",
    );
  } else if (progression === "selection") {
    addIf(
      diagnostics,
      !isRecord(evaluation) || evaluation.status !== "eligible",
      "pipeline_stage_status_invalid",
    );
    addIf(
      diagnostics,
      selection === null ||
        !isRecord(selection) ||
        selection.status === "selected",
      "pipeline_stage_status_invalid",
    );
    addIf(diagnostics, dispatch !== null, "pipeline_nullability_invalid");
  } else if (progression === "dispatch") {
    addIf(
      diagnostics,
      !isRecord(evaluation) || evaluation.status !== "eligible",
      "pipeline_stage_status_invalid",
    );
    addIf(
      diagnostics,
      !isRecord(selection) || selection.status !== "selected",
      "pipeline_stage_status_invalid",
    );
    addIf(diagnostics, dispatch === null, "pipeline_nullability_invalid");
  } else {
    diagnostics.push(diagnostic("pipeline_progression_invalid"));
  }

  const evaluationDelegation =
    isRecord(evaluation) && isRecord(evaluation.decision)
      ? evaluation.decision.declaredDelegation
      : null;
  const selectionCandidate =
    isRecord(selection) && isRecord(selection.decision)
      ? selection.decision.candidate
      : null;
  const dispatchTarget =
    isRecord(dispatch) && isRecord(dispatch.decision)
      ? dispatch.decision.target
      : null;
  const requestIds = [
    requestIdFrom(isRecord(evaluation) ? evaluation.evaluation : null),
    requestIdFrom(isRecord(selection) ? selection.selection : null),
    requestIdFrom(isRecord(dispatch) ? dispatch.dispatch : null),
  ].filter((value): value is string => value !== null);
  const delegationIds = [
    delegationIdFrom(evaluationDelegation),
    delegationIdFrom(
      isRecord(selectionCandidate)
        ? selectionCandidate.declaredDelegation
        : null,
    ),
    delegationIdFrom(
      isRecord(dispatchTarget) ? dispatchTarget.declaredDelegation : null,
    ),
  ].filter((value): value is string => value !== null);
  const candidateIds = [
    candidateIdFrom(selectionCandidate),
    candidateIdFrom(
      isRecord(dispatchTarget) ? dispatchTarget.selectedCandidate : null,
    ),
  ].filter((value): value is string => value !== null);

  addIf(
    diagnostics,
    new Set(requestIds).size > 1 ||
      new Set(delegationIds).size > 1 ||
      new Set(candidateIds).size > 1,
    "pipeline_identity_inconsistent",
  );

  const unique = new Map<
    string,
    AutomationOrchestratorPipelineValidationDiagnostic
  >();
  for (const item of diagnostics) unique.set(item.code, item);
  const ordered = [...unique.values()].sort((left, right) =>
    stableCompare(left.code, right.code),
  );
  if (ordered.length === 0) {
    return Object.freeze({
      status: "valid" as const,
      valid: true as const,
      subject,
      diagnostics: Object.freeze([]),
    });
  }
  return Object.freeze({
    status: "invalid" as const,
    valid: false as const,
    subject,
    diagnostics: Object.freeze(ordered),
  });
}
