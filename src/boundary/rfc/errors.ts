import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../../review-architecture/shared.js";
import type {
  ExecutionBoundaryDiagnostic,
  ExecutionBoundaryError,
  ExecutionBoundaryErrorCode,
  ExecutionBoundaryEvaluation,
  ExecutionBoundaryMetadata,
  ExecutionBoundaryResult,
  ExecutionBoundaryRFC,
  ExecutionBoundarySummary,
  ExecutionBoundaryValidation,
} from "./types.js";

export function createExecutionBoundaryError(
  code: ExecutionBoundaryErrorCode,
  message: string,
  details: ExecutionBoundaryMetadata = {},
): ExecutionBoundaryError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as ExecutionBoundaryError;
}

export function diagnosticFromExecutionBoundaryError(
  error: ExecutionBoundaryError,
): ExecutionBoundaryDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as ExecutionBoundaryDiagnostic;
}

export function createExecutionBoundaryValidation(
  error?: ExecutionBoundaryError,
): ExecutionBoundaryValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromExecutionBoundaryError,
  ) as ExecutionBoundaryValidation;
}

export function createExecutionBoundaryResult(
  rfc: ExecutionBoundaryRFC,
  summary: ExecutionBoundarySummary,
  validation: ExecutionBoundaryValidation,
  error?: ExecutionBoundaryError,
): ExecutionBoundaryResult {
  const evaluation: ExecutionBoundaryEvaluation = freezeReviewArchitectureValue({
    invariants: rfc.invariants,
    summary,
    validation,
    boundarySatisfied: false,
    crossingAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
  return freezeReviewArchitectureValue({
    status: rfc.status,
    rfc,
    evaluation,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...rfc.metadata }),
    ...(error ? { error } : {}),
    boundarySatisfied: false,
    crossingAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}
