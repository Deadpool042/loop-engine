import type { AutomationMetadata } from "../../types.js";
import type { AutomationPolicyDecision } from "../../policy/index.js";
import type {
  AutomationOrchestratorDelegation,
  AutomationOrchestratorDelegationTarget,
} from "../delegation/index.js";
import type {
  AutomationOrchestratorDelegationEvaluation,
  AutomationOrchestratorDelegationEvaluationDecision,
  AutomationOrchestratorDelegationEvaluationEvidence,
  AutomationOrchestratorDelegationEvaluationFailure,
  AutomationOrchestratorDelegationEvaluationFinding,
  AutomationOrchestratorDelegationEvaluationInput,
  AutomationOrchestratorDelegationEvaluationResult,
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
  left: AutomationOrchestratorDelegationEvaluationEvidence,
  right: AutomationOrchestratorDelegationEvaluationEvidence,
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
  const keys = Object.keys(value).sort(stableCompare);
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    copied[key] =
      descriptor?.value === undefined ? null : copyJson(descriptor.value);
  }
  return Object.freeze(copied);
}

function metadataFrom(value: unknown): AutomationMetadata {
  const metadata = isRecord(value) ? value : {};
  const labels: string[] = [];
  if (Array.isArray(metadata.labels)) {
    for (const label of metadata.labels) {
      if (typeof label === "string") labels.push(label);
    }
  }
  const attributes: Record<string, string> = {};
  if (isRecord(metadata.attributes)) {
    for (const key of Object.keys(metadata.attributes).sort(stableCompare)) {
      const attribute = metadata.attributes[key];
      if (typeof attribute === "string") attributes[key] = attribute;
    }
  }

  return Object.freeze({
    schemaVersion: 1,
    correlationId:
      typeof metadata.correlationId === "string" ? metadata.correlationId : "",
    createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : "",
    labels: Object.freeze([...labels]),
    attributes: Object.freeze(attributes),
  });
}

function copyEvidence(
  value: unknown,
): readonly AutomationOrchestratorDelegationEvaluationEvidence[] {
  if (!Array.isArray(value)) return Object.freeze([]);

  const unique = new Map<
    string,
    AutomationOrchestratorDelegationEvaluationEvidence
  >();
  for (const item of value) {
    if (!isRecord(item)) continue;
    const evidenceId =
      typeof item.evidenceId === "string" ? item.evidenceId : "";
    const kind = typeof item.kind === "string" ? item.kind : "";
    const reference = typeof item.reference === "string" ? item.reference : "";
    if (!evidenceId || !reference) continue;
    if (
      kind !== "declared_delegation" &&
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
          metadata: metadataFrom(item.metadata),
        }),
      );
    }
  }

  const result = [...unique.values()];
  result.sort(compareEvidence);
  return Object.freeze(result);
}

function hasRequiredEvidence(
  evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[],
): boolean {
  const kinds = new Set<string>();
  for (const item of evidence) kinds.add(item.kind);
  return (
    kinds.has("declared_delegation") &&
    kinds.has("orchestrator_evaluation") &&
    kinds.has("orchestrator_plan") &&
    kinds.has("policy_decision")
  );
}

function findings(
  codes: readonly AutomationOrchestratorDelegationEvaluationFinding["code"][],
  evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[],
  metadata: AutomationMetadata,
): readonly AutomationOrchestratorDelegationEvaluationFinding[] {
  const unique = new Set(codes);
  const result: AutomationOrchestratorDelegationEvaluationFinding[] = [];
  for (const code of [...unique].sort(stableCompare)) {
    result.push(
      Object.freeze({
        code,
        message: code,
        evidence,
        metadata,
      }),
    );
  }
  return Object.freeze(result);
}

function isDelegationTarget(
  value: unknown,
): value is AutomationOrchestratorDelegationTarget {
  if (!isRecord(value)) return false;
  if (value.kind === "provider") {
    return typeof value.providerId === "string" && Boolean(value.providerId);
  }
  if (value.kind === "forge") {
    return typeof value.forgeId === "string" && Boolean(value.forgeId);
  }
  return false;
}

function policyDecision(value: unknown): AutomationPolicyDecision | null {
  if (!isRecord(value)) return null;
  if (
    (value.status !== "allowed" && value.status !== "denied") ||
    typeof value.policyId !== "string" ||
    typeof value.capability !== "string" ||
    typeof value.reason !== "string"
  ) {
    return null;
  }
  return copyJson(value) as AutomationPolicyDecision;
}

function declaredDelegation(
  value: unknown,
): AutomationOrchestratorDelegation | null {
  if (!isRecord(value) || typeof value.delegationId !== "string") return null;
  if (
    !isRecord(value.input) ||
    value.input.delegationId !== value.delegationId
  ) {
    return null;
  }
  if (!isDelegationTarget(value.input.target)) return null;
  if (
    value.delegationOccurred !== false ||
    value.providerInvoked !== false ||
    value.forgeInvoked !== false ||
    value.executionStarted !== false
  ) {
    return null;
  }
  return copyJson(value) as AutomationOrchestratorDelegation;
}

function failure(
  code: AutomationOrchestratorDelegationEvaluationFailure["code"],
  metadata: AutomationMetadata,
): AutomationOrchestratorDelegationEvaluationFailure {
  return Object.freeze({ code, message: code, metadata });
}

function indeterminate(
  input: unknown,
  delegation: AutomationOrchestratorDelegation | null,
  decision: AutomationPolicyDecision | null,
  evidence: readonly AutomationOrchestratorDelegationEvaluationEvidence[],
  codes: readonly AutomationOrchestratorDelegationEvaluationFinding["code"][],
  failureCode: AutomationOrchestratorDelegationEvaluationFailure["code"],
  metadata: AutomationMetadata,
): AutomationOrchestratorDelegationEvaluationResult {
  const evaluation = isRecord(input)
    ? (Object.freeze({
        evaluationId:
          typeof input.evaluationId === "string" ? input.evaluationId : "",
        input: copyJson(
          input,
        ) as AutomationOrchestratorDelegationEvaluationInput,
        status: "indeterminate" as const,
        findings: findings(codes, evidence, metadata),
        evidence,
        metadata,
      }) as AutomationOrchestratorDelegationEvaluation)
    : null;

  return Object.freeze({
    status: "indeterminate" as const,
    evaluation,
    decision: Object.freeze({
      status: "indeterminate" as const,
      declaredDelegation: delegation,
      policyDecision: decision,
      evidence,
      delegationOccurred: false as const,
      providerInvoked: false as const,
      forgeInvoked: false as const,
      executionStarted: false as const,
      metadata,
    }),
    failure: failure(failureCode, metadata),
    metadata,
  });
}

/**
 * Pure, deterministic eligibility evaluation for an already declared
 * delegation. Eligibility remains a descriptive result and crosses no boundary.
 */
export function evaluateAutomationOrchestratorDelegation(
  input: AutomationOrchestratorDelegationEvaluationInput,
): AutomationOrchestratorDelegationEvaluationResult {
  const inputRecord = isRecord(input) ? input : null;
  const metadata = metadataFrom(inputRecord?.metadata);
  if (inputRecord === null || typeof inputRecord.evaluationId !== "string") {
    return indeterminate(
      input,
      null,
      null,
      Object.freeze([]),
      ["input_invalid", "eligibility_indeterminate"],
      "invalid_input",
      metadata,
    );
  }

  const context = isRecord(inputRecord.context) ? inputRecord.context : null;
  const evidence = copyEvidence(inputRecord.evidence);
  const delegation = declaredDelegation(context?.declaredDelegation);
  const decision = policyDecision(context?.policyDecision);
  if (context === null || delegation === null) {
    return indeterminate(
      inputRecord,
      delegation,
      decision,
      evidence,
      [
        "context_invalid",
        "declared_delegation_invalid",
        "eligibility_indeterminate",
      ],
      "declared_delegation_invalid",
      metadata,
    );
  }
  if (!hasRequiredEvidence(evidence)) {
    return indeterminate(
      inputRecord,
      delegation,
      decision,
      evidence,
      ["evidence_missing", "eligibility_indeterminate"],
      "evidence_missing",
      metadata,
    );
  }
  if (decision?.status === "denied") {
    const evaluation = Object.freeze({
      evaluationId: inputRecord.evaluationId,
      input: copyJson(
        inputRecord,
      ) as AutomationOrchestratorDelegationEvaluationInput,
      status: "denied" as const,
      findings: findings(["policy_denied"], evidence, metadata),
      evidence,
      metadata,
    }) as AutomationOrchestratorDelegationEvaluation;

    return Object.freeze({
      status: "denied" as const,
      evaluation,
      decision: Object.freeze({
        status: "denied" as const,
        declaredDelegation: delegation,
        policyDecision: decision,
        evidence,
        delegationOccurred: false as const,
        providerInvoked: false as const,
        forgeInvoked: false as const,
        executionStarted: false as const,
        metadata,
      }),
      failure: null,
      metadata,
    });
  }
  if (
    decision?.status !== "allowed" ||
    !isRecord(context.orchestratorEvaluationResult) ||
    context.orchestratorEvaluationResult.status !== "evaluated" ||
    !isRecord(context.planResult) ||
    context.planResult.status !== "planned" ||
    !isRecord(inputRecord.request) ||
    !isRecord(delegation.input.request) ||
    inputRecord.request.requestId !== delegation.input.request.requestId
  ) {
    return indeterminate(
      inputRecord,
      delegation,
      decision,
      evidence,
      ["context_invalid", "eligibility_indeterminate"],
      "invalid_context",
      metadata,
    );
  }

  const evaluation = Object.freeze({
    evaluationId: inputRecord.evaluationId,
    input: copyJson(
      inputRecord,
    ) as AutomationOrchestratorDelegationEvaluationInput,
    status: "eligible" as const,
    findings: Object.freeze([]),
    evidence,
    metadata,
  }) as AutomationOrchestratorDelegationEvaluation;
  const decisionResult: AutomationOrchestratorDelegationEvaluationDecision =
    Object.freeze({
      status: "eligible" as const,
      declaredDelegation: delegation,
      policyDecision: decision,
      evidence,
      delegationOccurred: false as const,
      providerInvoked: false as const,
      forgeInvoked: false as const,
      executionStarted: false as const,
      metadata,
    });

  return Object.freeze({
    status: "eligible" as const,
    evaluation,
    decision: decisionResult,
    failure: null,
    metadata,
  });
}
