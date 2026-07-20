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
  RuntimeRequest,
  RuntimeResult,
} from "../runtime/index.js";
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
