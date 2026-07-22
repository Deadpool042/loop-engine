import { runtimeCapabilityError } from "./errors.js";
import { freezeRuntimeCapabilityValue } from "./support.js";
import {
  validateRuntimeCapability,
  validateRuntimeCapabilityRequirement,
} from "./validation.js";
import type {
  RuntimeCapabilityCompatibilityResult,
  RuntimeCapabilityError,
  RuntimeCapabilityInput,
  RuntimeCapabilityRequirementInput,
  RuntimeCapabilityResult,
} from "./types.js";

const ordered = (values: readonly string[]): readonly string[] =>
  [...values].sort();

const orderedDiagnostics = (
  diagnostics: readonly RuntimeCapabilityError[],
): readonly RuntimeCapabilityError[] =>
  [...diagnostics].sort((left, right) => left.code.localeCompare(right.code));

export const createRuntimeCapability = (
  input: RuntimeCapabilityInput,
): RuntimeCapabilityInput =>
  freezeRuntimeCapabilityValue({
    ...input,
    supportedFeatures: ordered(input.supportedFeatures),
    declaredConstraints: ordered(input.declaredConstraints),
    compatibilityReferences: ordered(input.compatibilityReferences),
  });

export const createRuntimeCapabilityRequirement = (
  input: RuntimeCapabilityRequirementInput,
): RuntimeCapabilityRequirementInput =>
  freezeRuntimeCapabilityValue({
    ...input,
    requiredFeatures: ordered(input.requiredFeatures),
    acceptedConstraints: ordered(input.acceptedConstraints),
  });

export function evaluateRuntimeCapability(
  input: RuntimeCapabilityInput | null,
): RuntimeCapabilityResult {
  // Runtime Capability is metadata only and never executes.
  const diagnostics = freezeRuntimeCapabilityValue(
    orderedDiagnostics(validateRuntimeCapability(input)),
  );
  const capability = input
    ? createRuntimeCapability(input)
    : ({} as RuntimeCapabilityInput);

  return freezeRuntimeCapabilityValue({
    capability,
    diagnostics,
    valid: diagnostics.length === 0,
    metadataOnly: true as const,
  }) as RuntimeCapabilityResult;
}

export function evaluateRuntimeCapabilityCompatibility(
  requirementInput: RuntimeCapabilityRequirementInput | null,
  capabilityInput: RuntimeCapabilityInput | null,
): RuntimeCapabilityCompatibilityResult {
  const requirementDiagnostics =
    validateRuntimeCapabilityRequirement(requirementInput);
  const capabilityDiagnostics = validateRuntimeCapability(capabilityInput);
  const requirement = requirementInput
    ? createRuntimeCapabilityRequirement(requirementInput)
    : ({} as RuntimeCapabilityRequirementInput);
  const capability = capabilityInput
    ? createRuntimeCapability(capabilityInput)
    : ({} as RuntimeCapabilityInput);
  const missingFeatures =
    requirementInput && capabilityInput
      ? ordered(
          requirement.requiredFeatures.filter(
            (feature) => !capability.supportedFeatures.includes(feature),
          ),
        )
      : [];
  const unacceptedConstraints =
    requirementInput && capabilityInput
      ? ordered(
          capability.declaredConstraints.filter(
            (constraint) =>
              !requirement.acceptedConstraints.includes(constraint),
          ),
        )
      : [];
  const diagnostics: RuntimeCapabilityError[] = [
    ...requirementDiagnostics,
    ...capabilityDiagnostics,
  ];

  if (requirementInput && capabilityInput) {
    if (requirement.id !== capability.id) {
      diagnostics.push(
        runtimeCapabilityError(
          "runtime_capability_identifier_mismatch",
          "Runtime Capability identifier does not satisfy the requirement.",
        ),
      );
    }
    if (requirement.category !== capability.category) {
      diagnostics.push(
        runtimeCapabilityError(
          "runtime_capability_category_mismatch",
          "Runtime Capability category does not satisfy the requirement.",
        ),
      );
    }
    if (requirement.version !== capability.version) {
      diagnostics.push(
        runtimeCapabilityError(
          "runtime_capability_version_mismatch",
          "Runtime Capability version does not satisfy the requirement.",
        ),
      );
    }
    if (missingFeatures.length > 0) {
      diagnostics.push(
        runtimeCapabilityError(
          "runtime_capability_features_missing",
          "Runtime Capability does not provide every required feature.",
        ),
      );
    }
    if (unacceptedConstraints.length > 0) {
      diagnostics.push(
        runtimeCapabilityError(
          "runtime_capability_constraints_unaccepted",
          "Runtime Capability declares constraints not accepted by the requirement.",
        ),
      );
    }
  }

  const normalizedDiagnostics = freezeRuntimeCapabilityValue(
    orderedDiagnostics(diagnostics),
  );

  return freezeRuntimeCapabilityValue({
    requirement,
    capability,
    diagnostics: normalizedDiagnostics,
    missingFeatures,
    unacceptedConstraints,
    compatible: normalizedDiagnostics.length === 0,
    metadataOnly: true as const,
  }) as RuntimeCapabilityCompatibilityResult;
}

export const summarizeRuntimeCapability = (result: RuntimeCapabilityResult) =>
  freezeRuntimeCapabilityValue({
    id: result.capability.id,
    version: result.capability.version,
    valid: result.valid,
    metadataOnly: true as const,
  });

export const summarizeRuntimeCapabilityCompatibility = (
  result: RuntimeCapabilityCompatibilityResult,
) =>
  freezeRuntimeCapabilityValue({
    requirementId: result.requirement.id,
    capabilityId: result.capability.id,
    compatible: result.compatible,
    missingFeatures: ordered(result.missingFeatures),
    unacceptedConstraints: ordered(result.unacceptedConstraints),
    diagnosticCodes: ordered(
      result.diagnostics.map((diagnostic) => diagnostic.code),
    ),
    metadataOnly: true as const,
  });
