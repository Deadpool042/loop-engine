import type {
  AuthorizationSummary,
  CapabilityId,
  PolicyRule,
} from "./types.js";

export function includesAll<T>(
  available: readonly T[],
  required: readonly T[],
): boolean {
  return required.every((item) => available.includes(item));
}

export function emptyAuthorizationSummary(): AuthorizationSummary {
  return Object.freeze({
    providerCompatible: false,
    runtimeCompatible: false,
    mappingCompatible: false,
    intentCompatible: false,
    transportCompatible: false,
    capabilitiesSupported: false,
    permissionsSupported: false,
    policyAllowed: false,
  });
}

export function policySupportsCapabilities(
  policy: PolicyRule,
  capabilities: readonly CapabilityId[],
): boolean {
  return includesAll(policy.capabilitySet.capabilities, capabilities);
}
