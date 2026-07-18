import { ClaudeRuntime } from "./claude.js";
import { CodexRuntime } from "./codex.js";
import { OpenClawRuntime } from "./openclaw.js";
import { LocalProcessRuntime } from "./local-process.js";
import type { RuntimeAdapter } from "./types.js";
import type { RuntimeId } from "./types.js";

export type RuntimeRegistry = Readonly<{
  adapters: readonly RuntimeAdapter[];
}>;

// Static declaration order is the only registry order. No discovery, loading,
// reflection, or dependency injection is permitted in this architecture lot.
export const RUNTIME_REGISTRY: RuntimeRegistry = Object.freeze({
  adapters: Object.freeze([
    OpenClawRuntime,
    ClaudeRuntime,
    CodexRuntime,
    LocalProcessRuntime,
  ]),
});

export function getRuntimeAdapter(runtimeId: RuntimeId): RuntimeAdapter | null {
  return (
    RUNTIME_REGISTRY.adapters.find(
      (adapter) => adapter.runtimeId === runtimeId,
    ) ?? null
  );
}
