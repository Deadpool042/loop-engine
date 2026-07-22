import type {
  AuthorizationEvaluation,
  CapabilityRequirement,
  CapabilitySelection,
  PolicyRegistry,
  PolicyRule,
} from "./types.js";
import { POLICY_REGISTRY } from "./registry.js";

/** Pure normalization of the capability requirements declared by an intent. */
export function selectCapabilityRequirements(
  evaluation: AuthorizationEvaluation,
): CapabilitySelection {
  const intent = evaluation.intent;
  if (intent === undefined) {
    return Object.freeze({ outcome: "rejected", reason: "intent is missing" });
  }
  const capabilityIds = [
    ...(evaluation.mapping?.requiredTransportCapabilities ?? []),
    ...intent.requiredCapabilities,
  ].filter((id, index, values) => values.indexOf(id) === index);
  const requirements: CapabilityRequirement[] = capabilityIds.map((id) =>
    Object.freeze({ id, required: true }),
  );
  return Object.freeze({
    outcome: "selected",
    requirements: Object.freeze(requirements),
  });
}

/** Selects the first compatible policy only from static declaration order. */
export function selectPolicyRule(
  evaluation: AuthorizationEvaluation,
  registry: PolicyRegistry = POLICY_REGISTRY,
): PolicyRule {
  return (
    registry.rules.find((rule) => rule.id === evaluation.policy.id) ??
    evaluation.policy
  );
}
