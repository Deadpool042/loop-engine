import {
  createUnsupportedProviderPlan,
  selectProvider,
  type ProviderExecutionPlan,
  type ProviderId,
  type ProviderMetadata,
  type ProviderRequest,
  type ProviderSelectionResult,
} from "../providers/index.js";
import type { RuntimeRequest } from "../runtime/types.js";

export type CreateProviderRequestOptions = Readonly<{
  requestedProvider?: ProviderId;
  metadata?: ProviderMetadata;
}>;

/**
 * Creates a provider-neutral request from the resolved RuntimeRequest. It does
 * not alter runtime policy, plan a command, or invoke a transport.
 */
export function createProviderRequest(
  runtimeRequest: RuntimeRequest,
  options: CreateProviderRequestOptions = {},
): ProviderRequest {
  return {
    runtimeRequest,
    requiredCapabilities:
      runtimeRequest.resolvedAgentPolicy.requirements.requiredCapabilities,
    metadata: { ...runtimeRequest.metadata, ...(options.metadata ?? {}) },
    ...(options.requestedProvider === undefined
      ? {}
      : { requestedProvider: options.requestedProvider }),
  };
}

/** Resolves an inert provider adapter without invoking a transport. */
export function resolveProvider(
  request: ProviderRequest,
): ProviderSelectionResult {
  return selectProvider(request);
}

/**
 * Builds an inspectable provider plan. V10.2 adapters are stubs, so every
 * successful resolution reports provider_not_implemented without execution.
 */
export function createProviderExecutionPlan(
  request: ProviderRequest,
): ProviderExecutionPlan {
  const selection = resolveProvider(request);
  if (selection.outcome === "selected")
    return selection.adapter.prepare(request);

  const runtimeId =
    request.runtimeRequest.requestedRuntime ??
    (request.runtimeRequest.resolvedAgentPolicy.selection?.outcome ===
    "selected"
      ? request.runtimeRequest.resolvedAgentPolicy.selection.profile.runtime
      : "custom");
  const providerId = request.requestedProvider ?? "openclaw";
  const provider =
    request.runtimeRequest.resolvedAgentPolicy.selection?.outcome === "selected"
      ? request.runtimeRequest.resolvedAgentPolicy.selection.profile.provider
      : request.runtimeRequest.provider;

  return createUnsupportedProviderPlan(
    providerId,
    provider,
    runtimeId,
    request.runtimeRequest.resolvedAgentPolicy.requirements.requiredPermissions,
    request.metadata,
    selection.error,
  );
}
