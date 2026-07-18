import { createNotImplementedRuntimeResult } from "./result.js";
import type { RuntimeAdapter, RuntimeRequest } from "./types.js";

function supportsCodex(request: RuntimeRequest): boolean {
  const selected = request.resolvedAgentPolicy.selection;
  const selectedRuntime =
    request.requestedRuntime ??
    (selected?.outcome === "selected" ? selected.profile.runtime : null);

  return (
    request.resolvedAgentPolicy.status === "resolved" &&
    selectedRuntime === "codex" &&
    (request.allowedProviders === undefined ||
      request.allowedProviders.includes(request.provider)) &&
    (request.allowedRuntimes === undefined ||
      request.allowedRuntimes.includes("codex"))
  );
}

/** Deterministic non-executing Codex stub. */
export const CodexRuntime: RuntimeAdapter = {
  runtimeId: "codex",
  capabilities: [],
  supports: supportsCodex,
  execute: (request) => createNotImplementedRuntimeResult("codex", request),
};
