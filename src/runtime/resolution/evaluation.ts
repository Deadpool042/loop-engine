import { freezeRuntimeResolutionValue } from "./support.js";
import { validateRuntimeResolution } from "./validation.js";
import type { RuntimeResolutionInput, RuntimeResolutionResult } from "./types.js";

export const createRuntimeResolution = (input: RuntimeResolutionInput): RuntimeResolutionInput =>
  freezeRuntimeResolutionValue({
    ...input,
    descriptorReferences: [...input.descriptorReferences].sort(),
    request: freezeRuntimeResolutionValue({ ...input.request }),
  });

export function evaluateRuntimeResolution(
  input: RuntimeResolutionInput | null,
): RuntimeResolutionResult {
  // Runtime Resolution never authorizes execution.
  const diagnostics = freezeRuntimeResolutionValue(
    [...validateRuntimeResolution(input)].sort((left, right) => left.code.localeCompare(right.code)),
  );
  const normalized = input ? createRuntimeResolution(input) : ({} as RuntimeResolutionInput);
  const valid = diagnostics.length === 0;

  return freezeRuntimeResolutionValue({
    input: normalized,
    diagnostics,
    valid,
    resolutionEligible: valid,
    executionAllowed: false as const,
    executionStarted: false as const,
  }) as RuntimeResolutionResult;
}

export const summarizeRuntimeResolution = (result: RuntimeResolutionResult) =>
  freezeRuntimeResolutionValue({
    resolutionEligible: result.resolutionEligible,
    executionAllowed: false as const,
    executionStarted: false as const,
  });
