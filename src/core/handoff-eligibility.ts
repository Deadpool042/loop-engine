import type { ApprovalProvenance } from "../provenance/types.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import {
  evaluateHandoffEligibility as evaluateHandoffEligibilityWithContracts,
  normalizeHandoffEligibility as normalizeHandoffEligibilityWithContracts,
  summarizeHandoffEligibility as summarizeHandoffEligibilityWithContracts,
  validateHandoffEligibility as validateHandoffEligibilityWithContracts,
  type HandoffEligibilityResult,
  type HandoffEligibilitySummary,
  type HandoffEligibilityValidation,
} from "../handoff-eligibility/index.js";

export function evaluateHandoffEligibility(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): HandoffEligibilityResult {
  return evaluateHandoffEligibilityWithContracts(reviewed, provenance);
}

export function validateHandoffEligibility(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): HandoffEligibilityValidation {
  return validateHandoffEligibilityWithContracts(reviewed, provenance);
}

export function summarizeHandoffEligibility(
  result: HandoffEligibilityResult,
): HandoffEligibilitySummary {
  return summarizeHandoffEligibilityWithContracts(result);
}

export function normalizeHandoffEligibility(
  result: HandoffEligibilityResult,
): HandoffEligibilityResult {
  return normalizeHandoffEligibilityWithContracts(result);
}
