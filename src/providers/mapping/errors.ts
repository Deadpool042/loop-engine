import type {
  ExecutableMappingDiagnostic,
  ExecutableMappingError,
  ExecutableMappingErrorCode,
  ExecutableMappingMetadata,
  ExecutableMappingResult,
  ExecutableMappingStatus,
  ExecutableMappingIntent,
  ExecutableMappingRequest,
} from "./types.js";

export function createExecutableMappingError(
  code: ExecutableMappingErrorCode,
  message: string,
  details: ExecutableMappingMetadata = {},
): ExecutableMappingError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromExecutableMappingError(
  error: ExecutableMappingError,
): ExecutableMappingDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createNotExecutableMappingIntent(
  requiredTransportCapabilities: ExecutableMappingIntent["requiredTransportCapabilities"] = [],
): ExecutableMappingIntent {
  return Object.freeze({
    executable: false,
    configured: false,
    transportId: "not_configured",
    requiredTransportCapabilities: Object.freeze([
      ...requiredTransportCapabilities,
    ]),
  });
}

export function createExecutableMappingResult(
  request: ExecutableMappingRequest,
  status: ExecutableMappingStatus,
  error: ExecutableMappingError,
  mappingId: ExecutableMappingResult["mappingId"] = null,
  requiredTransportCapabilities: ExecutableMappingIntent["requiredTransportCapabilities"] = [],
): ExecutableMappingResult {
  return Object.freeze({
    status,
    mappingId,
    providerPlan: request.providerPlan,
    intent: createNotExecutableMappingIntent(requiredTransportCapabilities),
    diagnostics: Object.freeze([diagnosticFromExecutableMappingError(error)]),
    metadata: Object.freeze({ ...request.metadata }),
    error,
    executionStarted: false,
  });
}
