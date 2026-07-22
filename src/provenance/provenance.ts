// ApprovalProvenance is descriptive evidence only. It is not authorization,
// dispatch, execution, or an adapter request.

import type { AuthorizationConfiguration } from "../authorization/types.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import { createApprovalError, createApprovalResult } from "./errors.js";
import {
  buildApprovalProvenance,
  summarizeApprovalProvenance as summarizeApprovalProvenanceValue,
} from "./support.js";
import type {
  ApprovalProvenance,
  ApprovalResult,
  ApprovalSummary,
  ApprovalValidation,
} from "./types.js";
import { validateApprovalProvenance as validateApprovalProvenanceValue } from "./validation.js";

export function createApprovalProvenance(
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalResult {
  const provenance = buildApprovalProvenance(reviewed, authorization);
  const validation = validateApprovalProvenanceValue(
    provenance,
    reviewed,
    authorization,
  );
  const error = validation.error;
  return createApprovalResult(
    provenance,
    summarizeApprovalProvenanceValue(provenance, reviewed, authorization),
    validation,
    error,
  );
}

export function validateApprovalProvenance(
  provenance: ApprovalProvenance,
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalValidation {
  return validateApprovalProvenanceValue(provenance, reviewed, authorization);
}

export function summarizeApprovalProvenance(
  provenance: ApprovalProvenance,
  reviewed: ReviewedTransportRequest,
  authorization: AuthorizationConfiguration,
): ApprovalSummary {
  return summarizeApprovalProvenanceValue(provenance, reviewed, authorization);
}

export function normalizeApprovalProvenance(
  result: ApprovalResult,
): ApprovalResult {
  return result.validation.valid
    ? result
    : createApprovalResult(
        result.provenance,
        result.summary,
        result.validation,
        result.error ??
          createApprovalError(
            "approval_validation_failed",
            "ApprovalProvenance validation failed.",
          ),
      );
}
