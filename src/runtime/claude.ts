import { createNotImplementedRuntimeResult } from "./result.js";
import type { RuntimeAdapter, RuntimeRequest } from "./types.js";

function supportsClaude(request: RuntimeRequest): boolean {
  const selected = request.resolvedAgentPolicy.selection;
  const selectedRuntime =
    request.requestedRuntime ??
    (selected?.outcome === "selected" ? selected.profile.runtime : null);

  return (
    request.resolvedAgentPolicy.status === "resolved" &&
    selectedRuntime === "claude_code" &&
    (request.allowedProviders === undefined ||
      request.allowedProviders.includes(request.provider)) &&
    (request.allowedRuntimes === undefined ||
      request.allowedRuntimes.includes("claude_code"))
  );
}

/** Deterministic non-executing Claude Code stub. */
export const ClaudeRuntime: RuntimeAdapter = {
  runtimeId: "claude_code",
  capabilities: [],
  supports: supportsClaude,
  execute: (request) =>
    createNotImplementedRuntimeResult("claude_code", request),
};
