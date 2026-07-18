import {
  createProviderError,
  createNotImplementedProviderPlan,
  normalizeProviderResult,
  createUnsupportedProviderPlan,
} from "./errors.js";
import {
  createOpenClawProtocolPlan,
  normalizeOpenClawRequest,
} from "./openclaw/index.js";
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
  prepare: (request) => {
    if (!supportsOpenClaw(request)) {
      return createUnsupportedProviderPlan(
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
      );
    }

    const protocol = createOpenClawProtocolPlan(
      normalizeOpenClawRequest(request),
    );
    const metadata = {
      ...request.metadata,
      openclawProtocol: {
        version: protocol.request.protocolVersion,
        operation: protocol.request.operation,
        status: protocol.status,
        executable: protocol.executionIntent.executable,
        errorCode: protocol.error.code,
      },
    };
    const base = protocol.validation.valid
      ? createNotImplementedProviderPlan(
          "openclaw",
          "local",
          "openclaw",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          metadata,
        )
      : createUnsupportedProviderPlan(
          "openclaw",
          "local",
          "openclaw",
          request.runtimeRequest.resolvedAgentPolicy.requirements
            .requiredPermissions,
          metadata,
          createProviderError(
            "invalid_provider_request",
            "OpenClaw protocol request is invalid.",
          ),
        );

    return {
      ...base,
      diagnostics: [...base.diagnostics, ...protocol.diagnostics],
    };
  },
  normalize: (result): ProviderResult =>
    normalizeProviderResult("openclaw", "openclaw", result),
};
