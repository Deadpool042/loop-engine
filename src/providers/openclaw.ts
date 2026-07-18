import {
  createProviderError,
  createNotImplementedProviderPlan,
  normalizeProviderResult,
  createUnsupportedProviderPlan,
} from "./errors.js";
import { isProviderAllowed } from "./support.js";
import type {
  ProviderAdapter,
  ProviderRequest,
  ProviderResult,
} from "./types.js";

function supportsOpenClaw(request: ProviderRequest): boolean {
  return (
    (request.requestedProvider === undefined ||
      request.requestedProvider === "openclaw") &&
    isProviderAllowed(request, "local", "openclaw") &&
    request.requiredCapabilities.length === 0
  );
}

export const OpenClawProviderAdapter: ProviderAdapter = {
  id: "openclaw",
  provider: "local",
  runtimeId: "openclaw",
  capabilities: [],
  supports: supportsOpenClaw,
  prepare: (request) =>
    supportsOpenClaw(request)
      ? createNotImplementedProviderPlan(
          "openclaw",
          "local",
          "openclaw",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          request.metadata,
        )
      : createUnsupportedProviderPlan(
          "openclaw",
          "local",
          "openclaw",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          request.metadata,
          createProviderError(
            "provider_not_supported",
            "Provider openclaw does not support the normalized request.",
          ),
        ),
  normalize: (result): ProviderResult =>
    normalizeProviderResult("openclaw", "openclaw", result),
};
