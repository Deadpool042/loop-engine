import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";
import type {
  BoundaryHandoff,
  BoundaryHandoffDiagnostic,
  BoundaryHandoffError,
  BoundaryHandoffErrorCode,
  BoundaryHandoffMetadata,
  BoundaryHandoffResult,
  BoundaryHandoffSummary,
  BoundaryHandoffValidation,
} from "./types.js";

export function createBoundaryHandoffError(
  code: BoundaryHandoffErrorCode,
  message: string,
  details: BoundaryHandoffMetadata = {},
): BoundaryHandoffError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as BoundaryHandoffError;
}

export function diagnosticFromBoundaryHandoffError(
  error: BoundaryHandoffError,
): BoundaryHandoffDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as BoundaryHandoffDiagnostic;
}

export function createBoundaryHandoffValidation(
  error?: BoundaryHandoffError,
): BoundaryHandoffValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromBoundaryHandoffError,
  ) as BoundaryHandoffValidation;
}

export function createBoundaryHandoffResult(
  handoff: BoundaryHandoff,
  summary: BoundaryHandoffSummary,
  validation: BoundaryHandoffValidation,
  error?: BoundaryHandoffError,
): BoundaryHandoffResult {
  return freezeReviewArchitectureValue({
    status: handoff.status,
    handoff,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...handoff.metadata }),
    ...(error ? { error } : {}),
    ready: false,
    accepted: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}
