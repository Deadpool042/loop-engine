import { freezeRuntimeDescriptorValue } from "./support.js";
import { validateRuntimeDescriptor } from "./validation.js";
import type { RuntimeDescriptorInput, RuntimeDescriptorResult } from "./types.js";
const ordered = (values: readonly string[]) => [...values].sort();
export const createRuntimeDescriptor = (input: RuntimeDescriptorInput): RuntimeDescriptorInput => freezeRuntimeDescriptorValue({ ...input, capabilityReferences: ordered(input.capabilityReferences), compatibilityReferences: ordered(input.compatibilityReferences), supportedExecutionClasses: ordered(input.supportedExecutionClasses), declaredConstraints: ordered(input.declaredConstraints) });
export function evaluateRuntimeDescriptor(input: RuntimeDescriptorInput | null): RuntimeDescriptorResult {
  // Runtime Descriptor is metadata only and never executes.
  const diagnostics = freezeRuntimeDescriptorValue([...validateRuntimeDescriptor(input)].sort((left, right) => left.code.localeCompare(right.code)));
  const descriptor = input ? createRuntimeDescriptor(input) : ({} as RuntimeDescriptorInput);
  return freezeRuntimeDescriptorValue({ descriptor, diagnostics, valid: diagnostics.length === 0, metadataOnly: true as const }) as RuntimeDescriptorResult;
}
export const summarizeRuntimeDescriptor = (result: RuntimeDescriptorResult) => freezeRuntimeDescriptorValue({ id: result.descriptor.id, version: result.descriptor.version, valid: result.valid, metadataOnly: true as const });
