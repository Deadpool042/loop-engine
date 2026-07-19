/** Immutable metadata registry; never a runtime implementation or adapter. */
export type RuntimeRegistryDescriptor = Readonly<{ id: string; version: string; displayName: string; lifecycleState: string; capabilityReferences: readonly string[] }>;
export type RuntimeRegistryInput = Readonly<{ id: string; version: string; descriptors: readonly RuntimeRegistryDescriptor[]; compatibilityReferences: readonly string[] }>;
export const RUNTIME_REGISTRY_ERROR_CODES = ["runtime_registry_missing", "runtime_registry_invalid", "runtime_registry_descriptor_invalid", "runtime_registry_duplicate_descriptor"] as const;
export type RuntimeRegistryErrorCode = (typeof RUNTIME_REGISTRY_ERROR_CODES)[number];
export type RuntimeRegistryError = Readonly<{ code: RuntimeRegistryErrorCode; message: string }>;
export type RuntimeRegistryResult = Readonly<{ registry: RuntimeRegistryInput; diagnostics: readonly RuntimeRegistryError[]; valid: boolean; metadataOnly: true }>;
