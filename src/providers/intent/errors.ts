import type {
  TransportIntentDiagnostic,
  TransportIntentError,
  TransportIntentErrorCode,
  TransportIntentMetadata,
  TransportIntentRequest,
  TransportIntentResult,
  TransportIntentStatus,
} from "./types.js";

export function createTransportIntentError(
  code: TransportIntentErrorCode,
  message: string,
  details: TransportIntentMetadata = {},
): TransportIntentError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromTransportIntentError(
  error: TransportIntentError,
): TransportIntentDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createTransportIntentResult(
  request: TransportIntentRequest,
  status: TransportIntentStatus,
  error: TransportIntentError,
  intentId: TransportIntentResult["intentId"] = null,
  desiredTransport: TransportIntentResult["desiredTransport"] = "not_configured",
  requiredCapabilities: TransportIntentResult["requiredCapabilities"] = [],
  requiredPermissions: TransportIntentResult["requiredPermissions"] = [],
): TransportIntentResult {
  const diagnostic = diagnosticFromTransportIntentError(error);
  return Object.freeze({
    status,
    intentId,
    providerPlan: request.providerPlan,
    mappingResult: request.mappingResult,
    desiredTransport,
    requiredCapabilities: Object.freeze([...requiredCapabilities]),
    requiredPermissions: Object.freeze([...requiredPermissions]),
    validation: Object.freeze({
      valid: false,
      diagnostics: Object.freeze([diagnostic]),
      error,
    }),
    diagnostics: Object.freeze([diagnostic]),
    metadata: Object.freeze({ ...request.metadata }),
    error,
    executionStarted: false,
  });
}
