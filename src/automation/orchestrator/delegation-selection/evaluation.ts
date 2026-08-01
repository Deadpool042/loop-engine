import type { AutomationMetadata } from "../../types.js";
import type {
  AutomationOrchestratorDelegation,
  AutomationOrchestratorDelegationTarget,
} from "../delegation/index.js";
import type { AutomationOrchestratorDelegationEvaluationResult } from "../delegation-evaluation/index.js";
import type {
  AutomationOrchestratorDelegationSelection,
  AutomationOrchestratorDelegationSelectionCandidate,
  AutomationOrchestratorDelegationSelectionDecision,
  AutomationOrchestratorDelegationSelectionEvidence,
  AutomationOrchestratorDelegationSelectionFailure,
  AutomationOrchestratorDelegationSelectionInput,
  AutomationOrchestratorDelegationSelectionResult,
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

function compareEvidence(
  left: AutomationOrchestratorDelegationSelectionEvidence,
  right: AutomationOrchestratorDelegationSelectionEvidence,
): number {
  return stableCompare(
    `${left.kind}\u0000${left.evidenceId}\u0000${left.reference}`,
    `${right.kind}\u0000${right.evidenceId}\u0000${right.reference}`,
  );
}

function copyJson(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    const copied: unknown[] = [];
    for (const item of value) copied.push(copyJson(item));
    return Object.freeze(copied);
  }
  if (!isRecord(value)) return null;

  const copied: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(stableCompare)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
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
    for (const label of source.labels) {
      if (typeof label === "string") labels.push(label);
    }
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

function copyEvidence(
  value: unknown,
): readonly AutomationOrchestratorDelegationSelectionEvidence[] {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = new Map<
    string,
    AutomationOrchestratorDelegationSelectionEvidence
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
      kind !== "orchestrator_evaluation" &&
      kind !== "orchestrator_plan" &&
      kind !== "policy_decision"
    ) {
      continue;
    }
    const key = `${kind}\u0000${evidenceId}\u0000${reference}`;
    if (!unique.has(key)) {
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
  }
  const result = [...unique.values()];
  result.sort(compareEvidence);
  return Object.freeze(result);
}

function hasRequiredEvidence(
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[],
): boolean {
  const kinds = new Set<string>();
  for (const item of evidence) kinds.add(item.kind);
  return (
    kinds.has("declared_delegation") &&
    kinds.has("delegation_evaluation") &&
    kinds.has("orchestrator_evaluation") &&
    kinds.has("orchestrator_plan") &&
    kinds.has("policy_decision")
  );
}

function target(
  value: unknown,
): value is AutomationOrchestratorDelegationTarget {
  return (
    isRecord(value) &&
    ((value.kind === "provider" &&
      typeof value.providerId === "string" &&
      value.providerId.length > 0) ||
      (value.kind === "forge" &&
        typeof value.forgeId === "string" &&
        value.forgeId.length > 0))
  );
}

function candidateKey(
  candidate: AutomationOrchestratorDelegationSelectionCandidate,
): string {
  const declared = candidate.declaredDelegation;
  const targetValue = declared.input.target;
  const targetId =
    targetValue.kind === "provider"
      ? targetValue.providerId
      : targetValue.forgeId;
  return `${candidate.candidateId}\u0000${declared.delegationId}\u0000${targetValue.kind}\u0000${targetId}`;
}

function compareCandidate(
  left: AutomationOrchestratorDelegationSelectionCandidate,
  right: AutomationOrchestratorDelegationSelectionCandidate,
): number {
  return stableCompare(candidateKey(left), candidateKey(right));
}

function candidate(
  value: unknown,
): AutomationOrchestratorDelegationSelectionCandidate | null {
  if (
    !isRecord(value) ||
    typeof value.candidateId !== "string" ||
    !value.candidateId
  ) {
    return null;
  }
  if (!hasMetadata(value.metadata) || !isRecord(value.declaredDelegation))
    return null;
  const declared = value.declaredDelegation;
  if (
    declared.status !== "delegated" ||
    typeof declared.delegationId !== "string" ||
    !isRecord(declared.input) ||
    declared.input.delegationId !== declared.delegationId ||
    !target(declared.input.target) ||
    declared.delegationOccurred !== false ||
    declared.providerInvoked !== false ||
    declared.forgeInvoked !== false ||
    declared.executionStarted !== false
  ) {
    return null;
  }
  const evidence = copyEvidence(value.evidence);
  if (!hasRequiredEvidence(evidence)) return null;
  return Object.freeze({
    candidateId: value.candidateId,
    declaredDelegation: copyJson(declared) as AutomationOrchestratorDelegation,
    evidence,
    metadata: metadata(value.metadata),
  });
}

function failure(
  code: AutomationOrchestratorDelegationSelectionFailure["code"],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationSelectionFailure {
  return Object.freeze({ code, message: code, metadata: outputMetadata });
}

function decision(
  status: AutomationOrchestratorDelegationSelectionDecision["status"],
  selectedCandidate: AutomationOrchestratorDelegationSelectionCandidate | null,
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationSelectionDecision {
  return Object.freeze({
    status,
    candidate: selectedCandidate,
    evidence,
    delegationOccurred: false as const,
    providerInvoked: false as const,
    forgeInvoked: false as const,
    executionStarted: false as const,
    metadata: outputMetadata,
  }) as AutomationOrchestratorDelegationSelectionDecision;
}

function indeterminate(
  input: unknown,
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[],
  code: AutomationOrchestratorDelegationSelectionFailure["code"],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationSelectionResult {
  return Object.freeze({
    status: "indeterminate" as const,
    selection: null,
    decision: decision("indeterminate", null, evidence, outputMetadata),
    failure: failure(code, outputMetadata),
    metadata: outputMetadata,
  });
}

function selection(
  input: AutomationOrchestratorDelegationSelectionInput,
  status: "selected" | "rejected",
  candidates: readonly AutomationOrchestratorDelegationSelectionCandidate[],
  evidence: readonly AutomationOrchestratorDelegationSelectionEvidence[],
  outputMetadata: AutomationMetadata,
): AutomationOrchestratorDelegationSelection {
  return Object.freeze({
    selectionId: input.selectionId,
    input: copyJson(input) as AutomationOrchestratorDelegationSelectionInput,
    status,
    candidates,
    evidence,
    metadata: outputMetadata,
  });
}

/**
 * Pure declarative selection. Valid candidates are ordered lexicographically
 * by candidateId, delegationId, target kind, then target identifier.
 */
export function evaluateAutomationOrchestratorDelegationSelection(
  input: AutomationOrchestratorDelegationSelectionInput,
): AutomationOrchestratorDelegationSelectionResult {
  const source = isRecord(input) ? input : null;
  const outputMetadata = metadata(source?.metadata);
  if (
    source === null ||
    typeof source.selectionId !== "string" ||
    !source.selectionId ||
    !hasMetadata(source.metadata) ||
    !isRecord(source.context)
  ) {
    return indeterminate(
      input,
      Object.freeze([]),
      "invalid_input",
      outputMetadata,
    );
  }

  const evidence = copyEvidence(source.evidence);
  const evaluation = source.context
    .delegationEvaluationResult as AutomationOrchestratorDelegationEvaluationResult;
  if (!isRecord(evaluation) || !isRecord(evaluation.decision)) {
    return indeterminate(input, evidence, "invalid_context", outputMetadata);
  }
  if (
    evaluation.status === "denied" ||
    evaluation.decision.status === "denied"
  ) {
    const rejected = selection(
      input,
      "rejected",
      Object.freeze([]),
      evidence,
      outputMetadata,
    );
    return Object.freeze({
      status: "rejected" as const,
      selection: rejected,
      decision: decision("rejected", null, evidence, outputMetadata),
      failure: null,
      metadata: outputMetadata,
    });
  }
  if (
    evaluation.status !== "eligible" ||
    evaluation.decision.status !== "eligible"
  ) {
    return indeterminate(
      input,
      evidence,
      "delegation_evaluation_indeterminate",
      outputMetadata,
    );
  }
  if (!hasRequiredEvidence(evidence) || !Array.isArray(source.candidates)) {
    return indeterminate(input, evidence, "evidence_missing", outputMetadata);
  }
  if (source.candidates.length === 0) {
    return indeterminate(input, evidence, "candidate_missing", outputMetadata);
  }

  const valid: AutomationOrchestratorDelegationSelectionCandidate[] = [];
  for (const value of source.candidates) {
    const resolved = candidate(value);
    if (resolved === null) {
      return indeterminate(
        input,
        evidence,
        "candidate_invalid",
        outputMetadata,
      );
    }
    if (
      resolved.declaredDelegation.delegationId !==
        evaluation.decision.declaredDelegation.delegationId ||
      resolved.declaredDelegation.input.request.requestId !==
        source.request?.requestId
    ) {
      continue;
    }
    valid.push(resolved);
  }
  valid.sort(compareCandidate);
  const unique: AutomationOrchestratorDelegationSelectionCandidate[] = [];
  const keys = new Set<string>();
  for (const resolved of valid) {
    const key = candidateKey(resolved);
    if (!keys.has(key)) {
      keys.add(key);
      unique.push(resolved);
    }
  }
  if (unique.length === 0) {
    const rejected = selection(
      input,
      "rejected",
      Object.freeze([]),
      evidence,
      outputMetadata,
    );
    return Object.freeze({
      status: "rejected" as const,
      selection: rejected,
      decision: decision("rejected", null, evidence, outputMetadata),
      failure: null,
      metadata: outputMetadata,
    });
  }

  const candidates = Object.freeze(unique);
  const selectedCandidate = candidates[0]!;
  const selected = selection(
    input,
    "selected",
    candidates,
    evidence,
    outputMetadata,
  );
  return Object.freeze({
    status: "selected" as const,
    selection: selected,
    decision: decision("selected", selectedCandidate, evidence, outputMetadata),
    failure: null,
    metadata: outputMetadata,
  });
}
