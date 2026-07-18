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

export function createExecutionReviewError(
  code: ExecutionReviewErrorCode,
  message: string,
  details: ExecutionReviewMetadata = {},
): ExecutionReviewError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromExecutionReviewError(
  error: ExecutionReviewError,
): ExecutionReviewDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createExecutionReviewValidation(
  error?: ExecutionReviewError,
): ExecutionReviewValidation {
  const diagnostics = error
    ? Object.freeze([diagnosticFromExecutionReviewError(error)])
    : Object.freeze([]);
  return Object.freeze({
    valid: !error,
    diagnostics,
    ...(error ? { error } : {}),
  });
}

export function createExecutionReviewResult(
  review: ExecutionReview,
  request: ReviewedTransportRequest | null,
  summary: ExecutionReviewSummary,
  validation: ExecutionReviewValidation,
  error?: ExecutionReviewError,
): ExecutionReviewResult {
  return Object.freeze({
    status: request ? "reviewed" : "rejected",
    review,
    request,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: Object.freeze({ ...review.metadata }),
    ...(error ? { error } : {}),
    executionStarted: false,
  });
}
