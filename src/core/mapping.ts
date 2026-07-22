import {
  createExecutableMappingResult as createResult,
  resolveExecutableMapping as resolveMapping,
  validateExecutableMapping as validateMapping,
  type ExecutableMappingError,
  type ExecutableMappingIntent,
  type ExecutableMappingMetadata,
  type ExecutableMappingPolicy,
  type ExecutableMappingRequest,
  type ExecutableMappingResult,
  type ExecutableMappingStatus,
} from "../providers/mapping/index.js";
import type { ProviderExecutionPlan } from "../providers/index.js";

export type CreateExecutableMappingRequestOptions = Readonly<{
  protocolPlan?: ExecutableMappingRequest["protocolPlan"];
  policy?: ExecutableMappingPolicy;
  metadata?: ExecutableMappingMetadata;
  requestedMapping?: ExecutableMappingRequest["requestedMapping"];
}>;

/**
 * Creates a default-deny mapping request. This only joins existing Provider
 * and protocol plans; it does not create a command or invoke a transport.
 */
export function createExecutableMappingRequest(
  providerPlan: ProviderExecutionPlan,
  options: CreateExecutableMappingRequestOptions = {},
): ExecutableMappingRequest {
  return Object.freeze({
    providerPlan,
    ...(options.protocolPlan === undefined
      ? {}
      : { protocolPlan: options.protocolPlan }),
    policy:
      options.policy ??
      Object.freeze({ enabled: false, allowedMappingIds: Object.freeze([]) }),
    metadata: Object.freeze({
      ...providerPlan.metadata,
      ...(options.metadata ?? {}),
    }),
    ...(options.requestedMapping === undefined
      ? {}
      : { requestedMapping: options.requestedMapping }),
  });
}

/** Resolves the static mapping registry without configuring or executing anything. */
export function resolveExecutableMapping(request: ExecutableMappingRequest) {
  return resolveMapping(request);
}

/** Validates mapping availability and policy without transport invocation. */
export function validateExecutableMapping(
  request: ExecutableMappingRequest,
): ExecutableMappingResult {
  return validateMapping(request);
}

/** Creates a stable non-executing mapping result for an explicit rejection. */
export function createExecutableMappingResult(
  request: ExecutableMappingRequest,
  status: ExecutableMappingStatus,
  error: ExecutableMappingError,
  mappingId: ExecutableMappingResult["mappingId"] = null,
  requiredTransportCapabilities: ExecutableMappingIntent["requiredTransportCapabilities"] = [],
): ExecutableMappingResult {
  return createResult(
    request,
    status,
    error,
    mappingId,
    requiredTransportCapabilities,
  );
}
