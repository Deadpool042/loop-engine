// BoundaryHandoffBuilder is the pure declarative bridge from a validated
// DispatchDescriptorResult to an inert boundary object. It performs no handoff.

import type { DispatchDescriptorResult } from "../dispatch/types.js";
import {
  createBoundaryHandoffError,
  createBoundaryHandoffResult,
} from "./errors.js";
import {
  buildBoundaryHandoff,
  summarizeBoundaryHandoff as summarizeBoundaryHandoffValue,
} from "./support.js";
import type {
  BoundaryHandoffBuilder,
  BoundaryHandoffResult,
  BoundaryHandoffSummary,
  BoundaryHandoffValidation,
} from "./types.js";
import {
  validateBoundaryHandoff as validateBoundaryHandoffValue,
  validateBoundaryHandoffInput,
} from "./validation.js";

export const createBoundaryHandoff: BoundaryHandoffBuilder = (descriptor) => {
  const inputValidation = validateBoundaryHandoffInput(descriptor);
  const handoff = buildBoundaryHandoff(
    descriptor,
    inputValidation.valid ? "validated" : descriptor ? "invalid" : "pending",
  );
  const validation = inputValidation.valid
    ? validateBoundaryHandoffValue(handoff)
    : inputValidation;
  const error = validation.error;
  return createBoundaryHandoffResult(
    handoff,
    summarizeBoundaryHandoffValue(handoff),
    validation,
    error,
  );
};

export function validateBoundaryHandoff(
  handoff: BoundaryHandoffResult["handoff"] | null,
): BoundaryHandoffValidation {
  return validateBoundaryHandoffValue(handoff);
}

export function summarizeBoundaryHandoff(
  result: BoundaryHandoffResult,
): BoundaryHandoffSummary {
  return result.summary;
}

export function normalizeBoundaryHandoff(
  result: BoundaryHandoffResult,
): BoundaryHandoffResult {
  return result.validation.valid
    ? result
    : createBoundaryHandoffResult(
        result.handoff,
        result.summary,
        result.validation,
        result.error ??
          createBoundaryHandoffError(
            "handoff_invalid",
            "BoundaryHandoff validation failed.",
          ),
      );
}
