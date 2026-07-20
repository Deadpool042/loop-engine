import { ClaudeRuntime } from "./claude.js";
import { CodexRuntime } from "./codex.js";
import { OpenClawRuntime } from "./openclaw.js";
import { LocalProcessRuntime } from "./local-process.js";
import { SimulatedRuntime } from "./simulated.js";
import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../registry.js";
import type { RuntimeAdapter } from "./types.js";
import type { RuntimeId } from "./types.js";

export type RuntimeRegistry = Readonly<{
  adapters: readonly RuntimeAdapter[];
}>;

export function createRuntimeRegistry(
  adapters: readonly RuntimeAdapter[],
): RuntimeRegistry {
  return Object.freeze({
    adapters: createStaticRegistryEntries(
      adapters,
      (adapter) => adapter.runtimeId,
      (id) => `Duplicate runtime adapter id: ${id}`,
    ),
  });
}

// Static declaration order is the only registry order. No discovery, loading,
// reflection, or dependency injection is permitted in this architecture lot.
export const RUNTIME_REGISTRY: RuntimeRegistry = createRuntimeRegistry([
  OpenClawRuntime,
  ClaudeRuntime,
  CodexRuntime,
  LocalProcessRuntime,
  SimulatedRuntime,
]);

export function getRuntimeAdapter(runtimeId: RuntimeId): RuntimeAdapter | null {
  return findStaticRegistryEntry(
    RUNTIME_REGISTRY.adapters,
    runtimeId,
    (adapter) => adapter.runtimeId,
  );
}
