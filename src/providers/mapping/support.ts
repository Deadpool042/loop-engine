import type { ExecutableMapping, ExecutableMappingRequest } from "./types.js";

/** Identity and protocol compatibility checks shared by selection and validation. */
export function supportsExecutableMapping(
  mapping: ExecutableMapping,
  request: ExecutableMappingRequest,
): boolean {
  const protocol = request.protocolPlan;
  return (
    protocol !== undefined &&
    protocol.validation.valid &&
    request.providerPlan.providerId === mapping.providerId &&
    request.providerPlan.provider === mapping.provider &&
    request.providerPlan.runtimeId === mapping.runtimeId &&
    protocol.request.providerId === mapping.providerId &&
    protocol.request.provider === mapping.provider &&
    protocol.request.runtimeId === mapping.runtimeId &&
    protocol.request.protocolVersion === mapping.protocolVersion &&
    protocol.request.operation === mapping.operation &&
    mapping.requiredTransportCapabilities.every((capability) =>
      protocol.request.requiredTransportCapabilities.includes(capability),
    )
  );
}

export function isExecutableMappingAuthorized(
  mapping: ExecutableMapping,
  request: ExecutableMappingRequest,
): boolean {
  return (
    request.policy.enabled &&
    request.policy.allowedMappingIds.includes(mapping.id)
  );
}
