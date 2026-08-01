import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorDelegationDispatch,
  AutomationOrchestratorDelegationDispatchDecision,
  AutomationOrchestratorDelegationDispatchEvidence,
  AutomationOrchestratorDelegationDispatchFailure,
  AutomationOrchestratorDelegationDispatchInput,
  AutomationOrchestratorDelegationDispatchResult,
  AutomationOrchestratorDelegationDispatchTarget,
} from "./types.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableCompare(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function copyJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    const copied: unknown[] = [];
    for (const item of value) copied.push(copyJson(item));
    return Object.freeze(copied);
  }
  if (!isRecord(value)) return null;
  const copied: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(stableCompare)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype")
      continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    copied[key] =
      descriptor?.value === undefined ? null : copyJson(descriptor.value);
  }
  return Object.freeze(copied);
}

function metadata(value: unknown): AutomationMetadata {
  const source = isRecord(value) ? value : {};
  const labels: string[] = [];
  if (Array.isArray(source.labels)) {
    for (const label of source.labels)
      if (typeof label === "string") labels.push(label);
  }
  const attributes: Record<string, string> = {};
  if (isRecord(source.attributes)) {
    for (const key of Object.keys(source.attributes).sort(stableCompare)) {
      const attribute = source.attributes[key];
      if (typeof attribute === "string") attributes[key] = attribute;
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    correlationId:
      typeof source.correlationId === "string" ? source.correlationId : "",
    createdAt: typeof source.createdAt === "string" ? source.createdAt : "",
    labels: Object.freeze(labels),
    attributes: Object.freeze(attributes),
  });
}

function hasMetadata(value: unknown): boolean {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.correlationId === "string" &&
    typeof value.createdAt === "string" &&
    Array.isArray(value.labels) &&
    isRecord(value.attributes)
  );
}

function compareEvidence(
  left: AutomationOrchestratorDelegationDispatchEvidence,
  right: AutomationOrchestratorDelegationDispatchEvidence,
): number {
  return stableCompare(
    `${left.kind}\u0000${left.evidenceId}\u0000${left.reference}`,
    `${right.kind}\u0000${right.evidenceId}\u0000${right.reference}`,
  );
}

function evidence(
  value: unknown,
): readonly AutomationOrchestratorDelegationDispatchEvidence[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Map<
    string,
    AutomationOrchestratorDelegationDispatchEvidence
  >();
  for (const item of value) {
    if (!isRecord(item) || !hasMetadata(item.metadata)) continue;
    const evidenceId =
      typeof item.evidenceId === "string" ? item.evidenceId : "";
    const kind = typeof item.kind === "string" ? item.kind : "";
    const reference = typeof item.reference === "string" ? item.reference : "";
    if (!evidenceId || !reference) continue;
    if (
      kind !== "declared_delegation" &&
      kind !== "delegation_evaluation" &&
      kind !== "delegation_selection" &&
      kind !== "orchestrator_evaluation" &&
      kind !== "orchestrator_plan" &&
      kind !== "policy_decision"
    )
      continue;
    const key = `${kind}\u0000${evidenceId}\u0000${reference}`;
    if (!unique.has(key))
      unique.set(
        key,
        Object.freeze({
          evidenceId,
          kind,
          reference,
          metadata: metadata(item.metadata),
        }),
      );
  }
  const result = [...unique.values()];
  result.sort(compareEvidence);
  return Object.freeze(result);
}

function hasRequiredEvidence(
  value: readonly AutomationOrchestratorDelegationDispatchEvidence[],
): boolean {
  const kinds = new Set<string>();
  for (const item of value) kinds.add(item.kind);
  return (
    kinds.has("declared_delegation") &&
    kinds.has("delegation_evaluation") &&
    kinds.has("delegation_selection") &&
    kinds.has("orchestrator_evaluation") &&
    kinds.has("orchestrator_plan") &&
    kinds.has("policy_decision")
  );
}

function target(
  value: unknown,
): AutomationOrchestratorDelegationDispatchTarget | null {
  if (
    !isRecord(value) ||
    typeof value.targetId !== "string" ||
    !value.targetId ||
    !hasMetadata(value.metadata) ||
    !isRecord(value.selectedCandidate) ||
    !isRecord(value.declaredDelegation)
  )
    return null;
  const candidate = value.selectedCandidate;
  const declared = value.declaredDelegation;
  if (
    typeof candidate.candidateId !== "string" ||
    !candidate.candidateId ||
    typeof declared.delegationId !== "string" ||
    !isRecord(candidate.declaredDelegation) ||
    candidate.declaredDelegation.delegationId !== declared.delegationId ||
    declared.status !== "delegated" ||
    declared.delegationOccurred !== false ||
    declared.providerInvoked !== false ||
    declared.forgeInvoked !== false ||
    declared.executionStarted !== false
  )
    return null;
  const targetEvidence = evidence(value.evidence);
  if (!hasRequiredEvidence(targetEvidence)) return null;
  return Object.freeze({
    targetId: value.targetId,
    selectedCandidate: copyJson(
      candidate,
    ) as AutomationOrchestratorDelegationDispatchTarget["selectedCandidate"],
    declaredDelegation: copyJson(
      declared,
    ) as AutomationOrchestratorDelegationDispatchTarget["declaredDelegation"],
    evidence: targetEvidence,
    metadata: metadata(value.metadata),
  });
}

function decision(
  status: AutomationOrchestratorDelegationDispatchDecision["status"],
  dispatchTarget: AutomationOrchestratorDelegationDispatchTarget | null,
  dispatchEvidence: readonly AutomationOrchestratorDelegationDispatchEvidence[],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationDispatchDecision {
  return Object.freeze({
    status,
    target: dispatchTarget,
    evidence: dispatchEvidence,
    dispatchOccurred: false as const,
    delegationOccurred: false as const,
    providerInvoked: false as const,
    forgeInvoked: false as const,
    executionStarted: false as const,
    metadata: outputMetadata,
  }) as AutomationOrchestratorDelegationDispatchDecision;
}

function failure(
  code: AutomationOrchestratorDelegationDispatchFailure["code"],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationDispatchFailure {
  return Object.freeze({ code, message: code, metadata: outputMetadata });
}

function indeterminate(
  dispatchEvidence: readonly AutomationOrchestratorDelegationDispatchEvidence[],
  code: AutomationOrchestratorDelegationDispatchFailure["code"],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationDispatchResult {
  return Object.freeze({
    status: "indeterminate" as const,
    dispatch: null,
    decision: decision("indeterminate", null, dispatchEvidence, outputMetadata),
    failure: failure(code, outputMetadata),
    metadata: outputMetadata,
  });
}

function dispatch(
  input: AutomationOrchestratorDelegationDispatchInput,
  status: "prepared" | "rejected",
  dispatchTarget: AutomationOrchestratorDelegationDispatchTarget | null,
  dispatchEvidence: readonly AutomationOrchestratorDelegationDispatchEvidence[],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationDispatch {
  return Object.freeze({
    dispatchId: input.dispatchId,
    input: copyJson(input) as AutomationOrchestratorDelegationDispatchInput,
    status,
    target: dispatchTarget,
    evidence: dispatchEvidence,
    metadata: outputMetadata,
  });
}

/** Pure construction of a descriptive dispatch-preparation result. */
export function prepareAutomationOrchestratorDelegationDispatch(
  input: AutomationOrchestratorDelegationDispatchInput,
): AutomationOrchestratorDelegationDispatchResult {
  const source = isRecord(input) ? input : null;
  const outputMetadata = metadata(source?.metadata);
  if (
    source === null ||
    typeof source.dispatchId !== "string" ||
    !source.dispatchId ||
    !hasMetadata(source.metadata) ||
    !isRecord(source.context)
  )
    return indeterminate(Object.freeze([]), "invalid_input", outputMetadata);
  const dispatchEvidence = evidence(source.evidence);
  const selection = source.context.selectionResult;
  if (!isRecord(selection) || !isRecord(selection.decision))
    return indeterminate(dispatchEvidence, "invalid_context", outputMetadata);
  if (
    selection.status === "rejected" ||
    selection.decision.status === "rejected"
  ) {
    const rejected = dispatch(
      input,
      "rejected",
      null,
      dispatchEvidence,
      outputMetadata,
    );
    return Object.freeze({
      status: "rejected" as const,
      dispatch: rejected,
      decision: decision("rejected", null, dispatchEvidence, outputMetadata),
      failure: null,
      metadata: outputMetadata,
    });
  }
  if (
    selection.status !== "selected" ||
    selection.decision.status !== "selected" ||
    !isRecord(selection.decision.candidate)
  )
    return indeterminate(
      dispatchEvidence,
      "selection_indeterminate",
      outputMetadata,
    );
  if (!hasRequiredEvidence(dispatchEvidence))
    return indeterminate(dispatchEvidence, "evidence_missing", outputMetadata);
  const dispatchTarget = target(source.target);
  if (dispatchTarget === null)
    return indeterminate(dispatchEvidence, "target_invalid", outputMetadata);
  const selectedCandidate = selection.decision.candidate;
  if (
    dispatchTarget.selectedCandidate.candidateId !==
      selectedCandidate.candidateId ||
    dispatchTarget.declaredDelegation.delegationId !==
      selectedCandidate.declaredDelegation.delegationId ||
    dispatchTarget.declaredDelegation.input.request.requestId !==
      source.request?.requestId
  )
    return indeterminate(dispatchEvidence, "invalid_context", outputMetadata);
  const prepared = dispatch(
    input,
    "prepared",
    dispatchTarget,
    dispatchEvidence,
    outputMetadata,
  );
  return Object.freeze({
    status: "prepared" as const,
    dispatch: prepared,
    decision: decision(
      "prepared",
      dispatchTarget,
      dispatchEvidence,
      outputMetadata,
    ),
    failure: null,
    metadata: outputMetadata,
  });
}
