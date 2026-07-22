import type { ExecutionAuthority } from "../../dispatch/types.js";
import { createOperatorApprovalError, createOperatorApprovalResult } from "./errors.js";
import {
  buildOperatorApprovalRFC,
  summarizeOperatorApprovalRFC as summarizeOperatorApprovalRFCValue,
} from "./support.js";
import type { OperatorApprovalBuilder, OperatorApprovalResult, OperatorApprovalReview, OperatorApprovalSummary, OperatorApprovalValidation } from "./types.js";
import { validateOperatorApprovalInput, validateOperatorApprovalRFC as validateValue } from "./validation.js";

export const createOperatorApprovalRFC: OperatorApprovalBuilder = (authority, review) => {
  const inputValidation = validateOperatorApprovalInput(authority, review);
  const approval = buildOperatorApprovalRFC(authority, review);
  const validation = inputValidation.valid ? validateValue(approval) : inputValidation;
  return createOperatorApprovalResult(
    approval,
    summarizeOperatorApprovalRFCValue(approval),
    validation,
    validation.error,
  );
};

export function validateOperatorApprovalRFC(approval: OperatorApprovalResult["approval"] | null): OperatorApprovalValidation {
  return validateValue(approval);
}

export function summarizeOperatorApprovalRFC(result: OperatorApprovalResult): OperatorApprovalSummary {
  return result.summary;
}

export function normalizeOperatorApprovalRFC(result: OperatorApprovalResult): OperatorApprovalResult {
  return result.validation.valid
    ? result
    : createOperatorApprovalResult(
        result.approval,
        result.summary,
        result.validation,
        result.error ?? createOperatorApprovalError("operator_approval_validation_failed", "OperatorApprovalRFC validation failed."),
      );
}
