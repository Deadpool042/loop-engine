import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { TransportRequest } from "../transport-request/types.js";
import {
  normalizeTransportReview as normalizeTransportReviewWithGate,
  reviewTransportRequest as reviewTransportRequestWithGate,
  summarizeExecutionReviewResult,
  validateTransportReview as validateTransportReviewWithGate,
  type ExecutionReviewResult,
  type ExecutionReviewSummary,
  type ExecutionReviewValidation,
} from "../review/index.js";

export function reviewTransportRequest(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
): ExecutionReviewResult {
  return reviewTransportRequestWithGate(request, authorization);
}

export function validateTransportReview(
  request: TransportRequest,
  authorization: AuthorizationConfiguration,
): ExecutionReviewValidation {
  return validateTransportReviewWithGate(request, authorization);
}

export function summarizeTransportReview(
  result: ExecutionReviewResult,
): ExecutionReviewSummary {
  return summarizeExecutionReviewResult(result);
}

export function normalizeTransportReview(
  result: ExecutionReviewResult,
): ExecutionReviewResult {
  return normalizeTransportReviewWithGate(result);
}
