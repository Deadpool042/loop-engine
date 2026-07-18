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

function supportsClaudeCode(request: ProviderRequest): boolean {
  return (
    (request.requestedProvider === undefined ||
      request.requestedProvider === "claude-code") &&
    isProviderAllowed(request, "anthropic", "claude_code") &&
    request.requiredCapabilities.length === 0
  );
}

export const ClaudeCodeProviderAdapter: ProviderAdapter = {
  id: "claude-code",
  provider: "anthropic",
  runtimeId: "claude_code",
  capabilities: [],
  supports: supportsClaudeCode,
  prepare: (request) =>
    supportsClaudeCode(request)
      ? createNotImplementedProviderPlan(
          "claude-code",
          "anthropic",
          "claude_code",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          request.metadata,
        )
      : createUnsupportedProviderPlan(
          "claude-code",
          "anthropic",
          "claude_code",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          request.metadata,
          createProviderError(
            "provider_not_supported",
            "Provider claude-code does not support the normalized request.",
          ),
        ),
  normalize: (result): ProviderResult =>
    normalizeProviderResult("claude-code", "claude_code", result),
};
