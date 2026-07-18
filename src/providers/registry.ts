import { ClaudeCodeProviderAdapter } from "./claude-code.js";
import { CodexProviderAdapter } from "./codex.js";
import { OpenClawProviderAdapter } from "./openclaw.js";
import type { ProviderAdapter, ProviderId } from "./types.js";

export type ProviderRegistry = Readonly<{
  adapters: readonly ProviderAdapter[];
}>;

export function createProviderRegistry(
  adapters: readonly ProviderAdapter[],
): ProviderRegistry {
  const ids = new Set<string>();
  for (const adapter of adapters) {
    if (ids.has(adapter.id)) {
      throw new Error(`Duplicate provider adapter id: ${adapter.id}`);
    }
    ids.add(adapter.id);
  }

  return Object.freeze({ adapters: Object.freeze([...adapters]) });
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
  return (
    PROVIDER_REGISTRY.adapters.find((adapter) => adapter.id === providerId) ??
    null
  );
}
