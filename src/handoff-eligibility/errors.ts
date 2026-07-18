import type {
  HandoffEligibilityDiagnostic,
  HandoffEligibilityError,
  HandoffEligibilityErrorCode,
  HandoffEligibilityMetadata,
  HandoffEligibilityResult,
  HandoffEligibilitySummary,
  HandoffEligibilityValidation,
  HandoffEligibility,
} from "./types.js";

export function createHandoffEligibilityError(
  code: HandoffEligibilityErrorCode,
  message: string,
  details: HandoffEligibilityMetadata = {},
): HandoffEligibilityError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromHandoffEligibilityError(
  error: HandoffEligibilityError,
): HandoffEligibilityDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createHandoffEligibilityValidation(
  error?: HandoffEligibilityError,
): HandoffEligibilityValidation {
  const diagnostics = error
    ? Object.freeze([diagnosticFromHandoffEligibilityError(error)])
    : Object.freeze([]);
  return Object.freeze({
    valid: !error,
    diagnostics,
    ...(error ? { error } : {}),
  });
}

export function createHandoffEligibilityResult(
  eligibility: HandoffEligibility,
  summary: HandoffEligibilitySummary,
  validation: HandoffEligibilityValidation,
  error?: HandoffEligibilityError,
): HandoffEligibilityResult {
  return Object.freeze({
    status: eligibility.status,
    decision: eligibility.decision,
    eligibility,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: Object.freeze({ ...eligibility.metadata }),
    ...(error ? { error } : {}),
    handoffAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}
