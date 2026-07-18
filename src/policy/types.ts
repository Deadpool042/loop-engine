// Agent Policy Engine (V7.4) — local, deterministic types only.
// No network calls, no provider SDK, no execute mode. See
// docs/architecture/agent-policy-engine.md.
//
// Dependency direction: src/policy/ may depend on src/agents/ (consumes the
// selector/registry vocabulary) and, read-only, on src/intelligence/roadmap.js
// (the RoadmapCandidate type — the same dependency src/loop/types.ts already
// has). src/policy/ never depends on src/loop/, src/commands/, or
// src/cli.ts: the LoopRunner consumes this module, never the reverse.

import type {
  AgentBudget,
  AgentCapability,
  AgentEffort,
  AgentPermission,
  AgentProvider,
  AgentRuntime,
} from "../agents/types.js";
import type {
  ExecutableMappingId,
  ExecutableMappingResult,
} from "../providers/mapping/types.js";
import type {
  ProviderExecutionPlan,
  ProviderId,
  ProviderMetadata,
} from "../providers/types.js";
import type { OpenClawProtocolPlan } from "../providers/openclaw/types.js";
import type {
  TransportIntent,
  TransportIntentId,
  TransportIntentResult,
} from "../providers/intent/types.js";
import type { RuntimeId } from "../runtime/types.js";
import type { TransportId } from "../transports/types.js";
import type {
  AgentSelectionRequest,
  AgentSelectionResult,
} from "../agents/selector.js";

// Mirrors LoopRunMode (src/loop/types.ts) structurally without importing it,
// so src/policy/ stays independent of src/loop/. Both unions must be kept in
// sync by hand; a mismatch would surface immediately as a type error at the
// single call site in src/loop/runner.ts.
export const AGENT_POLICY_MODES = [
  "plan",
  "execute",
  "commit",
  "publish",
] as const;

export type AgentPolicyMode = (typeof AGENT_POLICY_MODES)[number];

export const LOOP_TASK_CATEGORIES = [
  "documentation",
  "code",
  "tests",
  "validation",
  "architecture",
  "review",
  "none",
] as const;

export type LoopTaskCategory = (typeof LOOP_TASK_CATEGORIES)[number];

export type ContextBudget = Readonly<{
  maxFiles: number;
  maxCharacters: number;
  maxEstimatedTokens: number;
  includeFullFiles: boolean;
}>;

export type LoopTaskRequirements = Readonly<{
  category: LoopTaskCategory;
  mode: AgentPolicyMode;
  requiredCapabilities: readonly AgentCapability[];
  requiredPermissions: readonly AgentPermission[];
  minimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  preferredProviders?: readonly AgentProvider[];
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  contextBudget: ContextBudget;
  executionBudget: AgentBudget;
  rationale: readonly string[];
}>;

export type AgentPolicy = Readonly<{
  id: string;
  enabled: boolean;
  defaultMinimumEffort: AgentEffort;
  maximumEffort: AgentEffort;
  defaultBudget: AgentBudget;
  contextBudget: ContextBudget;
  allowedProviders?: readonly AgentProvider[];
  allowedRuntimes?: readonly AgentRuntime[];
  deniedPermissions?: readonly AgentPermission[];
  // Never grants git_tag implicitly (see AGENT_PERMISSIONS in
  // src/agents/types.ts). Only consulted in mode "publish"; false by default.
  allowTagCreation?: boolean;
  allowEscalation: boolean;
}>;

// Caller-supplied (e.g. n8n) request to narrow a resolution. Every field is
// optional and can only ever *restrict* what the policy already allows —
// see mergeBudgetsRestrictively/mergeAllowedProviders/mergeAllowedRuntimes/
// restrictMaximumEffort in defaults.ts. None of these fields can widen a
// policy's global ceiling.
export type AgentPolicyRequest = Readonly<{
  requestedBudget?: Partial<AgentBudget>;
  requestedMaxEffort?: AgentEffort;
  requestedProviders?: readonly AgentProvider[];
  requestedRuntimes?: readonly AgentRuntime[];
}>;

export const AGENT_POLICY_STATUS_CODES = [
  "resolved",
  "no_safe_candidate",
  "no_compatible_agent",
  "policy_disabled",
  "permission_denied",
  "budget_exhausted",
  "effort_not_supported",
  "provider_not_allowed",
  "runtime_not_allowed",
] as const;

export type AgentPolicyStatusCode = (typeof AGENT_POLICY_STATUS_CODES)[number];

export type AgentPolicyResolution = Readonly<{
  policyId: string;
  mode: AgentPolicyMode;
  status: AgentPolicyStatusCode;
  requirements: LoopTaskRequirements;
  selectionRequest: AgentSelectionRequest;
  // Always computed when a selection was attempted, even in mode "plan" —
  // this is the forecast/preview described in
  // docs/architecture/agent-policy-engine.md. Never used to invoke an agent.
  selection: AgentSelectionResult | null;
  reasons: readonly string[];
}>;

// Capability & Policy Engine (V10.7). These contracts are a separate,
// default-deny decision boundary for declarative transport intents. They do
// not create a transport payload and are not connected to any adapter.
export type CapabilityId = AgentCapability;
export type CapabilityEvaluationMetadata = ProviderMetadata;

export type CapabilityRequirement = Readonly<{
  id: CapabilityId;
  required: true;
}>;

export type CapabilitySet = Readonly<{
  capabilities: readonly CapabilityId[];
  permissions: readonly AgentPermission[];
}>;

export const CAPABILITY_EVALUATION_STATUSES = [
  "supported",
  "unsupported",
  "not_configured",
] as const;

export type CapabilityEvaluationStatus =
  (typeof CAPABILITY_EVALUATION_STATUSES)[number];

export type CapabilityEvaluation = Readonly<{
  requirement: CapabilityRequirement;
  status: CapabilityEvaluationStatus;
  reason: string;
}>;

export type CapabilityEvaluationResult = Readonly<{
  status: CapabilityEvaluationStatus;
  evaluations: readonly CapabilityEvaluation[];
  metadata: CapabilityEvaluationMetadata;
}>;

export type CapabilityRegistry = Readonly<{
  capabilityIds: readonly CapabilityId[];
}>;

export type CapabilitySelection =
  | Readonly<{
      outcome: "selected";
      requirements: readonly CapabilityRequirement[];
    }>
  | Readonly<{ outcome: "rejected"; reason: string }>;

export type CapabilityResolution = Readonly<{
  selection: CapabilitySelection;
  result: CapabilityEvaluationResult;
}>;

export type PolicyId = string;
export type PolicyMetadata = ProviderMetadata;

/**
 * Static policy input for a theoretical authorization. Empty allow-lists and
 * a disabled rule are intentional default-deny values.
 */
export type PolicyRule = Readonly<{
  id: PolicyId;
  enabled: boolean;
  allowedProviders: readonly ProviderId[];
  allowedRuntimes: readonly RuntimeId[];
  allowedMappings: readonly ExecutableMappingId[];
  allowedIntents: readonly TransportIntentId[];
  allowedTransports: readonly TransportId[];
  supportedProtocolVersions: readonly string[];
  supportedMappingVersions: readonly string[];
  capabilitySet: CapabilitySet;
}>;

export const POLICY_DECISION_STATUSES = ["allowed", "denied"] as const;
export type PolicyDecisionStatus = (typeof POLICY_DECISION_STATUSES)[number];

export const POLICY_DECISION_REASONS = [
  "policy_allowed",
  "policy_disabled",
  "provider_not_allowed",
  "runtime_not_allowed",
  "mapping_not_allowed",
  "intent_not_allowed",
  "transport_not_allowed",
  "protocol_not_supported",
  "mapping_version_not_supported",
  "capability_not_supported",
  "permission_not_allowed",
] as const;

export type PolicyDecisionReason = (typeof POLICY_DECISION_REASONS)[number];

export type PolicyEvaluation = Readonly<{
  policyId: PolicyId;
  status: PolicyDecisionStatus;
  reason: PolicyDecisionReason;
}>;

export type PolicyDecision = Readonly<{
  status: PolicyDecisionStatus;
  evaluations: readonly PolicyEvaluation[];
  reason: PolicyDecisionReason;
  metadata: PolicyMetadata;
}>;

export type PolicyEvaluationResult = PolicyDecision;

export type PolicyRegistry = Readonly<{
  rules: readonly PolicyRule[];
}>;

export const AUTHORIZATION_STATUSES = [
  "authorized",
  "not_authorized",
  "unsupported",
  "inactive",
  "disabled",
  "policy_denied",
  "configuration_missing",
] as const;

export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const AUTHORIZATION_REASONS = [
  "theoretical_authorization",
  "provider_mismatch",
  "runtime_mismatch",
  "mapping_mismatch",
  "intent_mismatch",
  "transport_unsupported",
  "protocol_unsupported",
  "mapping_version_unsupported",
  "capability_unsupported",
  "permission_unsupported",
  "mapping_disabled",
  "intent_inactive",
  "configuration_missing",
  "policy_denied",
] as const;

export type AuthorizationReason = (typeof AUTHORIZATION_REASONS)[number];

export type AuthorizationEvaluation = Readonly<{
  providerPlan: ProviderExecutionPlan;
  mappingResult: ExecutableMappingResult;
  intentResult: TransportIntentResult;
  protocolPlan?: OpenClawProtocolPlan;
  mappingVersion?: string;
  policy: PolicyRule;
  metadata: PolicyMetadata;
  mapping?: Readonly<{
    id: ExecutableMappingId;
    providerId: ProviderId;
    runtimeId: RuntimeId;
    protocolVersion: string;
    enabled: boolean;
    configured: boolean;
    requiredTransportCapabilities: readonly CapabilityId[];
  }>;
  intent?: TransportIntent;
}>;

export type AuthorizationSummary = Readonly<{
  providerCompatible: boolean;
  runtimeCompatible: boolean;
  mappingCompatible: boolean;
  intentCompatible: boolean;
  transportCompatible: boolean;
  capabilitiesSupported: boolean;
  permissionsSupported: boolean;
  policyAllowed: boolean;
}>;

export type AuthorizationDecision = Readonly<{
  status: AuthorizationStatus;
  reason: AuthorizationReason;
  evaluation: AuthorizationEvaluation;
  summary: AuthorizationSummary;
  capabilityResult: CapabilityEvaluationResult;
  policyDecision: PolicyDecision;
  diagnostics: readonly string[];
  executionStarted: false;
}>;
