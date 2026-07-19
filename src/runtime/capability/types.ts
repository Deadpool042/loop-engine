/** Immutable RuntimeCapability metadata; never an implementation or adapter. */
export type RuntimeCapabilityInput = Readonly<{ id: string; category: string; version: string; supportedFeatures: readonly string[]; declaredConstraints: readonly string[]; compatibilityReferences: readonly string[] }>;
export const RUNTIME_CAPABILITY_ERROR_CODES = ["runtime_capability_missing", "runtime_capability_invalid", "runtime_capability_metadata_invalid"] as const;
export type RuntimeCapabilityErrorCode = (typeof RUNTIME_CAPABILITY_ERROR_CODES)[number];
export type RuntimeCapabilityError = Readonly<{ code: RuntimeCapabilityErrorCode; message: string }>;
export type RuntimeCapabilityResult = Readonly<{ capability: RuntimeCapabilityInput; diagnostics: readonly RuntimeCapabilityError[]; valid: boolean; metadataOnly: true }>;
