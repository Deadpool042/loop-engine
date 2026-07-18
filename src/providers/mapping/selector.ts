import { createExecutableMappingError } from "./errors.js";
import {
  getExecutableMapping,
  EXECUTABLE_MAPPING_REGISTRY,
} from "./registry.js";
import { supportsExecutableMapping } from "./support.js";
import type {
  ExecutableMapping,
  ExecutableMappingRegistry,
  ExecutableMappingRequest,
  ExecutableMappingSelection,
} from "./types.js";

function rejectForCompatibility(
  mapping: ExecutableMapping,
  request: ExecutableMappingRequest,
): ExecutableMappingSelection {
  if (request.providerPlan.providerId !== mapping.providerId) {
    return {
      outcome: "rejected",
      error: createExecutableMappingError(
        "mapping_provider_mismatch",
        "Mapping does not match the Provider plan.",
      ),
    };
  }
  if (request.providerPlan.runtimeId !== mapping.runtimeId) {
    return {
      outcome: "rejected",
      error: createExecutableMappingError(
        "mapping_runtime_mismatch",
        "Mapping does not match the Provider runtime.",
      ),
    };
  }
  if (
    !mapping.requiredTransportCapabilities.every((capability) =>
      request.protocolPlan?.request.requiredTransportCapabilities.includes(
        capability,
      ),
    )
  ) {
    return {
      outcome: "rejected",
      error: createExecutableMappingError(
        "mapping_transport_mismatch",
        "Mapping transport capabilities do not match the protocol plan.",
      ),
    };
  }
  return {
    outcome: "rejected",
    error: createExecutableMappingError(
      "mapping_not_supported",
      "Mapping does not support the validated protocol plan.",
    ),
  };
}

/** Pure explicit-first selection over the static declaration order. */
export function selectExecutableMapping(
  request: ExecutableMappingRequest,
  registry: ExecutableMappingRegistry = EXECUTABLE_MAPPING_REGISTRY,
): ExecutableMappingSelection {
  if (request.requestedMapping !== undefined) {
    const mapping = getExecutableMapping(request.requestedMapping, registry);
    return mapping === null
      ? {
          outcome: "rejected",
          error: createExecutableMappingError(
            "mapping_missing",
            "Requested executable mapping is not registered.",
          ),
        }
      : mapping.supports(request)
        ? { outcome: "selected", mapping }
        : rejectForCompatibility(mapping, request);
  }

  const mapping = registry.mappings.find((candidate) =>
    supportsExecutableMapping(candidate, request),
  );
  return mapping === undefined
    ? {
        outcome: "rejected",
        error: createExecutableMappingError(
          "mapping_missing",
          "No executable mapping matches the Provider protocol plan.",
        ),
      }
    : { outcome: "selected", mapping };
}
