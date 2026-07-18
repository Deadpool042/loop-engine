import type {
  OperatorApprovalDiagnostic,
  OperatorApprovalError,
  OperatorApprovalErrorCode,
  OperatorApprovalMetadata,
  OperatorApprovalResult,
  OperatorApprovalRFC,
  OperatorApprovalSummary,
  OperatorApprovalValidation,
} from "./types.js";
import { freezeOperatorApprovalValue } from "./support.js";

export function createOperatorApprovalError(
  code: OperatorApprovalErrorCode,
  message: string,
  details: OperatorApprovalMetadata = {},
): OperatorApprovalError {
  return freezeOperatorApprovalValue({ code, message, details, executionStarted: false });
}

export function diagnosticFromOperatorApprovalError(
  error: OperatorApprovalError,
): OperatorApprovalDiagnostic {
  return freezeOperatorApprovalValue({
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

export function createOperatorApprovalValidation(
  error?: OperatorApprovalError,
): OperatorApprovalValidation {
  return freezeOperatorApprovalValue({
    valid: !error,
    diagnostics: error ? [diagnosticFromOperatorApprovalError(error)] : [],
    ...(error ? { error } : {}),
  });
}

export function createOperatorApprovalResult(
  approval: OperatorApprovalRFC,
  summary: OperatorApprovalSummary,
  validation: OperatorApprovalValidation,
  error?: OperatorApprovalError,
): OperatorApprovalResult {
  return freezeOperatorApprovalValue({
    state: approval.state,
    approval,
    evaluation: {
      state: approval.state,
      requirements: approval.requirements,
      validation,
      approved: approval.approved,
      revoked: approval.revoked,
      expired: approval.expired,
      executionAllowed: false,
      executionStarted: false,
    },
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: approval.metadata,
    ...(error ? { error } : {}),
    approved: approval.approved,
    revoked: approval.revoked,
    expired: approval.expired,
    executionAllowed: false,
    executionStarted: false,
  });
}
