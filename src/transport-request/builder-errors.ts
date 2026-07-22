import type {
  TransportRequestBuilderDiagnostic,
  TransportRequestBuilderError,
  TransportRequestBuilderErrorCode,
  TransportRequestBuilderResult,
  TransportRequestBuilderSummary,
  TransportRequestBuilderValidation,
} from "./builder.js";
import type { TransportRequest, TransportRequestMetadata } from "./types.js";
import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";

export function createTransportRequestBuilderError(
  code: TransportRequestBuilderErrorCode,
  message: string,
  details: TransportRequestMetadata = {},
): TransportRequestBuilderError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as TransportRequestBuilderError;
}

export function diagnosticFromTransportRequestBuilderError(
  error: TransportRequestBuilderError,
): TransportRequestBuilderDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as TransportRequestBuilderDiagnostic;
}

export function createTransportRequestBuilderValidation(
  error?: TransportRequestBuilderError,
): TransportRequestBuilderValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromTransportRequestBuilderError,
  ) as TransportRequestBuilderValidation;
}

export function createTransportRequestBuilderResult(
  request: TransportRequest | null,
  summary: TransportRequestBuilderSummary,
  validation: TransportRequestBuilderValidation,
  error: TransportRequestBuilderError | undefined,
  metadata: TransportRequestMetadata,
): TransportRequestBuilderResult {
  return freezeReviewArchitectureValue({
    status: request === null ? "rejected" : "built",
    request,
    summary: freezeReviewArchitectureValue({ ...summary }),
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...metadata }),
    ...(error === undefined ? {} : { error }),
    executionStarted: false,
  });
}
