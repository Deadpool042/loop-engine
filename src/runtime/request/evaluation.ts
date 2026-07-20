import { freezeRuntimeRequestValue } from "./support.js";
import { validateRuntimeRequest } from "./validation.js";
import type { RuntimeRequestInput, RuntimeRequestResult } from "./types.js";
import { createRuntimeCapabilityRequirement } from "../capability/evaluation.js";

export const createRuntimeRequest = (
  input: RuntimeRequestInput,
): RuntimeRequestInput =>
  freezeRuntimeRequestValue({
    ...input,
    evidenceReferences: [...input.evidenceReferences].sort(),
    ...(input.capabilityRequirements === undefined
      ? {}
      : {
          capabilityRequirements: [...input.capabilityRequirements]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(createRuntimeCapabilityRequirement),
        }),
    bridge: freezeRuntimeRequestValue({ ...input.bridge }),
  });

export function evaluateRuntimeRequest(
  input: RuntimeRequestInput | null,
): RuntimeRequestResult {
  // Runtime Request never authorizes execution.
  const diagnostics = freezeRuntimeRequestValue(
    [...validateRuntimeRequest(input)].sort((left, right) =>
      left.code.localeCompare(right.code),
    ),
  );
  const normalized = input
    ? createRuntimeRequest(input)
    : ({} as RuntimeRequestInput);
  const valid = diagnostics.length === 0;

  return freezeRuntimeRequestValue({
    input: normalized,
    diagnostics,
    valid,
    requestConstructible: valid,
    executionAllowed: false as const,
    executionStarted: false as const,
  }) as RuntimeRequestResult;
}

export const summarizeRuntimeRequest = (result: RuntimeRequestResult) =>
  freezeRuntimeRequestValue({
    requestConstructible: result.requestConstructible,
    executionAllowed: false as const,
    executionStarted: false as const,
  });
