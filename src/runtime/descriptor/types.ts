/** Immutable metadata for an eligible runtime; never an executable implementation. */
export type RuntimeDescriptorInput = Readonly<{
  id: string;
  displayName: string;
  version: string;
  lifecycleState: "declared" | "eligible" | "inactive";
  capabilityReferences: readonly string[];
  compatibilityReferences: readonly string[];
  supportedExecutionClasses: readonly string[];
  declaredConstraints: readonly string[];
}>;

export const RUNTIME_DESCRIPTOR_ERROR_CODES = [
  "runtime_descriptor_missing",
  "runtime_descriptor_invalid",
  "runtime_descriptor_metadata_invalid",
] as const;
export type RuntimeDescriptorErrorCode = (typeof RUNTIME_DESCRIPTOR_ERROR_CODES)[number];
export type RuntimeDescriptorError = Readonly<{
  code: RuntimeDescriptorErrorCode;
  message: string;
}>;
export type RuntimeDescriptorResult = Readonly<{
  descriptor: RuntimeDescriptorInput;
  diagnostics: readonly RuntimeDescriptorError[];
  valid: boolean;
  metadataOnly: true;
}>;
