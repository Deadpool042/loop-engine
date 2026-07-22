import {
  createExecutableMappingError,
  createExecutableMappingResult,
} from "./errors.js";
import { selectExecutableMapping } from "./selector.js";
import { isExecutableMappingAuthorized } from "./support.js";
import type {
  ExecutableMapping,
  ExecutableMappingRequest,
  ExecutableMappingRegistry,
  ExecutableMappingResolution,
  ExecutableMappingResult,
} from "./types.js";

function mappingResult(
  request: ExecutableMappingRequest,
  mapping: ExecutableMapping,
  code: ExecutableMappingResult["status"],
  message: string,
): ExecutableMappingResult {
  return createExecutableMappingResult(
    request,
    code,
    createExecutableMappingError(code, message),
    mapping.id,
    mapping.requiredTransportCapabilities,
  );
}

/** Resolves a mapping only; it never produces a transport request or execution. */
export function resolveExecutableMapping(
  request: ExecutableMappingRequest,
  registry?: ExecutableMappingRegistry,
): ExecutableMappingResolution {
  const selection = selectExecutableMapping(request, registry);
  return selection.outcome === "selected"
    ? { outcome: "resolved", mapping: selection.mapping, request }
    : selection;
}

/**
 * Validates every mapping gate in deterministic order. Valid protocol,
 * configured mapping, and authorization are deliberately separate states.
 */
export function validateExecutableMapping(
  request: ExecutableMappingRequest,
  registry?: ExecutableMappingRegistry,
): ExecutableMappingResult {
  if (
    request.protocolPlan === undefined ||
    !request.protocolPlan.validation.valid
  ) {
    return createExecutableMappingResult(
      request,
      "mapping_invalid",
      createExecutableMappingError(
        "mapping_invalid",
        "Provider protocol plan is not valid for executable mapping.",
      ),
    );
  }

  const resolution = resolveExecutableMapping(request, registry);
  if (resolution.outcome === "rejected") {
    return createExecutableMappingResult(
      request,
      resolution.error.code,
      resolution.error,
    );
  }

  const { mapping } = resolution;
  if (!mapping.enabled) {
    return mappingResult(
      request,
      mapping,
      "mapping_disabled",
      "Executable mapping is disabled by default.",
    );
  }
  if (!isExecutableMappingAuthorized(mapping, request)) {
    const code = request.policy.enabled
      ? "mapping_not_authorized"
      : "mapping_policy_denied";
    return mappingResult(
      request,
      mapping,
      code,
      "Executable mapping is denied by mapping policy.",
    );
  }
  if (!mapping.configured) {
    return mappingResult(
      request,
      mapping,
      "mapping_not_configured",
      "Executable mapping is not configured.",
    );
  }

  return mappingResult(
    request,
    mapping,
    "mapping_not_configured",
    "Executable mapping cannot be executed in V10.5.",
  );
}
