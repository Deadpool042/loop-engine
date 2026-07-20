import type { LoopRunResult } from "../loop/types.js";
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
