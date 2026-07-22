import {
  decodeLoopRuntimePublicRequest,
  type LoopRuntimePublicRequestDecodeFailureReason,
} from "./loop-runtime-public-request-decoder.js";
import {
  type LoopRuntimeResolvedPolicyConfiguration,
  type LoopRuntimeResolvedProfileConfiguration,
} from "./loop-runtime-public-request-configuration.js";
import type { LoopRuntimeInternalLimits } from "./loop-runtime-public-request-limits.js";
import {
  prepareLoopRuntimePublicRequest,
  type LoopRuntimePublicRequestPreparationFailureStage,
} from "./loop-runtime-public-request-preparation.js";
import type { LoopRuntimePublicRequestReferenceCatalog } from "./loop-runtime-public-request-resolution.js";
import type {
  LoopRuntimeConstructedRuntimeRequest,
  LoopRuntimeRequestBinding,
} from "./loop-runtime-public-request-runtime-request.js";

export type LoopRuntimePublicRequestEntryPreparationInput = Readonly<{
  payload: unknown;
  catalog: LoopRuntimePublicRequestReferenceCatalog<
    LoopRuntimeResolvedPolicyConfiguration,
    LoopRuntimeResolvedProfileConfiguration
  >;
  limits: LoopRuntimeInternalLimits;
  binding: LoopRuntimeRequestBinding;
}>;

export type LoopRuntimePublicRequestEntryPreparationFailureStage =
  | "decoding"
  | LoopRuntimePublicRequestPreparationFailureStage;

export type LoopRuntimePublicRequestEntryPreparationResult =
  | Readonly<{
      prepared: true;
      runtimeRequest: LoopRuntimeConstructedRuntimeRequest;
    }>
  | Readonly<{
      prepared: false;
      stage: LoopRuntimePublicRequestEntryPreparationFailureStage;
      reason: LoopRuntimePublicRequestDecodeFailureReason | string;
    }>;

function failEntryPreparation(
  stage: LoopRuntimePublicRequestEntryPreparationFailureStage,
  reason: LoopRuntimePublicRequestDecodeFailureReason | string,
): LoopRuntimePublicRequestEntryPreparationResult {
  return Object.freeze({
    prepared: false,
    stage,
    reason,
  });
}

export function decodeAndPrepareLoopRuntimePublicRequest(
  input: LoopRuntimePublicRequestEntryPreparationInput,
): LoopRuntimePublicRequestEntryPreparationResult {
  const decoded = decodeLoopRuntimePublicRequest(input.payload);

  if (!decoded.parsed) {
    return failEntryPreparation("decoding", decoded.reason);
  }

  const preparation = prepareLoopRuntimePublicRequest({
    request: decoded.request,
    catalog: input.catalog,
    limits: input.limits,
    binding: input.binding,
  });

  if (!preparation.prepared) {
    return failEntryPreparation(preparation.stage, preparation.reason);
  }

  return Object.freeze({
    prepared: true as const,
    runtimeRequest: preparation.runtimeRequest,
  });
}
