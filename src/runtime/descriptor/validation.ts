import { runtimeDescriptorError } from "./errors.js";
import type { RuntimeDescriptorError, RuntimeDescriptorInput } from "./types.js";
export function validateRuntimeDescriptor(input: RuntimeDescriptorInput | null): readonly RuntimeDescriptorError[] {
  if (!input) return [runtimeDescriptorError("runtime_descriptor_missing", "Runtime Descriptor input is required.")];
  if (!input.id || !input.displayName || !input.version) return [runtimeDescriptorError("runtime_descriptor_invalid", "Runtime Descriptor identifier, name, and version are required.")];
  if (!input.lifecycleState || !Array.isArray(input.capabilityReferences) || !Array.isArray(input.compatibilityReferences) || !Array.isArray(input.supportedExecutionClasses) || !Array.isArray(input.declaredConstraints)) return [runtimeDescriptorError("runtime_descriptor_metadata_invalid", "Runtime Descriptor metadata is invalid.")];
  return [];
}
