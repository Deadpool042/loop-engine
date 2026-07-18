import { ClaudeCodeProviderAdapter } from "./claude-code.js";
import { CodexProviderAdapter } from "./codex.js";
import { OpenClawProviderAdapter } from "./openclaw.js";
import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../registry.js";
import type { ProviderAdapter, ProviderId } from "./types.js";

export type ProviderRegistry = Readonly<{
  adapters: readonly ProviderAdapter[];
}>;

export function createProviderRegistry(
  adapters: readonly ProviderAdapter[],
): ProviderRegistry {
  return Object.freeze({
    adapters: createStaticRegistryEntries(
      adapters,
      (adapter) => adapter.id,
      (id) => `Duplicate provider adapter id: ${id}`,
    ),
  });
}

// Declaration order is the deterministic fallback order. No dynamic loading,
// filesystem discovery, dependency injection, reflection, or network discovery.
export const PROVIDER_REGISTRY = createProviderRegistry([
  OpenClawProviderAdapter,
  ClaudeCodeProviderAdapter,
  CodexProviderAdapter,
]);

export function getProviderAdapter(
  providerId: ProviderId,
): ProviderAdapter | null {
  return findStaticRegistryEntry(
    PROVIDER_REGISTRY.adapters,
    providerId,
    (adapter) => adapter.id,
  );
}
