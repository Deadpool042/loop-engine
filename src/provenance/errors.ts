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

export function createApprovalError(
  code: ApprovalErrorCode,
  message: string,
  details: ApprovalProvenanceMetadata = {},
): ApprovalError {
  return Object.freeze({ code, message, details, executionStarted: false });
}

export function diagnosticFromApprovalError(
  error: ApprovalError,
): ApprovalDiagnostic {
  return Object.freeze({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createApprovalValidation(
  error?: ApprovalError,
): ApprovalValidation {
  const diagnostics = error
    ? Object.freeze([diagnosticFromApprovalError(error)])
    : Object.freeze([]);
  return Object.freeze({
    valid: !error,
    diagnostics,
    ...(error ? { error } : {}),
  });
}

export function createApprovalResult(
  provenance: ApprovalProvenance,
  summary: ApprovalSummary,
  validation: ApprovalValidation,
  error?: ApprovalError,
): ApprovalResult {
  return Object.freeze({
    status: error ? "invalid" : provenance.status,
    provenance,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: Object.freeze({ ...provenance.metadata }),
    ...(error ? { error } : {}),
    executionStarted: false,
  });
}
