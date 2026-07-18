import type { TransportIntent, TransportIntentRequest } from "./types.js";

/** Pure compatibility checks shared by static selection and validation. */
export function supportsTransportIntent(
  intent: TransportIntent,
  request: TransportIntentRequest,
): boolean {
  const { providerPlan, mappingResult } = request;
  return (
    mappingResult.mappingId === intent.mappingId &&
    providerPlan.providerId === intent.providerId &&
    providerPlan.provider === intent.provider &&
    providerPlan.runtimeId === intent.runtimeId &&
    mappingResult.providerPlan.providerId === intent.providerId &&
    mappingResult.providerPlan.runtimeId === intent.runtimeId &&
    intent.requiredCapabilities.every((capability) =>
      mappingResult.intent.requiredTransportCapabilities.includes(capability),
    ) &&
    intent.requiredPermissions.every((permission) =>
      providerPlan.requiredPermissions.includes(permission),
    )
  );
}

export function isTransportIntentAuthorized(
  intent: TransportIntent,
  request: TransportIntentRequest,
): boolean {
  return (
    request.policy.enabled &&
    request.policy.allowedIntentIds.includes(intent.id)
  );
}
