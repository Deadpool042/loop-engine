import { LOCAL_PROCESS_RUNTIME_ID } from "../runtime/types.js";
import { createTransportError } from "./errors.js";
import type {
  TransportAdapter,
  TransportError,
  TransportRequest,
} from "./types.js";

function hasExplicitAuthorization(
  allowed: readonly string[] | undefined,
  value: string,
): boolean {
  return allowed !== undefined && allowed.includes(value);
}

/**
 * Transport authorization is independently default-deny. Runtime/provider
 * selection alone never authorizes a guarded backend.
 */
export function getTransportAuthorizationError(
  request: TransportRequest,
): TransportError | null {
  const { runtimeRequest, transportPolicy } = request;
  const requirements = runtimeRequest.resolvedAgentPolicy.requirements;
  const selection = runtimeRequest.resolvedAgentPolicy.selection;

  if (!transportPolicy.enabled) {
    return createTransportError(
      "transport_disabled",
      "Transport execution is disabled by policy.",
    );
  }

  if (!transportPolicy.allowedTransportIds.includes(request.transportId)) {
    return createTransportError(
      "transport_not_allowed",
      "Transport is not explicitly allowed by policy.",
    );
  }

  if (
    runtimeRequest.resolvedAgentPolicy.status !== "resolved" ||
    selection?.outcome !== "selected" ||
    selection.profile.provider !== request.provider ||
    runtimeRequest.provider !== request.provider
  ) {
    return createTransportError(
      "transport_not_allowed",
      "Resolved policy does not authorize this provider transport request.",
    );
  }

  const runtimeLists = [
    runtimeRequest.allowedRuntimes,
    requirements.allowedRuntimes,
  ];
  const runtimeAuthorized =
    runtimeLists.some((allowed) =>
      hasExplicitAuthorization(allowed, LOCAL_PROCESS_RUNTIME_ID),
    ) &&
    runtimeLists.every(
      (allowed) =>
        allowed === undefined ||
        hasExplicitAuthorization(allowed, LOCAL_PROCESS_RUNTIME_ID),
    );
  if (!runtimeAuthorized) {
    return createTransportError(
      "transport_not_allowed",
      "Local-process runtime is not explicitly allowed by policy.",
    );
  }

  const providerLists = [
    runtimeRequest.allowedProviders,
    requirements.allowedProviders,
  ];
  if (
    providerLists.some(
      (allowed) => allowed !== undefined && !allowed.includes(request.provider),
    )
  ) {
    return createTransportError(
      "transport_not_allowed",
      "Provider is not allowed by policy.",
    );
  }

  const policyAllowsShellExecution =
    requirements.requiredPermissions.includes("shell_exec") &&
    selection.profile.permissions.includes("shell_exec");
  if (!policyAllowsShellExecution) {
    return createTransportError(
      "permission_denied",
      "Resolved policy does not authorize shell_exec.",
    );
  }

  return null;
}

export function getTransportCapabilityError(
  adapter: TransportAdapter,
  request: TransportRequest,
): TransportError | null {
  const unsupported = request.requiredCapabilities.find(
    (capability) => !adapter.capabilities.includes(capability),
  );
  return unsupported === undefined
    ? null
    : createTransportError(
        "capability_not_supported",
        "Transport does not support a required capability.",
        { capability: unsupported },
      );
}
