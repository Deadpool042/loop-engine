import {
  createOpenClawProtocolError,
  diagnosticFromError,
} from "./diagnostics.js";
import { validateOpenClawProtocolRequest } from "./validation.js";
import type {
  OpenClawProtocolPlan,
  OpenClawProtocolResponse,
  OpenClawRequest,
} from "./types.js";

/**
 * Builds an inspectable protocol plan. An executable mapping is deliberately
 * absent in V10.4, even when the envelope is structurally valid.
 */
export function createOpenClawProtocolPlan(
  request: OpenClawRequest,
): OpenClawProtocolPlan {
  const validation = validateOpenClawProtocolRequest(request);
  const executionIntent = Object.freeze({
    requiredTransportCapabilities: Object.freeze([]),
    executable: false as const,
    executableMapping: "absent" as const,
  });
  const error = validation.valid
    ? createOpenClawProtocolError(
        "openclaw_executable_mapping_missing",
        "OpenClaw protocol has no documented executable mapping configured.",
      )
    : validation.error!;
  const diagnostics = Object.freeze([
    ...validation.diagnostics,
    ...(validation.valid ? [diagnosticFromError(error)] : []),
  ]);

  return Object.freeze({
    status: validation.valid ? "valid_non_executable" : "invalid",
    request,
    validation,
    executionIntent,
    diagnostics,
    error,
  });
}

export function createOpenClawProtocolResponse(
  plan: OpenClawProtocolPlan,
): OpenClawProtocolResponse {
  return Object.freeze({
    status: plan.status,
    plan,
    diagnostics: plan.diagnostics,
    error: plan.error,
  });
}
