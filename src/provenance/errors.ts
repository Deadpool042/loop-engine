import type {
  ApprovalDiagnostic,
  ApprovalError,
  ApprovalErrorCode,
  ApprovalProvenance,
  ApprovalProvenanceMetadata,
  ApprovalResult,
  ApprovalSummary,
  ApprovalValidation,
} from "./types.js";
import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";

export function createApprovalError(
  code: ApprovalErrorCode,
  message: string,
  details: ApprovalProvenanceMetadata = {},
): ApprovalError {
  return createReviewArchitectureError(code, message, details) as ApprovalError;
}

export function diagnosticFromApprovalError(
  error: ApprovalError,
): ApprovalDiagnostic {
  return diagnosticFromReviewArchitectureError(error) as ApprovalDiagnostic;
}

export function createApprovalValidation(
  error?: ApprovalError,
): ApprovalValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromApprovalError,
  ) as ApprovalValidation;
}

export function createApprovalResult(
  provenance: ApprovalProvenance,
  summary: ApprovalSummary,
  validation: ApprovalValidation,
  error?: ApprovalError,
): ApprovalResult {
  return freezeReviewArchitectureValue({
    status: error ? "invalid" : provenance.status,
    provenance,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...provenance.metadata }),
    ...(error ? { error } : {}),
    executionStarted: false,
  });
}
