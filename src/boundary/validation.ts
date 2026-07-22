import type { DispatchDescriptorResult } from "../dispatch/types.js";
import {
  createBoundaryHandoffError,
  createBoundaryHandoffValidation,
} from "./errors.js";
import type {
  BoundaryHandoff,
  BoundaryHandoffErrorCode,
  BoundaryHandoffValidation,
} from "./types.js";

function invalid(
  code: BoundaryHandoffErrorCode,
  message: string,
): BoundaryHandoffValidation {
  return createBoundaryHandoffValidation(
    createBoundaryHandoffError(code, message),
  );
}

export function validateBoundaryHandoffInput(
  descriptor: DispatchDescriptorResult | null,
): BoundaryHandoffValidation {
  if (!descriptor) {
    return invalid(
      "handoff_missing",
      "BoundaryHandoff requires a DispatchDescriptorResult.",
    );
  }
  if (!descriptor.validation.valid || descriptor.status !== "validated") {
    return invalid(
      "handoff_invalid",
      "BoundaryHandoff requires a valid DispatchDescriptorResult.",
    );
  }
  if (!descriptor.summary.descriptorComplete) {
    return invalid(
      "handoff_configuration_missing",
      "BoundaryHandoff requires complete descriptor evidence.",
    );
  }
  if (!descriptor.summary.eligibilityConsistent) {
    return invalid(
      "handoff_review_required",
      "BoundaryHandoff requires explicit eligible review evidence.",
    );
  }
  if (!descriptor.summary.authorityConsistent) {
    return invalid(
      "handoff_not_authorized",
      "BoundaryHandoff requires explicit authority evidence.",
    );
  }
  if (
    descriptor.readyForBoundary ||
    descriptor.dispatchable ||
    descriptor.executable
  ) {
    return invalid(
      "handoff_not_ready",
      "BoundaryHandoff remains declarative and not boundary-ready.",
    );
  }
  return createBoundaryHandoffValidation();
}

export function validateBoundaryHandoff(
  handoff: BoundaryHandoff | null,
): BoundaryHandoffValidation {
  if (!handoff) {
    return invalid("handoff_missing", "BoundaryHandoff is missing.");
  }
  if (!handoff.id || !handoff.evidence.descriptorId) {
    return invalid(
      "handoff_invalid",
      "BoundaryHandoff identity or descriptor evidence is incomplete.",
    );
  }
  if (handoff.status === "inactive") {
    return invalid("handoff_inactive", "BoundaryHandoff is inactive.");
  }
  if (
    handoff.ready ||
    handoff.accepted ||
    handoff.dispatchable ||
    handoff.executable
  ) {
    return invalid(
      "handoff_not_ready",
      "BoundaryHandoff must remain not ready, not accepted, not dispatchable, and not executable.",
    );
  }
  return createBoundaryHandoffValidation();
}
