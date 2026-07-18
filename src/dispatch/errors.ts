import {
  createReviewArchitectureError,
  createReviewArchitectureValidation,
  diagnosticFromReviewArchitectureError,
  freezeReviewArchitectureValue,
} from "../review-architecture/shared.js";
import type {
  DispatchDescriptor,
  DispatchDescriptorDiagnostic,
  DispatchDescriptorError,
  DispatchDescriptorErrorCode,
  DispatchDescriptorMetadata,
  DispatchDescriptorResult,
  DispatchDescriptorSummary,
  DispatchDescriptorValidation,
} from "./types.js";

export function createDispatchDescriptorError(
  code: DispatchDescriptorErrorCode,
  message: string,
  details: DispatchDescriptorMetadata = {},
): DispatchDescriptorError {
  return createReviewArchitectureError(
    code,
    message,
    details,
  ) as DispatchDescriptorError;
}

export function diagnosticFromDispatchDescriptorError(
  error: DispatchDescriptorError,
): DispatchDescriptorDiagnostic {
  return diagnosticFromReviewArchitectureError(
    error,
  ) as DispatchDescriptorDiagnostic;
}

export function createDispatchDescriptorValidation(
  error?: DispatchDescriptorError,
): DispatchDescriptorValidation {
  return createReviewArchitectureValidation(
    error,
    diagnosticFromDispatchDescriptorError,
  ) as DispatchDescriptorValidation;
}

export function createDispatchDescriptorResult(
  descriptor: DispatchDescriptor,
  summary: DispatchDescriptorSummary,
  validation: DispatchDescriptorValidation,
  error?: DispatchDescriptorError,
): DispatchDescriptorResult {
  return freezeReviewArchitectureValue({
    status: descriptor.status,
    descriptor,
    summary,
    validation,
    diagnostics: validation.diagnostics,
    metadata: freezeReviewArchitectureValue({ ...descriptor.metadata }),
    ...(error ? { error } : {}),
    readyForBoundary: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}
