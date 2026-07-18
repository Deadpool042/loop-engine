// DispatchDescriptorBuilder is the single pure function that turns existing
// declarative eligibility and authority evidence into a transport-independent
// descriptor. It performs no dispatch and never crosses the execution boundary.

import type { HandoffEligibilityResult } from "../handoff-eligibility/types.js";
import {
  createDispatchDescriptorError,
  createDispatchDescriptorResult,
} from "./errors.js";
import {
  buildDispatchDescriptor,
  summarizeDispatchDescriptor as summarizeDispatchDescriptorValue,
} from "./support.js";
import type {
  DispatchDescriptorBuilder,
  DispatchDescriptorResult,
  DispatchDescriptorSummary,
  DispatchDescriptorValidation,
  ExecutionAuthority,
} from "./types.js";
import {
  validateDispatchDescriptor as validateDispatchDescriptorValue,
  validateDispatchDescriptorInputs,
} from "./validation.js";

export const createDispatchDescriptor: DispatchDescriptorBuilder = (
  eligibility,
  authority,
) => {
  const inputValidation = validateDispatchDescriptorInputs(
    eligibility,
    authority,
  );
  const descriptor = buildDispatchDescriptor(
    eligibility,
    authority,
    inputValidation.valid
      ? "validated"
      : eligibility || authority
        ? "invalid"
        : "pending",
  );
  const descriptorValidation = inputValidation.valid
    ? validateDispatchDescriptorValue(descriptor)
    : inputValidation;
  const error = descriptorValidation.error;
  return createDispatchDescriptorResult(
    descriptor,
    summarizeDispatchDescriptorValue(descriptor, eligibility, authority),
    descriptorValidation,
    error,
  );
};

export function validateDispatchDescriptor(
  descriptor: ReturnType<typeof buildDispatchDescriptor>,
): DispatchDescriptorValidation {
  return validateDispatchDescriptorValue(descriptor);
}

export function summarizeDispatchDescriptor(
  result: DispatchDescriptorResult,
): DispatchDescriptorSummary {
  return result.summary;
}

export function normalizeDispatchDescriptor(
  result: DispatchDescriptorResult,
): DispatchDescriptorResult {
  return result.validation.valid
    ? result
    : createDispatchDescriptorResult(
        result.descriptor,
        result.summary,
        result.validation,
        result.error ??
          createDispatchDescriptorError(
            "dispatch_validation_failed",
            "DispatchDescriptor validation failed.",
          ),
      );
}
