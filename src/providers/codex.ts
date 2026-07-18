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

function supportsCodex(request: ProviderRequest): boolean {
  return (
    (request.requestedProvider === undefined ||
      request.requestedProvider === "codex") &&
    isProviderAllowed(request, "openai", "codex") &&
    request.requiredCapabilities.length === 0
  );
}

export const CodexProviderAdapter: ProviderAdapter = {
  id: "codex",
  provider: "openai",
  runtimeId: "codex",
  capabilities: [],
  supports: supportsCodex,
  prepare: (request) =>
    supportsCodex(request)
      ? createNotImplementedProviderPlan(
          "codex",
          "openai",
          "codex",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          request.metadata,
        )
      : createUnsupportedProviderPlan(
          "codex",
          "openai",
          "codex",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          request.metadata,
          createProviderError(
            "provider_not_supported",
            "Provider codex does not support the normalized request.",
          ),
        ),
  normalize: (result): ProviderResult =>
    normalizeProviderResult("codex", "codex", result),
};
