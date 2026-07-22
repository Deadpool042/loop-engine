import { createAuthorizationDecision } from "./errors.js";
import { selectCapabilityRequirements } from "./selector.js";
import { includesAll, policySupportsCapabilities } from "./support.js";
import { validateAuthorizationEvaluation } from "./validation.js";
import type {
  AuthorizationDecision,
  AuthorizationEvaluation,
  AuthorizationReason,
  AuthorizationStatus,
  CapabilityEvaluation,
  CapabilityEvaluationResult,
  PolicyDecision,
  PolicyDecisionReason,
  PolicyEvaluation,
} from "./types.js";

export function evaluateCapabilities(
  evaluation: AuthorizationEvaluation,
): CapabilityEvaluationResult {
  const selection = selectCapabilityRequirements(evaluation);
  if (selection.outcome === "rejected") {
    return Object.freeze({
      status: "not_configured",
      evaluations: Object.freeze([]),
      metadata: Object.freeze({ ...evaluation.metadata }),
    });
  }
  const evaluations: CapabilityEvaluation[] = selection.requirements.map(
    (requirement) => {
      const supported = evaluation.policy.capabilitySet.capabilities.includes(
        requirement.id,
      );
      return Object.freeze({
        requirement,
        status: supported ? "supported" : "unsupported",
        reason: supported
          ? `capability ${requirement.id} is declared by policy`
          : `capability ${requirement.id} is not declared by policy`,
      });
    },
  );
  return Object.freeze({
    status: evaluations.every((item) => item.status === "supported")
      ? "supported"
      : "unsupported",
    evaluations: Object.freeze(evaluations),
    metadata: Object.freeze({ ...evaluation.metadata }),
  });
}

function policyResult(
  evaluation: AuthorizationEvaluation,
  reason: PolicyDecisionReason,
): PolicyDecision {
  const status = "denied";
  const item: PolicyEvaluation = Object.freeze({
    policyId: evaluation.policy.id,
    status,
    reason,
  });
  return Object.freeze({
    status,
    evaluations: Object.freeze([item]),
    reason,
    metadata: Object.freeze({ ...evaluation.metadata }),
  });
}

/** Evaluates the static policy in fixed restrictive order. */
export function evaluatePolicies(
  evaluation: AuthorizationEvaluation,
): PolicyDecision {
  const { policy, providerPlan, mapping, intent, protocolPlan } = evaluation;
  if (!policy.enabled) return policyResult(evaluation, "policy_disabled");
  if (!policy.allowedProviders.includes(providerPlan.providerId))
    return policyResult(evaluation, "provider_not_allowed");
  if (!policy.allowedRuntimes.includes(providerPlan.runtimeId))
    return policyResult(evaluation, "runtime_not_allowed");
  if (mapping === undefined || !policy.allowedMappings.includes(mapping.id))
    return policyResult(evaluation, "mapping_not_allowed");
  if (intent === undefined || !policy.allowedIntents.includes(intent.id))
    return policyResult(evaluation, "intent_not_allowed");
  if (!policy.allowedTransports.includes(intent.transportId))
    return policyResult(evaluation, "transport_not_allowed");
  if (
    protocolPlan === undefined ||
    !protocolPlan.validation.valid ||
    !policy.supportedProtocolVersions.includes(
      protocolPlan.request.protocolVersion,
    )
  )
    return policyResult(evaluation, "protocol_not_supported");
  if (!policy.supportedMappingVersions.includes(mapping.protocolVersion))
    return policyResult(evaluation, "mapping_version_not_supported");
  if (!policySupportsCapabilities(policy, intent.requiredCapabilities))
    return policyResult(evaluation, "capability_not_supported");
  if (
    !includesAll(policy.capabilitySet.permissions, intent.requiredPermissions)
  )
    return policyResult(evaluation, "permission_not_allowed");
  const item: PolicyEvaluation = Object.freeze({
    policyId: policy.id,
    status: "allowed",
    reason: "policy_allowed",
  });
  return Object.freeze({
    status: "allowed",
    evaluations: Object.freeze([item]),
    reason: "policy_allowed",
    metadata: Object.freeze({ ...evaluation.metadata }),
  });
}

function decision(
  evaluation: AuthorizationEvaluation,
  status: AuthorizationStatus,
  reason: AuthorizationReason,
  diagnostics: readonly string[],
): AuthorizationDecision {
  const capabilityResult = evaluateCapabilities(evaluation);
  const policyDecision = evaluatePolicies(evaluation);
  const mapping = evaluation.mapping;
  const intent = evaluation.intent;
  const summary = Object.freeze({
    providerCompatible:
      mapping?.providerId === evaluation.providerPlan.providerId &&
      intent?.providerId === evaluation.providerPlan.providerId,
    runtimeCompatible:
      mapping?.runtimeId === evaluation.providerPlan.runtimeId &&
      intent?.runtimeId === evaluation.providerPlan.runtimeId,
    mappingCompatible: mapping?.id === evaluation.mappingResult.mappingId,
    intentCompatible: intent?.id === evaluation.intentResult.intentId,
    transportCompatible:
      intent !== undefined &&
      evaluation.policy.allowedTransports.includes(intent.transportId),
    capabilitiesSupported: capabilityResult.status === "supported",
    permissionsSupported:
      intent !== undefined &&
      includesAll(
        evaluation.policy.capabilitySet.permissions,
        intent.requiredPermissions,
      ),
    policyAllowed: policyDecision.status === "allowed",
  });
  return createAuthorizationDecision(
    evaluation,
    status,
    reason,
    capabilityResult,
    policyDecision,
    summary,
    diagnostics,
  );
}

/**
 * Evaluates only theoretical compatibility. Even an `authorized` result is
 * not executable and cannot construct a Transport request.
 */
export function evaluateAuthorization(
  evaluation: AuthorizationEvaluation,
): AuthorizationDecision {
  const structuralReason = validateAuthorizationEvaluation(evaluation);
  if (structuralReason !== null)
    return decision(evaluation, "not_authorized", structuralReason, [
      structuralReason,
    ]);

  const { mapping, intent, providerPlan, protocolPlan } = evaluation;
  if (mapping === undefined || intent === undefined) {
    return decision(evaluation, "not_authorized", "mapping_mismatch", [
      "mapping or intent is missing",
    ]);
  }
  if (
    mapping.providerId !== providerPlan.providerId ||
    intent.providerId !== providerPlan.providerId
  )
    return decision(evaluation, "unsupported", "provider_mismatch", [
      "provider is incompatible",
    ]);
  if (
    mapping.runtimeId !== providerPlan.runtimeId ||
    intent.runtimeId !== providerPlan.runtimeId
  )
    return decision(evaluation, "unsupported", "runtime_mismatch", [
      "runtime is incompatible",
    ]);
  if (
    protocolPlan === undefined ||
    !protocolPlan.validation.valid ||
    protocolPlan.request.protocolVersion !== mapping.protocolVersion
  )
    return decision(evaluation, "unsupported", "protocol_unsupported", [
      "protocol is unsupported",
    ]);
  if (
    evaluation.mappingVersion !== undefined &&
    evaluation.mappingVersion !== mapping.protocolVersion
  )
    return decision(evaluation, "unsupported", "mapping_version_unsupported", [
      "mapping version is unsupported",
    ]);
  if (!mapping.enabled || !mapping.configured)
    return decision(evaluation, "not_authorized", "mapping_disabled", [
      "mapping is disabled or unconfigured",
    ]);
  if (!intent.active)
    return decision(evaluation, "inactive", "intent_inactive", [
      "intent is inactive",
    ]);
  if (!intent.configured)
    return decision(
      evaluation,
      "configuration_missing",
      "configuration_missing",
      ["intent is unconfigured"],
    );
  if (!evaluation.policy.allowedTransports.includes(intent.transportId))
    return decision(evaluation, "unsupported", "transport_unsupported", [
      "transport is unsupported",
    ]);
  const capabilityResult = evaluateCapabilities(evaluation);
  if (capabilityResult.status !== "supported")
    return decision(evaluation, "unsupported", "capability_unsupported", [
      "capability is unsupported",
    ]);
  if (
    !includesAll(
      evaluation.policy.capabilitySet.permissions,
      intent.requiredPermissions,
    )
  )
    return decision(evaluation, "unsupported", "permission_unsupported", [
      "permission is unsupported",
    ]);
  const policyDecision = evaluatePolicies(evaluation);
  if (policyDecision.status !== "allowed")
    return decision(evaluation, "policy_denied", "policy_denied", [
      policyDecision.reason,
    ]);
  return decision(evaluation, "authorized", "theoretical_authorization", [
    "theoretical authorization only",
  ]);
}
