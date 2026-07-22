import type { LoopRunResult } from "../loop/types.js";
import {
  compareAgentEffort,
  type AgentBudget,
  type AgentEffort,
  type AgentProvider,
} from "../agents/types.js";
import { mergeBudgetsRestrictively, toBudget } from "../policy/index.js";
import type { AgentPolicyResolution } from "../policy/index.js";
import {
  createRuntimeRequest,
  executeRuntime,
  resolveRuntime,
  type CreateRuntimeRequestOptions,
} from "./runtime.js";
import type {
  RuntimeId,
  LocalProcessRuntimeRequest,
  RuntimeMetadata,
  RuntimeRequest,
  RuntimeResult,
} from "../runtime/index.js";
import { LOCAL_PROCESS_RUNTIME_ID } from "../runtime/index.js";
import type { RuntimeCapabilityInput } from "./runtime-capability.js";
import type { RuntimeRegistryInput as DeclarativeRuntimeRegistryInput } from "./runtime-registry.js";
import type { RuntimeRequestInput as DeclarativeRuntimeRequestInput } from "./runtime-request.js";
import { validateRuntimeRequest as validateDeclarativeRuntimeRequest } from "./runtime-request.js";
import {
  selectRuntimeByCapabilities,
  type RuntimeCapabilitySelectionResult,
} from "./runtime-resolution.js";

export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_ERROR_CODES = [
  "declarative_runtime_request_invalid",
  "declarative_runtime_no_compatible_descriptor",
  "declarative_runtime_v10_mapping_missing",
  "v10_runtime_request_unavailable",
  "v10_runtime_unresolved",
  "v10_runtime_execution_failed",
  "runtime_execution_plan_unserializable",
  "runtime_execution_receipt_inconsistent",
  "runtime_execution_receipt_unserializable",
  "runtime_execution_local_process_binding_required",
  "runtime_execution_local_process_binding_unexpected",
] as const;

export type DeclarativeRuntimeExecutionBridgeErrorCode =
  (typeof DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_ERROR_CODES)[number];

export type DeclarativeRuntimeExecutionBridgeError = Readonly<{
  code: DeclarativeRuntimeExecutionBridgeErrorCode;
  message: string;
  details: Readonly<Record<string, unknown>>;
}>;

export const RUNTIME_EXECUTION_ADMISSION_ERROR_CODES = [
  "runtime_execution_policy_not_resolved",
  "runtime_execution_runtime_not_allowed",
  "runtime_execution_provider_not_allowed",
  "runtime_execution_provider_unverifiable",
  "runtime_execution_effort_exceeds_maximum",
  "runtime_execution_budget_exceeded",
  "runtime_execution_admission_input_inconsistent",
] as const;

export type RuntimeExecutionAdmissionErrorCode =
  (typeof RUNTIME_EXECUTION_ADMISSION_ERROR_CODES)[number];

export type RuntimeExecutionAdmissionError = Readonly<{
  code: RuntimeExecutionAdmissionErrorCode;
  message: string;
  details: Readonly<Record<string, unknown>>;
}>;

export const RUNTIME_EXECUTION_ADMISSION_CHECKS = [
  "policy",
  "runtime",
  "provider",
  "effort",
  "budget",
] as const;

export type RuntimeExecutionAdmissionCheckName =
  (typeof RUNTIME_EXECUTION_ADMISSION_CHECKS)[number];

export type RuntimeExecutionAdmissionCheckStatus =
  | "passed"
  | "failed"
  | "not_applicable"
  | "not_available";

export type RuntimeExecutionAdmissionCheck = Readonly<{
  name: RuntimeExecutionAdmissionCheckName;
  status: RuntimeExecutionAdmissionCheckStatus;
  message: string;
  details: Readonly<Record<string, unknown>>;
}>;

export type RuntimeExecutionAdmissionInput = Readonly<{
  runtimeId: RuntimeId;
  policy: AgentPolicyResolution;
  provider?: AgentProvider;
  effort?: AgentEffort;
  budget?: Partial<AgentBudget>;
}>;

export type RuntimeExecutionAdmissionResult =
  | Readonly<{
      outcome: "admitted";
      admitted: true;
      checks: readonly RuntimeExecutionAdmissionCheck[];
      diagnostics: readonly RuntimeExecutionAdmissionError[];
    }>
  | Readonly<{
      outcome: "denied";
      admitted: false;
      reason: RuntimeExecutionAdmissionErrorCode;
      checks: readonly RuntimeExecutionAdmissionCheck[];
      diagnostics: readonly RuntimeExecutionAdmissionError[];
    }>;

export type DeclarativeRuntimeExecutionMapping = Readonly<
  Record<string, RuntimeId>
>;

export type DeclarativeRuntimeExecutionRequestOptions = Omit<
  CreateRuntimeRequestOptions,
  "requestedRuntime"
>;

export type DeclarativeRuntimeExecutionBridgeInput = Readonly<{
  declarativeRequest: DeclarativeRuntimeRequestInput;
  declarativeRegistry: DeclarativeRuntimeRegistryInput;
  runtimeCapabilities: readonly RuntimeCapabilityInput[];
  runtimeMapping: DeclarativeRuntimeExecutionMapping;
  loopRunResult: LoopRunResult;
  runtimeRequestOptions?: DeclarativeRuntimeExecutionRequestOptions;
}>;

export type RuntimeExecutionPolicyAdmissionOptions = Readonly<{
  policy: AgentPolicyResolution;
  provider?: AgentProvider;
  effort?: AgentEffort;
  budget?: Partial<AgentBudget>;
}>;

export type PolicyAwareDeclarativeRuntimeExecutionBridgeInput =
  DeclarativeRuntimeExecutionBridgeInput &
    Readonly<{
      admission: RuntimeExecutionPolicyAdmissionOptions;
    }>;

/**
 * Explicit process authority supplied by the caller of the opt-in bridge.
 * It is deliberately separate from AgentPolicyResolution: agent selection
 * admits the runtime, while this policy bounds the actual local effect.
 */
export type LocalProcessExecutionBinding = Readonly<{
  localProcess: LocalProcessRuntimeRequest;
}>;

export type PolicyBoundLocalProcessBridgeInput = Omit<
  PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
  "runtimeRequestOptions"
> &
  Readonly<{
    runtimeRequestOptions?: Omit<
      DeclarativeRuntimeExecutionRequestOptions,
      "localProcess"
    >;
    localProcessBinding?: LocalProcessExecutionBinding;
  }>;

export type DeclarativeRuntimeV10Resolution = Readonly<{
  outcome: "selected";
  runtimeId: RuntimeId;
}>;

export type DeclarativeRuntimeUnsupportedV10Resolution = Readonly<{
  outcome: "unsupported";
  runtimeId: RuntimeId | null;
  reason: string;
}>;

export type DeclarativeRuntimeExecutionResolution =
  | Readonly<{
      outcome: "resolved";
      descriptorId: string;
      runtimeId: RuntimeId;
      declarativeSelection: RuntimeCapabilitySelectionResult;
      runtimeRequest: RuntimeRequest;
      v10Resolution: DeclarativeRuntimeV10Resolution;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>
  | Readonly<{
      outcome:
        | "invalid_declarative_request"
        | "no_compatible_descriptor"
        | "missing_v10_mapping"
        | "unavailable_v10_request"
        | "unresolved_v10_runtime";
      descriptorId: string | null;
      runtimeId: RuntimeId | null;
      declarativeSelection: RuntimeCapabilitySelectionResult | null;
      runtimeRequest: RuntimeRequest | null;
      v10Resolution: DeclarativeRuntimeUnsupportedV10Resolution | null;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>;

export type DeclarativeRuntimeExecutionResult =
  | Readonly<{
      outcome: "success";
      resolution: Extract<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: RuntimeResult;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>
  | Readonly<{
      outcome: "resolution_failed";
      resolution: Exclude<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: null;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>
  | Readonly<{
      outcome: "v10_execution_failed";
      resolution: Extract<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: RuntimeResult;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>;

export type PolicyAwareDeclarativeRuntimeExecutionResolution =
  | Readonly<{
      outcome: "resolved";
      descriptorId: string;
      runtimeId: RuntimeId;
      declarativeSelection: RuntimeCapabilitySelectionResult;
      admission: Extract<
        RuntimeExecutionAdmissionResult,
        { outcome: "admitted" }
      >;
      runtimeRequest: RuntimeRequest;
      v10Resolution: DeclarativeRuntimeV10Resolution;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>
  | Readonly<{
      outcome: "admission_denied";
      descriptorId: string;
      runtimeId: RuntimeId;
      declarativeSelection: RuntimeCapabilitySelectionResult;
      admission: Extract<
        RuntimeExecutionAdmissionResult,
        { outcome: "denied" }
      >;
      runtimeRequest: null;
      v10Resolution: null;
      diagnostics: readonly RuntimeExecutionAdmissionError[];
    }>
  | Readonly<{
      outcome:
        | "invalid_declarative_request"
        | "no_compatible_descriptor"
        | "missing_v10_mapping"
        | "unavailable_v10_request"
        | "unresolved_v10_runtime";
      descriptorId: string | null;
      runtimeId: RuntimeId | null;
      declarativeSelection: RuntimeCapabilitySelectionResult | null;
      admission: null;
      runtimeRequest: RuntimeRequest | null;
      v10Resolution: DeclarativeRuntimeUnsupportedV10Resolution | null;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>;

export type PolicyAwareDeclarativeRuntimeExecutionResult =
  | Readonly<{
      outcome: "success";
      resolution: Extract<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: RuntimeResult;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>
  | Readonly<{
      outcome: "resolution_failed";
      resolution: Exclude<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: null;
      diagnostics: readonly (
        | DeclarativeRuntimeExecutionBridgeError
        | RuntimeExecutionAdmissionError
      )[];
    }>
  | Readonly<{
      outcome: "v10_execution_failed";
      resolution: Extract<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: RuntimeResult;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>;

export const RUNTIME_EXECUTION_PLAN_SCHEMA_VERSION = 1 as const;

export type RuntimeExecutionPlanSchemaVersion =
  typeof RUNTIME_EXECUTION_PLAN_SCHEMA_VERSION;

export type RuntimeExecutionPlanCapabilityRequirement = Readonly<{
  requirementId: string;
  category: string;
  version: string;
  requiredFeatures: readonly string[];
  acceptedConstraints: readonly string[];
  capabilityId: string;
  supportedFeatures: readonly string[];
  declaredConstraints: readonly string[];
  compatible: true;
  diagnosticCodes: readonly string[];
}>;

export type RuntimeExecutionPlanCapabilityDecision = Readonly<{
  outcome: "selected";
  descriptorId: string;
  compatibleRuntimeIds: readonly string[];
  evaluatedRuntimeIds: readonly string[];
  requirements: readonly RuntimeExecutionPlanCapabilityRequirement[];
}>;

export type RuntimeExecutionPlanRequest = Readonly<{
  task: RuntimeRequest["task"];
  mode: RuntimeRequest["mode"];
  provider: AgentProvider;
  effort: AgentEffort;
  requestedAt: string;
  requestedRuntime: RuntimeId;
  allowedProviders: readonly AgentProvider[] | null;
  allowedRuntimes: readonly RuntimeId[] | null;
  contextPackage: RuntimeRequest["contextPackage"];
  metadata: RuntimeMetadata;
  localProcessConfigured: boolean;
}>;

export type RuntimeExecutionPlanPolicyDecision = Readonly<{
  outcome: "admitted";
  policyId: string;
  mode: AgentPolicyResolution["mode"];
  status: "resolved";
  checks: readonly RuntimeExecutionAdmissionCheck[];
  diagnosticCodes: readonly RuntimeExecutionAdmissionErrorCode[];
}>;

export type RuntimeExecutionPlanConstraints = Readonly<{
  provider: AgentProvider | null;
  effort: AgentEffort | null;
  requestedBudget: AgentBudget | null;
  limitBudget: AgentBudget;
  mergedBudget: AgentBudget | null;
  allowedProviders: readonly AgentProvider[] | null;
  allowedRuntimes: readonly RuntimeId[] | null;
}>;

export type RuntimeExecutionPlan = Readonly<{
  schemaVersion: RuntimeExecutionPlanSchemaVersion;
  descriptorId: string;
  runtimeId: RuntimeId;
  capabilityDecision: RuntimeExecutionPlanCapabilityDecision;
  request: RuntimeExecutionPlanRequest;
  policyDecision: RuntimeExecutionPlanPolicyDecision;
  executionConstraints: RuntimeExecutionPlanConstraints;
  reasons: Readonly<{
    selectionCodes: readonly string[];
    admissionCodes: readonly string[];
  }>;
}>;

export type RuntimeExecutionPlanInput = Readonly<{
  resolution: Extract<
    PolicyAwareDeclarativeRuntimeExecutionResolution,
    { outcome: "resolved" }
  >;
  admission: RuntimeExecutionPolicyAdmissionOptions;
}>;

export type RuntimeExecutionPlanDryRunResult =
  | Readonly<{
      outcome: "planned";
      plan: RuntimeExecutionPlan;
      resolution: Extract<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      diagnostics: readonly [];
    }>
  | Readonly<{
      outcome: Exclude<
        PolicyAwareDeclarativeRuntimeExecutionResolution["outcome"],
        "resolved"
      >;
      plan: null;
      resolution: Exclude<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      diagnostics: readonly (
        | DeclarativeRuntimeExecutionBridgeError
        | RuntimeExecutionAdmissionError
      )[];
    }>
  | Readonly<{
      outcome: "runtime_execution_plan_unserializable";
      plan: null;
      resolution: Extract<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>;

export const RUNTIME_EXECUTION_RECEIPT_SCHEMA_VERSION = 1 as const;

export type RuntimeExecutionReceiptSchemaVersion =
  typeof RUNTIME_EXECUTION_RECEIPT_SCHEMA_VERSION;

export type RuntimeExecutionReceiptOutcome = Readonly<{
  status: RuntimeResult["status"];
  output: unknown;
  diagnostics: readonly string[];
  errorCode: string | null;
  errorMessage: string | null;
  termination?: RuntimeResult["termination"];
}>;

/** A deterministic, public post-execution proof for one admitted Runtime call. */
export type RuntimeExecutionReceipt = Readonly<{
  schemaVersion: RuntimeExecutionReceiptSchemaVersion;
  descriptorId: string;
  runtimeId: RuntimeId;
  request: RuntimeExecutionPlanRequest;
  capabilityDecision: RuntimeExecutionPlanCapabilityDecision;
  policyDecision: RuntimeExecutionPlanPolicyDecision;
  executionConstraints: RuntimeExecutionPlanConstraints;
  reasons: RuntimeExecutionPlan["reasons"];
  outcome: RuntimeExecutionReceiptOutcome;
}>;

export type RuntimeExecutionReceiptInput = Readonly<{
  resolution: Extract<
    PolicyAwareDeclarativeRuntimeExecutionResolution,
    { outcome: "resolved" }
  >;
  admission: RuntimeExecutionPolicyAdmissionOptions;
  runtimeResult: RuntimeResult;
}>;

export type PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult =
  | Readonly<{
      outcome: "executed";
      resolution: Extract<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: RuntimeResult;
      receipt: RuntimeExecutionReceipt;
      diagnostics: readonly [];
    }>
  | Readonly<{
      outcome: "resolution_failed";
      resolution: Exclude<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: null;
      receipt: null;
      diagnostics: readonly (
        | DeclarativeRuntimeExecutionBridgeError
        | RuntimeExecutionAdmissionError
      )[];
    }>
  | Readonly<{
      outcome: "receipt_creation_failed";
      resolution: Extract<
        PolicyAwareDeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >;
      runtimeResult: RuntimeResult;
      receipt: null;
      diagnostics: readonly DeclarativeRuntimeExecutionBridgeError[];
    }>;

export type PolicyBoundLocalProcessExecutionResult =
  PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult;

const BUDGET_DIMENSIONS = [
  "maxTokens",
  "maxCostUsd",
  "maxDurationMs",
  "maxCalls",
  "maxRepairs",
] as const;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

function bridgeError(
  code: DeclarativeRuntimeExecutionBridgeErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): DeclarativeRuntimeExecutionBridgeError {
  return deepFreeze({ code, message, details });
}

function admissionError(
  code: RuntimeExecutionAdmissionErrorCode,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): RuntimeExecutionAdmissionError {
  return deepFreeze({ code, message, details });
}

function admissionCheck(
  name: RuntimeExecutionAdmissionCheckName,
  status: RuntimeExecutionAdmissionCheckStatus,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): RuntimeExecutionAdmissionCheck {
  return deepFreeze({ name, status, message, details });
}

function isValidBudgetValue(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function selectedPolicyProfile(policy: AgentPolicyResolution) {
  return policy.selection?.outcome === "selected"
    ? policy.selection.profile
    : null;
}

function createAdmissionInput(
  runtimeId: RuntimeId,
  options: RuntimeExecutionPolicyAdmissionOptions,
): RuntimeExecutionAdmissionInput {
  const profile = selectedPolicyProfile(options.policy);

  return {
    runtimeId,
    policy: options.policy,
    ...(options.provider !== undefined
      ? { provider: options.provider }
      : profile
        ? { provider: profile.provider }
        : {}),
    ...(options.effort !== undefined
      ? { effort: options.effort }
      : profile
        ? { effort: profile.effort }
        : {}),
    ...(options.budget !== undefined
      ? { budget: options.budget }
      : profile
        ? { budget: profile.budget }
        : {}),
  };
}

export function evaluateRuntimeExecutionAdmission(
  input: RuntimeExecutionAdmissionInput,
): RuntimeExecutionAdmissionResult {
  const checks: RuntimeExecutionAdmissionCheck[] = [];
  const diagnostics: RuntimeExecutionAdmissionError[] = [];
  const policy = input.policy;

  if (policy.status !== "resolved") {
    diagnostics.push(
      admissionError(
        "runtime_execution_policy_not_resolved",
        "Runtime execution admission requires a resolved AgentPolicyResolution.",
        { policyId: policy.policyId, status: policy.status },
      ),
    );
    checks.push(
      admissionCheck("policy", "failed", "Policy is not resolved.", {
        status: policy.status,
      }),
    );
  } else {
    checks.push(
      admissionCheck("policy", "passed", "Policy is resolved.", {
        policyId: policy.policyId,
      }),
    );
  }

  const allowedRuntimes = policy.requirements.allowedRuntimes;
  if (allowedRuntimes === undefined) {
    checks.push(
      admissionCheck(
        "runtime",
        "not_applicable",
        "Policy declares no runtime allow-list.",
      ),
    );
  } else if ((allowedRuntimes as readonly string[]).includes(input.runtimeId)) {
    checks.push(
      admissionCheck("runtime", "passed", "Runtime is allowed by policy.", {
        runtimeId: input.runtimeId,
      }),
    );
  } else {
    diagnostics.push(
      admissionError(
        "runtime_execution_runtime_not_allowed",
        "Runtime is not allowed by policy.",
        { runtimeId: input.runtimeId, allowedRuntimes },
      ),
    );
    checks.push(
      admissionCheck("runtime", "failed", "Runtime is not allowed.", {
        runtimeId: input.runtimeId,
        allowedRuntimes,
      }),
    );
  }

  const allowedProviders = policy.requirements.allowedProviders;
  if (allowedProviders === undefined) {
    checks.push(
      admissionCheck(
        "provider",
        input.provider === undefined ? "not_available" : "not_applicable",
        input.provider === undefined
          ? "Provider identity is not available and policy declares no provider allow-list."
          : "Policy declares no provider allow-list.",
        input.provider === undefined ? {} : { provider: input.provider },
      ),
    );
  } else if (input.provider === undefined) {
    diagnostics.push(
      admissionError(
        "runtime_execution_provider_unverifiable",
        "Provider allow-list cannot be verified because no provider identity was supplied.",
        { allowedProviders },
      ),
    );
    checks.push(
      admissionCheck(
        "provider",
        "not_available",
        "Provider identity is required but unavailable.",
        { allowedProviders },
      ),
    );
  } else if (allowedProviders.includes(input.provider)) {
    checks.push(
      admissionCheck("provider", "passed", "Provider is allowed by policy.", {
        provider: input.provider,
      }),
    );
  } else {
    diagnostics.push(
      admissionError(
        "runtime_execution_provider_not_allowed",
        "Provider is not allowed by policy.",
        { provider: input.provider, allowedProviders },
      ),
    );
    checks.push(
      admissionCheck("provider", "failed", "Provider is not allowed.", {
        provider: input.provider,
        allowedProviders,
      }),
    );
  }

  if (input.effort === undefined) {
    checks.push(
      admissionCheck(
        "effort",
        "not_available",
        "Requested effort is not available; no effort admission check was applied.",
      ),
    );
  } else if (
    compareAgentEffort(input.effort, policy.requirements.maximumEffort) <= 0
  ) {
    checks.push(
      admissionCheck(
        "effort",
        "passed",
        "Requested effort is within the policy maximum.",
        {
          effort: input.effort,
          maximumEffort: policy.requirements.maximumEffort,
        },
      ),
    );
  } else {
    diagnostics.push(
      admissionError(
        "runtime_execution_effort_exceeds_maximum",
        "Requested effort exceeds the policy maximum.",
        {
          effort: input.effort,
          maximumEffort: policy.requirements.maximumEffort,
        },
      ),
    );
    checks.push(
      admissionCheck("effort", "failed", "Requested effort is too high.", {
        effort: input.effort,
        maximumEffort: policy.requirements.maximumEffort,
      }),
    );
  }

  if (input.budget === undefined) {
    checks.push(
      admissionCheck(
        "budget",
        "not_available",
        "Requested budget is not available; no budget admission check was applied.",
      ),
    );
  } else {
    const requestedBudget = toBudget(input.budget);
    const mergedBudget = mergeBudgetsRestrictively(
      policy.requirements.executionBudget,
      requestedBudget,
    );
    const budgetDiagnostics = BUDGET_DIMENSIONS.flatMap((dimension) => {
      const supplied = Object.hasOwn(input.budget ?? {}, dimension);
      if (!supplied) return [];

      const requestedValue = requestedBudget[dimension];
      const limit = policy.requirements.executionBudget[dimension];

      if (!isValidBudgetValue(requestedValue)) {
        return [
          admissionError(
            "runtime_execution_admission_input_inconsistent",
            "Requested budget contains an invalid value.",
            { dimension, requestedValue },
          ),
        ];
      }

      if (
        limit !== null &&
        (requestedValue === null || requestedValue > limit)
      ) {
        return [
          admissionError(
            "runtime_execution_budget_exceeded",
            "Requested budget exceeds the policy limit.",
            { dimension, requestedValue, limit },
          ),
        ];
      }

      return [];
    });

    diagnostics.push(...budgetDiagnostics);
    checks.push(
      budgetDiagnostics.length === 0
        ? admissionCheck(
            "budget",
            "passed",
            "Requested budget is within policy limits.",
            {
              requestedBudget,
              policyBudget: policy.requirements.executionBudget,
              mergedBudget,
            },
          )
        : admissionCheck(
            "budget",
            "failed",
            "Requested budget exceeds at least one policy limit.",
            {
              requestedBudget,
              policyBudget: policy.requirements.executionBudget,
              mergedBudget,
              diagnosticCodes: budgetDiagnostics.map(
                (diagnostic) => diagnostic.code,
              ),
            },
          ),
    );
  }

  if (diagnostics.length === 0) {
    return deepFreeze({
      outcome: "admitted",
      admitted: true,
      checks,
      diagnostics: [],
    }) as RuntimeExecutionAdmissionResult;
  }

  return deepFreeze({
    outcome: "denied",
    admitted: false,
    reason: diagnostics[0]!.code,
    checks,
    diagnostics,
  }) as RuntimeExecutionAdmissionResult;
}

function failedResolution(
  outcome: Exclude<DeclarativeRuntimeExecutionResolution["outcome"], "resolved">,
  diagnostic: DeclarativeRuntimeExecutionBridgeError,
  options: Readonly<{
    descriptorId?: string | null;
    runtimeId?: RuntimeId | null;
    declarativeSelection?: RuntimeCapabilitySelectionResult | null;
    runtimeRequest?: RuntimeRequest | null;
    v10Resolution?: DeclarativeRuntimeUnsupportedV10Resolution | null;
  }> = {},
): DeclarativeRuntimeExecutionResolution {
  return deepFreeze({
    outcome,
    descriptorId: options.descriptorId ?? null,
    runtimeId: options.runtimeId ?? null,
    declarativeSelection: options.declarativeSelection ?? null,
    runtimeRequest: options.runtimeRequest ?? null,
    v10Resolution: options.v10Resolution ?? null,
    diagnostics: [diagnostic],
  }) as DeclarativeRuntimeExecutionResolution;
}

function failedPolicyAwareResolution(
  base: Exclude<DeclarativeRuntimeExecutionResolution, { outcome: "resolved" }>,
): PolicyAwareDeclarativeRuntimeExecutionResolution {
  return deepFreeze({
    ...base,
    admission: null,
  }) as PolicyAwareDeclarativeRuntimeExecutionResolution;
}

function asRuntimeIds(
  runtimes: readonly string[] | undefined,
): readonly RuntimeId[] | null {
  return runtimes === undefined ? null : ([...runtimes] as RuntimeId[]);
}

function budgetFromValue(value: unknown): AgentBudget | null {
  if (value === null || typeof value !== "object") return null;
  const candidate = value as Partial<Record<keyof AgentBudget, unknown>>;
  const budget = {
    maxTokens: candidate.maxTokens ?? null,
    maxCostUsd: candidate.maxCostUsd ?? null,
    maxDurationMs: candidate.maxDurationMs ?? null,
    maxCalls: candidate.maxCalls ?? null,
    maxRepairs: candidate.maxRepairs ?? null,
  };

  return BUDGET_DIMENSIONS.every((dimension) =>
    isValidBudgetValue(budget[dimension]),
  )
    ? (budget as AgentBudget)
    : null;
}

function budgetCheckDetails(
  admission: Extract<RuntimeExecutionAdmissionResult, { outcome: "admitted" }>,
) {
  return admission.checks.find((check) => check.name === "budget")?.details;
}

function selectedCapabilityRequirements(
  resolution: Extract<
    PolicyAwareDeclarativeRuntimeExecutionResolution,
    { outcome: "resolved" }
  >,
): readonly RuntimeExecutionPlanCapabilityRequirement[] {
  const selected = resolution.declarativeSelection.candidates.find(
    (candidate) => candidate.runtimeId === resolution.descriptorId,
  );

  return (selected?.requirements ?? []).map((requirement) =>
    deepFreeze({
      requirementId: requirement.requirement.id,
      category: requirement.requirement.category,
      version: requirement.requirement.version,
      requiredFeatures: [...requirement.requirement.requiredFeatures],
      acceptedConstraints: [...requirement.requirement.acceptedConstraints],
      capabilityId: requirement.capability.id,
      supportedFeatures: [...requirement.capability.supportedFeatures],
      declaredConstraints: [...requirement.capability.declaredConstraints],
      compatible: true as const,
      diagnosticCodes: requirement.diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    }),
  );
}

function findNonSerializableRuntimeExecutionPlanValue(
  value: unknown,
  path = "plan",
  inArray = false,
): string | null {
  if (value === undefined) return `${path}:undefined`;
  if (typeof value === "function") return `${path}:function`;
  if (typeof value === "symbol") return `${path}:symbol`;
  if (typeof value === "bigint") return `${path}:bigint`;
  if (value === null || typeof value !== "object") return null;
  const tag = Object.prototype.toString.call(value);
  if (tag === "[object Map]") return `${path}:Map`;
  if (tag === "[object Set]") return `${path}:Set`;
  if (tag === "[object Error]") return `${path}:Error`;
  if (
    tag === "[object Promise]" ||
    ("then" in value && typeof value.then === "function")
  ) {
    return `${path}:Promise`;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const violation = findNonSerializableRuntimeExecutionPlanValue(
        item,
        `${path}[${index}]`,
        true,
      );
      if (violation) return violation;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    const violation = findNonSerializableRuntimeExecutionPlanValue(
      child,
      `${path}.${key}`,
      inArray,
    );
    if (violation) return violation;
  }

  return inArray ? null : null;
}

function assertRuntimeExecutionPlanSerializable(
  plan: RuntimeExecutionPlan,
): DeclarativeRuntimeExecutionBridgeError | null {
  const violation = findNonSerializableRuntimeExecutionPlanValue(plan);
  if (violation) {
    return bridgeError(
      "runtime_execution_plan_unserializable",
      "Runtime Execution Plan contains a non-serializable value.",
      { violation },
    );
  }

  return null;
}

function cloneRuntimeExecutionReceiptValue(value: unknown, path = "receipt"): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    throw new TypeError(`${path} contains a non-finite number.`);
  }
  if (value === undefined) throw new TypeError(`${path} contains undefined.`);
  if (typeof value === "function") throw new TypeError(`${path} contains a function.`);
  if (typeof value === "symbol") throw new TypeError(`${path} contains a symbol.`);
  if (typeof value === "bigint") throw new TypeError(`${path} contains a bigint.`);
  if (typeof value !== "object") throw new TypeError(`${path} is not JSON-safe.`);

  const tag = Object.prototype.toString.call(value);
  if (tag === "[object Map]" || tag === "[object Set]" || tag === "[object Error]" || tag === "[object Promise]") {
    throw new TypeError(`${path} contains ${tag}.`);
  }
  if ("then" in value && typeof value.then === "function") {
    throw new TypeError(`${path} contains a thenable.`);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      cloneRuntimeExecutionReceiptValue(item, `${path}[${index}]`),
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} contains a non-JSON instance.`);
  }

  return Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((copy, key) => {
      copy[key] = cloneRuntimeExecutionReceiptValue(
        (value as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
      return copy;
    }, {});
}

function receiptConstructionError(
  code: Extract<
    DeclarativeRuntimeExecutionBridgeErrorCode,
    | "runtime_execution_receipt_inconsistent"
    | "runtime_execution_receipt_unserializable"
  >,
  message: string,
): TypeError {
  return new TypeError(`${code}: ${message}`);
}

function receiptErrorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error &&
    typeof error.message === "string"
    ? error.message
    : "Receipt data is not JSON-safe.";
}

export function createRuntimeExecutionReceipt(
  input: RuntimeExecutionReceiptInput,
): RuntimeExecutionReceipt {
  const { resolution, runtimeResult } = input;
  if (runtimeResult.runtimeId !== resolution.runtimeId) {
    throw receiptConstructionError(
      "runtime_execution_receipt_inconsistent",
      "RuntimeResult identity must match the resolved runtime.",
    );
  }

  const plan = createRuntimeExecutionPlan({
    resolution,
    admission: input.admission,
  });
  const candidate = {
    schemaVersion: RUNTIME_EXECUTION_RECEIPT_SCHEMA_VERSION,
    descriptorId: plan.descriptorId,
    runtimeId: plan.runtimeId,
    request: plan.request,
    capabilityDecision: plan.capabilityDecision,
    policyDecision: plan.policyDecision,
    executionConstraints: plan.executionConstraints,
    reasons: plan.reasons,
    outcome: {
      status: runtimeResult.status,
      // Process output is adapter-internal evidence. A public receipt proves
      // the admitted effect without serialising command output or secrets.
      output:
        runtimeResult.runtimeId === LOCAL_PROCESS_RUNTIME_ID
          ? null
          : runtimeResult.output,
      diagnostics: runtimeResult.diagnostics,
      errorCode: runtimeResult.error?.code ?? null,
      errorMessage: runtimeResult.error?.message ?? null,
      ...(runtimeResult.runtimeId === LOCAL_PROCESS_RUNTIME_ID &&
      runtimeResult.termination !== undefined
        ? { termination: runtimeResult.termination }
        : {}),
    },
  };

  try {
    return deepFreeze(
      cloneRuntimeExecutionReceiptValue(candidate),
    ) as RuntimeExecutionReceipt;
  } catch (error) {
    throw receiptConstructionError(
      "runtime_execution_receipt_unserializable",
      receiptErrorMessage(error),
    );
  }
}

function localProcessBindingDiagnostic(
  resolution: PolicyAwareDeclarativeRuntimeExecutionResolution,
  binding: LocalProcessExecutionBinding | undefined,
): DeclarativeRuntimeExecutionBridgeError | null {
  if (resolution.outcome !== "resolved") return null;

  if (
    resolution.runtimeId === LOCAL_PROCESS_RUNTIME_ID &&
    binding === undefined
  ) {
    return bridgeError(
      "runtime_execution_local_process_binding_required",
      "Local-process execution requires an explicit LocalProcessExecutionBinding.",
      { runtimeId: resolution.runtimeId },
    );
  }

  if (
    resolution.runtimeId !== LOCAL_PROCESS_RUNTIME_ID &&
    binding !== undefined
  ) {
    return bridgeError(
      "runtime_execution_local_process_binding_unexpected",
      "LocalProcessExecutionBinding is valid only for the local-process runtime.",
      { runtimeId: resolution.runtimeId },
    );
  }

  return null;
}

/**
 * Opt-in bridge for the existing V10.1 local-process adapter. It validates
 * declarative selection and Agent policy first, then refuses ambiguous local
 * process authority before adapter execution. No process is started here.
 */
export function resolvePolicyBoundLocalProcessExecution(
  input: PolicyBoundLocalProcessBridgeInput,
): PolicyAwareDeclarativeRuntimeExecutionResolution {
  // Preflight only the pure V13 decision stages so local authority is checked
  // before the V10 RuntimeRequest can be constructed or resolved.
  const requestDiagnostics = validateDeclarativeRuntimeRequest(input.declarativeRequest);
  if (requestDiagnostics.length > 0) {
    return resolvePolicyAwareDeclarativeRuntimeExecution(input);
  }
  const declarativeSelection = selectRuntimeByCapabilities(
    input.declarativeRequest,
    input.declarativeRegistry,
    input.runtimeCapabilities,
  );
  if (declarativeSelection.outcome !== "selected") {
    return resolvePolicyAwareDeclarativeRuntimeExecution(input);
  }
  const descriptorId = declarativeSelection.runtimeId;
  const runtimeId = descriptorId ? input.runtimeMapping[descriptorId] : null;
  if (!descriptorId || !runtimeId) {
    return resolvePolicyAwareDeclarativeRuntimeExecution(input);
  }
  const admission = evaluateRuntimeExecutionAdmission(
    createAdmissionInput(runtimeId, input.admission),
  );
  if (admission.outcome !== "admitted") {
    return resolvePolicyAwareDeclarativeRuntimeExecution(input);
  }
  const bindingMissing =
    runtimeId === LOCAL_PROCESS_RUNTIME_ID && input.localProcessBinding === undefined;
  const bindingUnexpected =
    runtimeId !== LOCAL_PROCESS_RUNTIME_ID && input.localProcessBinding !== undefined;
  if (bindingMissing || bindingUnexpected) {
    const diagnostic = bridgeError(
      bindingMissing
        ? "runtime_execution_local_process_binding_required"
        : "runtime_execution_local_process_binding_unexpected",
      bindingMissing
        ? "Local-process execution requires an explicit LocalProcessExecutionBinding."
        : "LocalProcessExecutionBinding is valid only for the local-process runtime.",
      { runtimeId },
    );
    return deepFreeze({
      outcome: "unavailable_v10_request",
      descriptorId,
      runtimeId,
      declarativeSelection,
      admission: null,
      runtimeRequest: null,
      v10Resolution: null,
      diagnostics: [diagnostic],
    }) as PolicyAwareDeclarativeRuntimeExecutionResolution;
  }
  const resolution = resolvePolicyAwareDeclarativeRuntimeExecution({
    ...input,
    runtimeRequestOptions: {
      ...(input.runtimeRequestOptions ?? {}),
      ...(input.localProcessBinding === undefined
        ? {}
        : { localProcess: input.localProcessBinding.localProcess }),
    },
  });
  return resolution;
}

export function dryRunPolicyBoundLocalProcessExecution(
  input: PolicyBoundLocalProcessBridgeInput,
): RuntimeExecutionPlanDryRunResult {
  const resolution = resolvePolicyBoundLocalProcessExecution(input);
  if (resolution.outcome !== "resolved") {
    return deepFreeze({ outcome: resolution.outcome, plan: null, resolution, diagnostics: resolution.diagnostics }) as RuntimeExecutionPlanDryRunResult;
  }
  const plan = createRuntimeExecutionPlan({ resolution, admission: input.admission });
  const serializableDiagnostic = assertRuntimeExecutionPlanSerializable(plan);
  if (serializableDiagnostic) {
    return deepFreeze({ outcome: "runtime_execution_plan_unserializable", plan: null, resolution, diagnostics: [serializableDiagnostic] }) as RuntimeExecutionPlanDryRunResult;
  }
  return deepFreeze({ outcome: "planned", plan, resolution, diagnostics: [] }) as RuntimeExecutionPlanDryRunResult;
}

export async function executePolicyBoundLocalProcessWithReceipt(
  input: PolicyBoundLocalProcessBridgeInput,
): Promise<PolicyBoundLocalProcessExecutionResult> {
  const resolution = resolvePolicyBoundLocalProcessExecution(input);
  if (resolution.outcome !== "resolved") {
    return deepFreeze({ outcome: "resolution_failed", resolution, runtimeResult: null, receipt: null, diagnostics: resolution.diagnostics }) as PolicyBoundLocalProcessExecutionResult;
  }
  const runtimeResult = await executeRuntime(resolution.runtimeRequest);
  try {
    const receipt = createRuntimeExecutionReceipt({ resolution, admission: input.admission, runtimeResult });
    return deepFreeze({ outcome: "executed", resolution, runtimeResult, receipt, diagnostics: [] }) as PolicyBoundLocalProcessExecutionResult;
  } catch (error) {
    const diagnostic = bridgeError("runtime_execution_receipt_unserializable", "Runtime execution receipt could not be constructed.", { reason: receiptErrorMessage(error) });
    return deepFreeze({ outcome: "receipt_creation_failed", resolution, runtimeResult, receipt: null, diagnostics: [diagnostic] }) as PolicyBoundLocalProcessExecutionResult;
  }
}

export function createRuntimeExecutionPlan(
  input: RuntimeExecutionPlanInput,
): RuntimeExecutionPlan {
  const { resolution } = input;
  const admissionInput = createAdmissionInput(
    resolution.runtimeId,
    input.admission,
  );
  const budgetDetails = budgetCheckDetails(resolution.admission);
  const requestedBudget = budgetFromValue(budgetDetails?.requestedBudget);
  const mergedBudget = budgetFromValue(budgetDetails?.mergedBudget);
  const runtimeRequest = resolution.runtimeRequest;

  return deepFreeze({
    schemaVersion: RUNTIME_EXECUTION_PLAN_SCHEMA_VERSION,
    descriptorId: resolution.descriptorId,
    runtimeId: resolution.runtimeId,
    capabilityDecision: {
      outcome: "selected",
      descriptorId: resolution.descriptorId,
      compatibleRuntimeIds: [
        ...resolution.declarativeSelection.compatibleRuntimeIds,
      ],
      evaluatedRuntimeIds: resolution.declarativeSelection.candidates.map(
        (candidate) => candidate.runtimeId,
      ),
      requirements: selectedCapabilityRequirements(resolution),
    },
    request: {
      task: runtimeRequest.task,
      mode: runtimeRequest.mode,
      provider: runtimeRequest.provider,
      effort: runtimeRequest.effort,
      requestedAt: runtimeRequest.requestedAt,
      requestedRuntime: resolution.runtimeId,
      allowedProviders: runtimeRequest.allowedProviders
        ? [...runtimeRequest.allowedProviders]
        : null,
      allowedRuntimes: runtimeRequest.allowedRuntimes
        ? [...runtimeRequest.allowedRuntimes]
        : null,
      contextPackage: runtimeRequest.contextPackage,
      metadata: runtimeRequest.metadata,
      localProcessConfigured: runtimeRequest.localProcess !== undefined,
    },
    policyDecision: {
      outcome: "admitted",
      policyId: input.admission.policy.policyId,
      mode: input.admission.policy.mode,
      status: "resolved",
      checks: resolution.admission.checks,
      diagnosticCodes: resolution.admission.diagnostics.map(
        (diagnostic) => diagnostic.code,
      ),
    },
    executionConstraints: {
      provider: admissionInput.provider ?? null,
      effort: admissionInput.effort ?? null,
      requestedBudget,
      limitBudget: input.admission.policy.requirements.executionBudget,
      mergedBudget,
      allowedProviders:
        input.admission.policy.requirements.allowedProviders === undefined
          ? null
          : [...input.admission.policy.requirements.allowedProviders],
      allowedRuntimes: asRuntimeIds(
        input.admission.policy.requirements.allowedRuntimes,
      ),
    },
    reasons: {
      selectionCodes: ["runtime_capability_selected"],
      admissionCodes: resolution.admission.checks.map(
        (check) => `${check.name}:${check.status}`,
      ),
    },
  }) as RuntimeExecutionPlan;
}

export function resolveDeclarativeRuntimeExecution(
  input: DeclarativeRuntimeExecutionBridgeInput,
): DeclarativeRuntimeExecutionResolution {
  const requestDiagnostics = validateDeclarativeRuntimeRequest(
    input.declarativeRequest,
  );

  if (requestDiagnostics.length > 0) {
    return failedResolution(
      "invalid_declarative_request",
      bridgeError(
        "declarative_runtime_request_invalid",
        "Declarative Runtime Request is invalid.",
        {
          diagnosticCodes: requestDiagnostics.map(
            (diagnostic) => diagnostic.code,
          ),
        },
      ),
    );
  }

  const declarativeSelection = selectRuntimeByCapabilities(
    input.declarativeRequest,
    input.declarativeRegistry,
    input.runtimeCapabilities,
  );

  if (declarativeSelection.outcome !== "selected") {
    return failedResolution(
      "no_compatible_descriptor",
      bridgeError(
        "declarative_runtime_no_compatible_descriptor",
        "No compatible declarative Runtime Descriptor was selected.",
        { diagnostics: declarativeSelection.diagnostics },
      ),
      { declarativeSelection },
    );
  }

  const descriptorId = declarativeSelection.runtimeId;
  const runtimeId = descriptorId ? input.runtimeMapping[descriptorId] : null;

  if (!descriptorId || !runtimeId) {
    return failedResolution(
      "missing_v10_mapping",
      bridgeError(
        "declarative_runtime_v10_mapping_missing",
        "Selected declarative Runtime Descriptor has no explicit V10 runtime mapping.",
        { descriptorId },
      ),
      { descriptorId, declarativeSelection },
    );
  }

  const runtimeRequest = createRuntimeRequest(input.loopRunResult, {
    ...(input.runtimeRequestOptions ?? {}),
    requestedRuntime: runtimeId,
  });

  if (!runtimeRequest) {
    return failedResolution(
      "unavailable_v10_request",
      bridgeError(
        "v10_runtime_request_unavailable",
        "LoopRunResult cannot be translated to a V10 RuntimeRequest.",
        { descriptorId, runtimeId },
      ),
      { descriptorId, runtimeId, declarativeSelection },
    );
  }

  const v10Selection = resolveRuntime(runtimeRequest);

  if (v10Selection.outcome !== "selected") {
    return failedResolution(
      "unresolved_v10_runtime",
      bridgeError(
        "v10_runtime_unresolved",
        "V10 runtime resolution did not select a registered adapter.",
        { descriptorId, runtimeId, reason: v10Selection.reason },
      ),
      {
        descriptorId,
        runtimeId,
        declarativeSelection,
        runtimeRequest,
        v10Resolution: {
          outcome: "unsupported",
          runtimeId,
          reason: v10Selection.reason,
        },
      },
    );
  }

  return deepFreeze({
    outcome: "resolved",
    descriptorId,
    runtimeId,
    declarativeSelection,
    runtimeRequest,
    v10Resolution: {
      outcome: "selected",
      runtimeId: v10Selection.adapter.runtimeId,
    },
    diagnostics: [],
  }) as DeclarativeRuntimeExecutionResolution;
}

export function resolvePolicyAwareDeclarativeRuntimeExecution(
  input: PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
): PolicyAwareDeclarativeRuntimeExecutionResolution {
  const requestDiagnostics = validateDeclarativeRuntimeRequest(
    input.declarativeRequest,
  );

  if (requestDiagnostics.length > 0) {
    return failedPolicyAwareResolution(
      failedResolution(
        "invalid_declarative_request",
        bridgeError(
          "declarative_runtime_request_invalid",
          "Declarative Runtime Request is invalid.",
          {
            diagnosticCodes: requestDiagnostics.map(
              (diagnostic) => diagnostic.code,
            ),
          },
        ),
      ) as Exclude<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >,
    );
  }

  const declarativeSelection = selectRuntimeByCapabilities(
    input.declarativeRequest,
    input.declarativeRegistry,
    input.runtimeCapabilities,
  );

  if (declarativeSelection.outcome !== "selected") {
    return failedPolicyAwareResolution(
      failedResolution(
        "no_compatible_descriptor",
        bridgeError(
          "declarative_runtime_no_compatible_descriptor",
          "No compatible declarative Runtime Descriptor was selected.",
          { diagnostics: declarativeSelection.diagnostics },
        ),
        { declarativeSelection },
      ) as Exclude<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >,
    );
  }

  const descriptorId = declarativeSelection.runtimeId;
  const runtimeId = descriptorId ? input.runtimeMapping[descriptorId] : null;

  if (!descriptorId || !runtimeId) {
    return failedPolicyAwareResolution(
      failedResolution(
        "missing_v10_mapping",
        bridgeError(
          "declarative_runtime_v10_mapping_missing",
          "Selected declarative Runtime Descriptor has no explicit V10 runtime mapping.",
          { descriptorId },
        ),
        { descriptorId, declarativeSelection },
      ) as Exclude<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >,
    );
  }

  const admission = evaluateRuntimeExecutionAdmission(
    createAdmissionInput(runtimeId, input.admission),
  );

  if (admission.outcome !== "admitted") {
    return deepFreeze({
      outcome: "admission_denied",
      descriptorId,
      runtimeId,
      declarativeSelection,
      admission,
      runtimeRequest: null,
      v10Resolution: null,
      diagnostics: admission.diagnostics,
    }) as PolicyAwareDeclarativeRuntimeExecutionResolution;
  }

  const runtimeRequest = createRuntimeRequest(input.loopRunResult, {
    ...(input.runtimeRequestOptions ?? {}),
    requestedRuntime: runtimeId,
  });

  if (!runtimeRequest) {
    return failedPolicyAwareResolution(
      failedResolution(
        "unavailable_v10_request",
        bridgeError(
          "v10_runtime_request_unavailable",
          "LoopRunResult cannot be translated to a V10 RuntimeRequest.",
          { descriptorId, runtimeId },
        ),
        { descriptorId, runtimeId, declarativeSelection },
      ) as Exclude<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >,
    );
  }

  const v10Selection = resolveRuntime(runtimeRequest);

  if (v10Selection.outcome !== "selected") {
    return failedPolicyAwareResolution(
      failedResolution(
        "unresolved_v10_runtime",
        bridgeError(
          "v10_runtime_unresolved",
          "V10 runtime resolution did not select a registered adapter.",
          { descriptorId, runtimeId, reason: v10Selection.reason },
        ),
        {
          descriptorId,
          runtimeId,
          declarativeSelection,
          runtimeRequest,
          v10Resolution: {
            outcome: "unsupported",
            runtimeId,
            reason: v10Selection.reason,
          },
        },
      ) as Exclude<
        DeclarativeRuntimeExecutionResolution,
        { outcome: "resolved" }
      >,
    );
  }

  return deepFreeze({
    outcome: "resolved",
    descriptorId,
    runtimeId,
    declarativeSelection,
    admission,
    runtimeRequest,
    v10Resolution: {
      outcome: "selected",
      runtimeId: v10Selection.adapter.runtimeId,
    },
    diagnostics: [],
  }) as PolicyAwareDeclarativeRuntimeExecutionResolution;
}

export function dryRunPolicyAwareDeclarativeRuntimeExecution(
  input: PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
): RuntimeExecutionPlanDryRunResult {
  const resolution = resolvePolicyAwareDeclarativeRuntimeExecution(input);

  if (resolution.outcome !== "resolved") {
    return deepFreeze({
      outcome: resolution.outcome,
      plan: null,
      resolution,
      diagnostics: resolution.diagnostics,
    }) as RuntimeExecutionPlanDryRunResult;
  }

  const plan = createRuntimeExecutionPlan({
    resolution,
    admission: input.admission,
  });
  const serializableDiagnostic = assertRuntimeExecutionPlanSerializable(plan);

  if (serializableDiagnostic) {
    return deepFreeze({
      outcome: "runtime_execution_plan_unserializable",
      plan: null,
      resolution,
      diagnostics: [serializableDiagnostic],
    }) as RuntimeExecutionPlanDryRunResult;
  }

  return deepFreeze({
    outcome: "planned",
    plan,
    resolution,
    diagnostics: [],
  }) as RuntimeExecutionPlanDryRunResult;
}

export async function executeDeclarativeRuntime(
  input: DeclarativeRuntimeExecutionBridgeInput,
): Promise<DeclarativeRuntimeExecutionResult> {
  const resolution = resolveDeclarativeRuntimeExecution(input);

  if (resolution.outcome !== "resolved") {
    return deepFreeze({
      outcome: "resolution_failed",
      resolution,
      runtimeResult: null,
      diagnostics: resolution.diagnostics,
    }) as DeclarativeRuntimeExecutionResult;
  }

  const runtimeResult = await executeRuntime(resolution.runtimeRequest);

  if (runtimeResult.status === "completed") {
    return deepFreeze({
      outcome: "success",
      resolution,
      runtimeResult,
      diagnostics: [],
    }) as DeclarativeRuntimeExecutionResult;
  }

  const diagnostic = bridgeError(
    "v10_runtime_execution_failed",
    "V10 runtime execution returned a non-success status.",
    {
      runtimeId: runtimeResult.runtimeId,
      status: runtimeResult.status,
      diagnostics: runtimeResult.diagnostics,
    },
  );

  return deepFreeze({
    outcome: "v10_execution_failed",
    resolution,
    runtimeResult,
    diagnostics: [diagnostic],
  }) as DeclarativeRuntimeExecutionResult;
}

export async function executePolicyAwareDeclarativeRuntime(
  input: PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
): Promise<PolicyAwareDeclarativeRuntimeExecutionResult> {
  const resolution = resolvePolicyAwareDeclarativeRuntimeExecution(input);

  if (resolution.outcome !== "resolved") {
    return deepFreeze({
      outcome: "resolution_failed",
      resolution,
      runtimeResult: null,
      diagnostics: resolution.diagnostics,
    }) as PolicyAwareDeclarativeRuntimeExecutionResult;
  }

  const runtimeResult = await executeRuntime(resolution.runtimeRequest);

  if (runtimeResult.status === "completed") {
    return deepFreeze({
      outcome: "success",
      resolution,
      runtimeResult,
      diagnostics: [],
    }) as PolicyAwareDeclarativeRuntimeExecutionResult;
  }

  const diagnostic = bridgeError(
    "v10_runtime_execution_failed",
    "V10 runtime execution returned a non-success status.",
    {
      runtimeId: runtimeResult.runtimeId,
      status: runtimeResult.status,
      diagnostics: runtimeResult.diagnostics,
    },
  );

  return deepFreeze({
    outcome: "v10_execution_failed",
    resolution,
    runtimeResult,
    diagnostics: [diagnostic],
  }) as PolicyAwareDeclarativeRuntimeExecutionResult;
}

/**
 * Opt-in post-execution proof. Resolution failures create no receipt because
 * they never reach a RuntimeAdapter; adapter-level denied results do.
 */
export async function executePolicyAwareDeclarativeRuntimeWithReceipt(
  input: PolicyAwareDeclarativeRuntimeExecutionBridgeInput,
): Promise<PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult> {
  const resolution = resolvePolicyAwareDeclarativeRuntimeExecution(input);

  if (resolution.outcome !== "resolved") {
    return deepFreeze({
      outcome: "resolution_failed",
      resolution,
      runtimeResult: null,
      receipt: null,
      diagnostics: resolution.diagnostics,
    }) as PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult;
  }

  const runtimeResult = await executeRuntime(resolution.runtimeRequest);

  try {
    const receipt = createRuntimeExecutionReceipt({
      resolution,
      admission: input.admission,
      runtimeResult,
    });
    return deepFreeze({
      outcome: "executed",
      resolution,
      runtimeResult,
      receipt,
      diagnostics: [],
    }) as PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult;
  } catch (error) {
    const diagnostic = bridgeError(
      "runtime_execution_receipt_unserializable",
      "Runtime execution receipt could not be constructed.",
      {
        reason: receiptErrorMessage(error),
      },
    );
    return deepFreeze({
      outcome: "receipt_creation_failed",
      resolution,
      runtimeResult,
      receipt: null,
      diagnostics: [diagnostic],
    }) as PolicyAwareDeclarativeRuntimeExecutionWithReceiptResult;
  }
}
