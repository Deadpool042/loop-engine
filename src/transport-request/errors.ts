import type {
  TransportRequest,
  TransportRequestDiagnostic,
  TransportRequestError,
  TransportRequestErrorCode,
  TransportRequestMetadata,
  TransportRequestResult,
  TransportRequestStatus,
  TransportRequestSummary,
} from "./types.js";
import {
  createReviewArchitectureError,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";

export function createTransportRequestError(
  code: TransportRequestErrorCode,
  message: string,
  details: TransportRequestMetadata = {},
): TransportRequestError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as TransportRequestError;
}

export function diagnosticFromTransportRequestError(
  error: TransportRequestError,
): TransportRequestDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as TransportRequestDiagnostic;
}

export function createTransportRequestResult(
  request: TransportRequest,
  status: TransportRequestStatus,
  error: TransportRequestError,
  summary: TransportRequestSummary,
): TransportRequestResult {
  const diagnostic = diagnosticFromTransportRequestError(error);
  return freezeReviewArchitectureValue({
    status,
    request,
    summary: freezeReviewArchitectureValue({ ...summary }),
    validation: freezeReviewArchitectureValue({
      valid: false,
      diagnostics: freezeReviewArchitectureValue([diagnostic]),
      error,
    }),
    diagnostics: freezeReviewArchitectureValue([diagnostic]),
    metadata: freezeReviewArchitectureValue({ ...request.metadata }),
    error,
    executionStarted: false,
  });
}
