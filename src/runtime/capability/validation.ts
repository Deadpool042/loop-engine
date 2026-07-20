import { runtimeCapabilityError } from "./errors.js";
import type {
  RuntimeCapabilityError,
  RuntimeCapabilityInput,
  RuntimeCapabilityRequirementInput,
} from "./types.js";

export function validateRuntimeCapability(
  input: RuntimeCapabilityInput | null,
): readonly RuntimeCapabilityError[] {
  if (!input) {
    return [
      runtimeCapabilityError(
        "runtime_capability_missing",
        "Runtime Capability input is required.",
      ),
    ];
  }
  if (!input.id || !input.category || !input.version) {
    return [
      runtimeCapabilityError(
        "runtime_capability_invalid",
        "Runtime Capability identifier, category, and version are required.",
      ),
    ];
  }
  if (
    !Array.isArray(input.supportedFeatures) ||
    !Array.isArray(input.declaredConstraints) ||
    !Array.isArray(input.compatibilityReferences)
  ) {
    return [
      runtimeCapabilityError(
        "runtime_capability_metadata_invalid",
        "Runtime Capability metadata is invalid.",
      ),
    ];
  }
  return [];
}

export function validateRuntimeCapabilityRequirement(
  input: RuntimeCapabilityRequirementInput | null,
): readonly RuntimeCapabilityError[] {
  if (!input) {
    return [
      runtimeCapabilityError(
        "runtime_capability_requirement_missing",
        "Runtime Capability requirement is required.",
      ),
    ];
  }
  if (!input.id || !input.category || !input.version) {
    return [
      runtimeCapabilityError(
        "runtime_capability_requirement_invalid",
        "Runtime Capability requirement identifier, category, and version are required.",
      ),
    ];
  }
  if (
    !Array.isArray(input.requiredFeatures) ||
    !Array.isArray(input.acceptedConstraints)
  ) {
    return [
      runtimeCapabilityError(
        "runtime_capability_requirement_metadata_invalid",
        "Runtime Capability requirement metadata is invalid.",
      ),
    ];
  }
  return [];
}
