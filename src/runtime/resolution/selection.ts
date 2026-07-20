import { evaluateRuntimeCapabilityCompatibility } from "../capability/evaluation.js";
import type { RuntimeCapabilityInput } from "../capability/types.js";
import type { RuntimeRegistryInput } from "../registry/types.js";
import { validateRuntimeRegistry } from "../registry/validation.js";
import { createRuntimeRequest } from "../request/evaluation.js";
import type { RuntimeRequestInput } from "../request/types.js";
import { validateRuntimeRequest } from "../request/validation.js";
import { freezeRuntimeResolutionValue } from "./support.js";
import type {
  RuntimeCapabilityCandidateEvaluation,
  RuntimeCapabilitySelectionResult,
} from "./types.js";

const unsupported = (
  diagnostics: readonly string[],
  candidates: readonly RuntimeCapabilityCandidateEvaluation[] = [],
): RuntimeCapabilitySelectionResult =>
  freezeRuntimeResolutionValue({
    outcome: "unsupported" as const,
    runtimeId: null,
    compatibleRuntimeIds: [],
    candidates,
    diagnostics: [...diagnostics].sort(),
    executionAllowed: false as const,
    executionStarted: false as const,
  });

/**
 * Selects declarative Runtime Descriptor metadata by capability compatibility.
 * It does not import, resolve, allocate, or execute a RuntimeAdapter.
 */
export function selectRuntimeByCapabilities(
  requestInput: RuntimeRequestInput,
  registry: RuntimeRegistryInput,
  capabilities: readonly RuntimeCapabilityInput[],
): RuntimeCapabilitySelectionResult {
  if (validateRuntimeRequest(requestInput).length > 0) {
    return unsupported(["Runtime Request is invalid."]);
  }
  if (validateRuntimeRegistry(registry).length > 0) {
    return unsupported(["Runtime Registry is invalid."]);
  }
  if (!Array.isArray(capabilities)) {
    return unsupported(["Runtime Capability catalog is invalid."]);
  }

  const request = createRuntimeRequest(requestInput);
  const requirements = request.capabilityRequirements ?? [];
  if (requirements.length === 0) {
    return unsupported([
      "Runtime selection requires at least one explicit capability requirement.",
    ]);
  }

  const capabilityIds = capabilities.map((capability) => capability.id);
  if (new Set(capabilityIds).size !== capabilityIds.length) {
    return unsupported([
      "Runtime Capability catalog contains duplicate identifiers.",
    ]);
  }

  const capabilityById = new Map(
    capabilities.map((capability) => [capability.id, capability] as const),
  );
  const candidates = [...registry.descriptors]
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter((descriptor) => descriptor.lifecycleState === "eligible")
    .map((descriptor): RuntimeCapabilityCandidateEvaluation => {
      const referencedCapabilityIds = new Set(descriptor.capabilityReferences);
      const evaluations = requirements.map((requirement) =>
        evaluateRuntimeCapabilityCompatibility(
          requirement,
          referencedCapabilityIds.has(requirement.id)
            ? (capabilityById.get(requirement.id) ?? null)
            : null,
        ),
      );

      return freezeRuntimeResolutionValue({
        runtimeId: descriptor.id,
        compatible: evaluations.every((evaluation) => evaluation.compatible),
        requirements: evaluations,
      });
    });
  const compatibleRuntimeIds = candidates
    .filter((candidate) => candidate.compatible)
    .map((candidate) => candidate.runtimeId);
  const runtimeId = compatibleRuntimeIds[0] ?? null;

  if (!runtimeId) {
    return unsupported(
      ["No compatible Runtime Descriptor was found."],
      candidates,
    );
  }

  return freezeRuntimeResolutionValue({
    outcome: "selected" as const,
    runtimeId,
    compatibleRuntimeIds,
    candidates,
    diagnostics: [],
    executionAllowed: false as const,
    executionStarted: false as const,
  });
}

export const summarizeRuntimeCapabilitySelection = (
  result: RuntimeCapabilitySelectionResult,
) =>
  freezeRuntimeResolutionValue({
    outcome: result.outcome,
    runtimeId: result.runtimeId,
    compatibleRuntimeIds: [...result.compatibleRuntimeIds].sort(),
    evaluatedRuntimeIds: result.candidates
      .map((candidate) => candidate.runtimeId)
      .sort(),
    diagnostics: [...result.diagnostics].sort(),
    executionAllowed: false as const,
    executionStarted: false as const,
  });
