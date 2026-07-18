import { createNotImplementedRuntimeResult } from "./result.js";
import type { RuntimeAdapter, RuntimeRequest } from "./types.js";

function supportsOpenClaw(request: RuntimeRequest): boolean {
  const selected = request.resolvedAgentPolicy.selection;
  const selectedRuntime =
    request.requestedRuntime ??
    (selected?.outcome === "selected" ? selected.profile.runtime : null);

  return (
    request.resolvedAgentPolicy.status === "resolved" &&
    selectedRuntime === "openclaw" &&
    (request.allowedProviders === undefined ||
      request.allowedProviders.includes(request.provider)) &&
    (request.allowedRuntimes === undefined ||
      request.allowedRuntimes.includes("openclaw"))
  );
}

/** Deterministic non-executing OpenClaw stub. */
export const OpenClawRuntime: RuntimeAdapter = {
  runtimeId: "openclaw",
  capabilities: [],
  supports: supportsOpenClaw,
  execute: (request) => createNotImplementedRuntimeResult("openclaw", request),
};
