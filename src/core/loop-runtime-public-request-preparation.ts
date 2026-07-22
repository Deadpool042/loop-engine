import {
  createLoopRuntimeResolvedRequestConfiguration,
  type LoopRuntimeResolvedPolicyConfiguration,
  type LoopRuntimeResolvedProfileConfiguration,
} from "./loop-runtime-public-request-configuration.js";
import { createLoopRuntimeExecutionPlan } from "./loop-runtime-public-request-execution-plan.js";
import {
  applyLoopRuntimeInternalLimits,
  type LoopRuntimeInternalLimits,
} from "./loop-runtime-public-request-limits.js";
import type { LoopRuntimePublicRequest } from "./loop-runtime-public-request.js";
import {
  resolveLoopRuntimePublicRequestReferences,
  type LoopRuntimePublicRequestReferenceCatalog,
} from "./loop-runtime-public-request-resolution.js";
import {
  createLoopRuntimeRequestFromPublicOptions,
  type LoopRuntimeConstructedRuntimeRequest,
  type LoopRuntimeRequestBinding,
} from "./loop-runtime-public-request-runtime-request.js";
import { mapLoopRuntimeExecutionPlanToRequestOptions } from "./loop-runtime-public-request-runtime-options.js";

export type LoopRuntimePublicRequestPreparationInput = Readonly<{
  request: LoopRuntimePublicRequest;
  catalog: LoopRuntimePublicRequestReferenceCatalog<
    LoopRuntimeResolvedPolicyConfiguration,
    LoopRuntimeResolvedProfileConfiguration
  >;
  limits: LoopRuntimeInternalLimits;
  binding: LoopRuntimeRequestBinding;
}>;

export type LoopRuntimePublicRequestPreparationFailureStage =
  | "resolution"
  | "configuration"
  | "limits"
  | "planning"
  | "options_mapping"
  | "request_construction";

export type LoopRuntimePublicRequestPreparationResult =
  | Readonly<{
      prepared: true;
      runtimeRequest: LoopRuntimeConstructedRuntimeRequest;
    }>
  | Readonly<{
      prepared: false;
      stage: LoopRuntimePublicRequestPreparationFailureStage;
      reason: string;
    }>;

function failPreparation(
  stage: LoopRuntimePublicRequestPreparationFailureStage,
  reason: string,
): LoopRuntimePublicRequestPreparationResult {
  return Object.freeze({
    prepared: false,
    stage,
    reason,
  });
}

export function prepareLoopRuntimePublicRequest(
  input: LoopRuntimePublicRequestPreparationInput,
): LoopRuntimePublicRequestPreparationResult {
  const resolution = resolveLoopRuntimePublicRequestReferences(
    input.request,
    input.catalog,
  );

  if (!resolution.resolved) {
    return failPreparation("resolution", resolution.reason);
  }

  const configuration =
    createLoopRuntimeResolvedRequestConfiguration(resolution);

  if (!configuration.configured) {
    return failPreparation("configuration", configuration.reason);
  }

  const limited = applyLoopRuntimeInternalLimits(
    configuration.configuration,
    input.limits,
  );

  if (!limited.limited) {
    return failPreparation("limits", limited.reason);
  }

  const executionPlan = createLoopRuntimeExecutionPlan(limited.configuration);

  if (!executionPlan.planned) {
    return failPreparation("planning", executionPlan.reason);
  }

  const requestOptions = mapLoopRuntimeExecutionPlanToRequestOptions(
    executionPlan.plan,
  );

  if (!requestOptions.mapped) {
    return failPreparation("options_mapping", requestOptions.reason);
  }

  const runtimeRequest = createLoopRuntimeRequestFromPublicOptions(
    requestOptions.options,
    input.binding,
  );

  if (!runtimeRequest.constructed) {
    return failPreparation("request_construction", runtimeRequest.reason);
  }

  return Object.freeze({
    prepared: true as const,
    runtimeRequest: runtimeRequest.request,
  });
}
