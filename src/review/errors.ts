import type {
  ExecutionReview,
  ExecutionReviewDiagnostic,
  ExecutionReviewError,
  ExecutionReviewErrorCode,
  ExecutionReviewMetadata,
  ExecutionReviewResult,
  ExecutionReviewSummary,
  ExecutionReviewValidation,
  ReviewedTransportRequest,
} from "./types.js";
import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";

export function createExecutionReviewError(
  code: ExecutionReviewErrorCode,
  message: string,
  details: ExecutionReviewMetadata = {},
): ExecutionReviewError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as ExecutionReviewError;
}

export function diagnosticFromExecutionReviewError(
  error: ExecutionReviewError,
): ExecutionReviewDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as ExecutionReviewDiagnostic;
}

export function createExecutionReviewValidation(
  error?: ExecutionReviewError,
): ExecutionReviewValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromExecutionReviewError,
  ) as ExecutionReviewValidation;
}

export function createExecutionReviewResult(
  review: ExecutionReview,
  request: ReviewedTransportRequest | null,
  summary: ExecutionReviewSummary,
  validation: ExecutionReviewValidation,
  error?: ExecutionReviewError,
): ExecutionReviewResult {
  return freezeReviewArchitectureValue({
    status: request ? "reviewed" : "rejected",
    review,
    request,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...review.metadata }),
    ...(error ? { error } : {}),
    executionStarted: false,
  });
}
