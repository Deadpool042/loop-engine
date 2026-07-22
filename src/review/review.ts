// ExecutionReviewGate is the only supported review mechanism before any future
// execution handoff. It produces reviewed declarative evidence only.

import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { TransportRequest } from "../transport-request/types.js";
import {
  createExecutionReviewError,
  createExecutionReviewResult,
  createExecutionReviewValidation,
} from "./errors.js";
import {
  buildReviewedTransportRequest,
  createExecutionReviewRecord,
  normalizeExecutionReviewMetadata,
  summarizeTransportReview,
} from "./support.js";
import type {
  ExecutionReviewResult,
  ExecutionReviewSummary,
  ExecutionReviewValidation,
} from "./types.js";
import { validateTransportReview } from "./validation.js";

export type ExecutionReviewGate = (
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
) => ExecutionReviewResult;

export const reviewTransportRequest: ExecutionReviewGate = (
  request,
  authorization,
) => {
  const metadata = normalizeExecutionReviewMetadata(request, authorization);
  const review = createExecutionReviewRecord(request, authorization, metadata);
  const validation = validateTransportReview(request, authorization);
  if (!validation.valid) {
    const error =
      validation.error ??
      createExecutionReviewError(
        "review_validation_failed",
        "Execution review validation failed.",
      );
    return createExecutionReviewResult(
      review,
      null,
      summarizeTransportReview(request, authorization, null),
      validation,
      error,
    );
  }

  const reviewed = buildReviewedTransportRequest(request, authorization);
  return createExecutionReviewResult(
    review,
    reviewed,
    summarizeTransportReview(request, authorization, reviewed),
    validation,
  );
};

export function normalizeTransportReview(
  result: ExecutionReviewResult,
): ExecutionReviewResult {
  return result;
}

export function summarizeExecutionReviewResult(
  result: ExecutionReviewResult,
): ExecutionReviewSummary {
  return result.summary;
}

export function validateExecutionReviewResult(
  result: ExecutionReviewResult,
): ExecutionReviewValidation {
  return result.validation.valid
    ? result.validation
    : createExecutionReviewValidation(
        result.error ??
          createExecutionReviewError(
            "review_validation_failed",
            "Execution review result is invalid.",
          ),
      );
}
