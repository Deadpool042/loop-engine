import {
  createTransportIntentResult as createResult,
  resolveTransportIntent as resolveIntent,
  validateTransportIntent as validateIntent,
  type TransportIntentError,
  type TransportIntentMetadata,
  type TransportIntentPolicy,
  type TransportIntentRequest,
  type TransportIntentResult,
  type TransportIntentStatus,
} from "../providers/intent/index.js";
import type { ExecutableMappingResult } from "../providers/mapping/index.js";
import type { ProviderExecutionPlan } from "../providers/index.js";

export type CreateTransportIntentOptions = Readonly<{
  policy?: TransportIntentPolicy;
  metadata?: TransportIntentMetadata;
  requestedIntent?: TransportIntentRequest["requestedIntent"];
}>;

/** Creates a default-deny declarative intent request without creating a transport request. */
export function createTransportIntent(
  providerPlan: ProviderExecutionPlan,
  mappingResult: ExecutableMappingResult,
  options: CreateTransportIntentOptions = {},
): TransportIntentRequest {
  return Object.freeze({
    providerPlan,
    mappingResult,
    policy:
      options.policy ??
      Object.freeze({ enabled: false, allowedIntentIds: Object.freeze([]) }),
    metadata: Object.freeze({
      ...providerPlan.metadata,
      ...(options.metadata ?? {}),
    }),
    ...(options.requestedIntent === undefined
      ? {}
      : { requestedIntent: options.requestedIntent }),
  });
}

/** Resolves only a declarative intent and never a transport adapter. */
export function resolveTransportIntent(request: TransportIntentRequest) {
  return resolveIntent(request);
}

/** Validates intent compatibility and authorization without execution. */
export function validateTransportIntent(
  request: TransportIntentRequest,
): TransportIntentResult {
  return validateIntent(request);
}

/** Normalizes a declarative result into an immutable safe snapshot. */
export function normalizeTransportIntent(
  result: TransportIntentResult,
): TransportIntentResult {
  return Object.freeze({
    ...result,
    requiredCapabilities: Object.freeze([...result.requiredCapabilities]),
    requiredPermissions: Object.freeze([...result.requiredPermissions]),
    diagnostics: Object.freeze([...result.diagnostics]),
    metadata: Object.freeze({ ...result.metadata }),
    validation: Object.freeze({
      ...result.validation,
      diagnostics: Object.freeze([...result.validation.diagnostics]),
    }),
  });
}

/** Creates a stable non-executing result for explicit internal rejections. */
export function createTransportIntentResult(
  request: TransportIntentRequest,
  status: TransportIntentStatus,
  error: TransportIntentError,
  intentId: TransportIntentResult["intentId"] = null,
  desiredTransport: TransportIntentResult["desiredTransport"] = "not_configured",
  requiredCapabilities: TransportIntentResult["requiredCapabilities"] = [],
  requiredPermissions: TransportIntentResult["requiredPermissions"] = [],
): TransportIntentResult {
  return createResult(
    request,
    status,
    error,
    intentId,
    desiredTransport,
    requiredCapabilities,
    requiredPermissions,
  );
}
