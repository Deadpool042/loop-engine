// HandoffEligibilityEvaluator is the single pure function that assesses
// reviewed declarative evidence. It performs no handoff and grants no authority.

import type { ApprovalProvenance } from "../provenance/types.js";
import type { ReviewedTransportRequest } from "../review/types.js";
import {
  createHandoffEligibilityError,
  createHandoffEligibilityResult,
} from "./errors.js";
import {
  buildHandoffEligibility,
  summarizeHandoffEligibility as summarizeHandoffEligibilityValue,
} from "./support.js";
import type {
  HandoffEligibilityEvaluator,
  HandoffEligibilityResult,
  HandoffEligibilitySummary,
  HandoffEligibilityValidation,
} from "./types.js";
import { validateHandoffEligibility as validateHandoffEligibilityValue } from "./validation.js";

export const evaluateHandoffEligibility: HandoffEligibilityEvaluator = (
  reviewed,
  provenance,
) => {
  const validation = validateHandoffEligibilityValue(reviewed, provenance);
  const eligibility = buildHandoffEligibility(
    reviewed,
    provenance,
    validation.valid
      ? "evaluated"
      : reviewed || provenance
        ? "invalid"
        : "pending",
  );
  const error = validation.error;
  return createHandoffEligibilityResult(
    eligibility,
    summarizeHandoffEligibilityValue(eligibility),
    validation,
    error,
  );
};

export function validateHandoffEligibility(
  reviewed: ReviewedTransportRequest | null,
  provenance: ApprovalProvenance | null,
): HandoffEligibilityValidation {
  return validateHandoffEligibilityValue(reviewed, provenance);
}

export function summarizeHandoffEligibility(
  result: HandoffEligibilityResult,
): HandoffEligibilitySummary {
  return result.summary;
}

export function normalizeHandoffEligibility(
  result: HandoffEligibilityResult,
): HandoffEligibilityResult {
  return result.validation.valid
    ? result
    : createHandoffEligibilityResult(
        result.eligibility,
        result.summary,
        result.validation,
        result.error ??
          createHandoffEligibilityError(
            "handoff_validation_failed",
            "Handoff eligibility validation failed.",
          ),
      );
}
