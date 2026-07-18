import { AGENT_CAPABILITIES } from "../agents/types.js";
import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../registry.js";
import type {
  CapabilityRegistry,
  PolicyRegistry,
  PolicyRule,
} from "./types.js";

export const CAPABILITY_REGISTRY: CapabilityRegistry = Object.freeze({
  capabilityIds: Object.freeze([...AGENT_CAPABILITIES]),
});

/** The only shipped V10.7 policy is intentionally unable to authorize. */
export const DEFAULT_DENY_POLICY: PolicyRule = Object.freeze({
  id: "default-deny",
  enabled: false,
  allowedProviders: Object.freeze([]),
  allowedRuntimes: Object.freeze([]),
  allowedMappings: Object.freeze([]),
  allowedIntents: Object.freeze([]),
  allowedTransports: Object.freeze([]),
  supportedProtocolVersions: Object.freeze([]),
  supportedMappingVersions: Object.freeze([]),
  capabilitySet: Object.freeze({
    capabilities: Object.freeze([]),
    permissions: Object.freeze([]),
  }),
});

export function createPolicyRegistry(
  rules: readonly PolicyRule[],
): PolicyRegistry {
  return Object.freeze({
    rules: createStaticRegistryEntries(
      rules,
      (rule) => rule.id,
      (id) => `Duplicate policy id: ${id}`,
    ),
  });
}

// Fixed declaration order only: no discovery, plugins, dynamic imports,
// reflection, filesystem lookup, or dependency injection.
export const POLICY_REGISTRY = createPolicyRegistry([DEFAULT_DENY_POLICY]);

export function getPolicyRule(
  id: string,
  registry: PolicyRegistry = POLICY_REGISTRY,
): PolicyRule | null {
  return findStaticRegistryEntry(registry.rules, id, (rule) => rule.id);
}
