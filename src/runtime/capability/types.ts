/** Immutable declaration of what a runtime can provide or accept. */
export type RuntimeCapabilityInput = Readonly<{
  id: string;
  category: string;
  version: string;
  supportedFeatures: readonly string[];
  declaredConstraints: readonly string[];
  compatibilityReferences: readonly string[];
}>;

/** Immutable declaration of what a Runtime Request requires. */
export type RuntimeCapabilityRequirementInput = Readonly<{
  id: string;
  category: string;
  version: string;
  requiredFeatures: readonly string[];
  acceptedConstraints: readonly string[];
}>;

export const RUNTIME_CAPABILITY_ERROR_CODES = [
  "runtime_capability_missing",
  "runtime_capability_invalid",
  "runtime_capability_metadata_invalid",
  "runtime_capability_requirement_missing",
  "runtime_capability_requirement_invalid",
  "runtime_capability_requirement_metadata_invalid",
  "runtime_capability_identifier_mismatch",
  "runtime_capability_category_mismatch",
  "runtime_capability_version_mismatch",
  "runtime_capability_features_missing",
  "runtime_capability_constraints_unaccepted",
] as const;

export type RuntimeCapabilityErrorCode =
  (typeof RUNTIME_CAPABILITY_ERROR_CODES)[number];

export type RuntimeCapabilityError = Readonly<{
  code: RuntimeCapabilityErrorCode;
  message: string;
}>;

export type RuntimeCapabilityResult = Readonly<{
  capability: RuntimeCapabilityInput;
  diagnostics: readonly RuntimeCapabilityError[];
  valid: boolean;
  metadataOnly: true;
}>;

export type RuntimeCapabilityCompatibilityResult = Readonly<{
  requirement: RuntimeCapabilityRequirementInput;
  capability: RuntimeCapabilityInput;
  diagnostics: readonly RuntimeCapabilityError[];
  missingFeatures: readonly string[];
  unacceptedConstraints: readonly string[];
  compatible: boolean;
  metadataOnly: true;
}>;
