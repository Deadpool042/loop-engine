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
import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";

export function createHandoffEligibilityError(
  code: HandoffEligibilityErrorCode,
  message: string,
  details: HandoffEligibilityMetadata = {},
): HandoffEligibilityError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as HandoffEligibilityError;
}

export function diagnosticFromHandoffEligibilityError(
  error: HandoffEligibilityError,
): HandoffEligibilityDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as HandoffEligibilityDiagnostic;
}

export function createHandoffEligibilityValidation(
  error?: HandoffEligibilityError,
): HandoffEligibilityValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromHandoffEligibilityError,
  ) as HandoffEligibilityValidation;
}

export function createHandoffEligibilityResult(
  eligibility: HandoffEligibility,
  summary: HandoffEligibilitySummary,
  validation: HandoffEligibilityValidation,
  error?: HandoffEligibilityError,
): HandoffEligibilityResult {
  return freezeReviewArchitectureValue({
    status: eligibility.status,
    decision: eligibility.decision,
    eligibility,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...eligibility.metadata }),
    ...(error ? { error } : {}),
    handoffAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}
