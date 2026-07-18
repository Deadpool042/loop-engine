import type { AgentProvider } from "../agents/types.js";
import type { RuntimeId } from "../runtime/types.js";
import type { ProviderRequest } from "./types.js";

export function requestedRuntime(request: ProviderRequest): RuntimeId | null {
  return (
    request.runtimeRequest.requestedRuntime ??
    (request.runtimeRequest.resolvedAgentPolicy.selection?.outcome ===
    "selected"
      ? request.runtimeRequest.resolvedAgentPolicy.selection.profile.runtime
      : null)
  );
}

/** Restrictive policy checks shared by selection and every provider stub. */
export function isProviderAllowed(
  request: ProviderRequest,
  provider: AgentProvider,
  runtimeId: RuntimeId,
): boolean {
  const { runtimeRequest } = request;
  const requirements = runtimeRequest.resolvedAgentPolicy.requirements;
  const providerLists = [
    runtimeRequest.allowedProviders,
    requirements.allowedProviders,
  ];
  const runtimeLists = [
    runtimeRequest.allowedRuntimes,
    requirements.allowedRuntimes,
  ];

  return (
    runtimeRequest.resolvedAgentPolicy.status === "resolved" &&
    runtimeRequest.resolvedAgentPolicy.selection?.outcome === "selected" &&
    runtimeRequest.provider === provider &&
    requestedRuntime(request) === runtimeId &&
    providerLists.every(
      (allowed) => allowed === undefined || allowed.includes(provider),
    ) &&
    runtimeLists.every(
      (allowed) => allowed === undefined || allowed.includes(runtimeId),
    )
  );
}
