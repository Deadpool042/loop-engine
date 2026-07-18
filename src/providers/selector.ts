import { createProviderError } from "./errors.js";
import { getProviderAdapter, PROVIDER_REGISTRY } from "./registry.js";
import { isProviderAllowed } from "./support.js";
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderSelectionResult,
} from "./types.js";

function providerError(
  request: ProviderRequest,
  adapter: ProviderAdapter,
): ProviderSelectionResult {
  if (!isProviderAllowed(request, adapter.provider, adapter.runtimeId)) {
    return {
      outcome: "rejected",
      error: createProviderError(
        "provider_not_allowed",
        `Provider ${adapter.id} is not allowed by policy.`,
      ),
    };
  }

  if (request.requiredCapabilities.length > 0) {
    return {
      outcome: "rejected",
      error: createProviderError(
        "capability_not_supported",
        `Provider ${adapter.id} does not support the required capabilities.`,
        { capabilities: request.requiredCapabilities },
      ),
    };
  }

  return {
    outcome: "rejected",
    error: createProviderError(
      "provider_not_supported",
      `Provider ${adapter.id} does not support the normalized request.`,
    ),
  };
}

/** Pure deterministic resolution with explicit selection before static fallback. */
export function selectProvider(
  request: ProviderRequest,
): ProviderSelectionResult {
  if (request.requestedProvider !== undefined) {
    const adapter = getProviderAdapter(request.requestedProvider);
    if (!adapter) {
      return {
        outcome: "rejected",
        error: createProviderError(
          "provider_not_found",
          `Provider ${request.requestedProvider} is not registered.`,
        ),
      };
    }

    return isProviderAllowed(request, adapter.provider, adapter.runtimeId) &&
      adapter.supports(request)
      ? { outcome: "selected", adapter }
      : providerError(request, adapter);
  }

  const adapter = PROVIDER_REGISTRY.adapters.find(
    (candidate) =>
      isProviderAllowed(request, candidate.provider, candidate.runtimeId) &&
      candidate.supports(request),
  );

  if (adapter) return { outcome: "selected", adapter };

  const constrained = PROVIDER_REGISTRY.adapters.find((candidate) =>
    isProviderAllowed(request, candidate.provider, candidate.runtimeId),
  );
  return constrained
    ? providerError(request, constrained)
    : {
        outcome: "rejected",
        error: createProviderError(
          "provider_not_allowed",
          "No registered provider is allowed by policy.",
        ),
      };
}
