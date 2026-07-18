import { ClaudeRuntime } from "./claude.js";
import { CodexRuntime } from "./codex.js";
import { OpenClawRuntime } from "./openclaw.js";
import type { RuntimeAdapter } from "./types.js";
import type { AgentRuntime } from "../agents/types.js";

export type RuntimeRegistry = Readonly<{
  adapters: readonly RuntimeAdapter[];
}>;

// Static declaration order is the only registry order. No discovery, loading,
// reflection, or dependency injection is permitted in this architecture lot.
export const RUNTIME_REGISTRY: RuntimeRegistry = Object.freeze({
  adapters: Object.freeze([OpenClawRuntime, ClaudeRuntime, CodexRuntime]),
});

export function getRuntimeAdapter(
  runtimeId: AgentRuntime,
): RuntimeAdapter | null {
  return (
    RUNTIME_REGISTRY.adapters.find(
      (adapter) => adapter.runtimeId === runtimeId,
    ) ?? null
  );
}
