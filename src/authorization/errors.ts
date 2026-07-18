import type {
  AuthorizationConfigurationDiagnostic,
  AuthorizationConfigurationError,
  AuthorizationConfigurationErrorCode,
  AuthorizationConfigurationMetadata,
  AuthorizationConfigurationRequest,
  AuthorizationConfigurationResult,
  AuthorizationConfigurationStatus,
  AuthorizationConfigurationSummary,
} from "./types.js";

export function createAuthorizationConfigurationError(
  code: AuthorizationConfigurationErrorCode,
  message: string,
  details: AuthorizationConfigurationMetadata = {},
): AuthorizationConfigurationError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromAuthorizationConfigurationError(
  error: AuthorizationConfigurationError,
): AuthorizationConfigurationDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createAuthorizationConfigurationResult(
  request: AuthorizationConfigurationRequest,
  status: AuthorizationConfigurationStatus,
  error: AuthorizationConfigurationError,
  summary: AuthorizationConfigurationSummary,
  configurationId: AuthorizationConfigurationResult["configurationId"] = null,
): AuthorizationConfigurationResult {
  const diagnostic = diagnosticFromAuthorizationConfigurationError(error);
  return Object.freeze({
    status,
    configurationId,
    decision: request.decision,
    summary: Object.freeze({ ...summary }),
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
