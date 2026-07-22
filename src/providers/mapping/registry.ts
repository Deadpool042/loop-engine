import { supportsExecutableMapping } from "./support.js";
import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../../registry.js";
import type {
  ExecutableMapping,
  ExecutableMappingId,
  ExecutableMappingRegistry,
} from "./types.js";

/**
 * The sole V10.5 declaration. It records capability compatibility only: no
 * executable metadata, command, arguments, environment, or transport intent.
 */
export const OpenClawExecutableMapping: ExecutableMapping = Object.freeze({
  id: "openclaw-planning",
  providerId: "openclaw",
  provider: "local",
  runtimeId: "openclaw",
  protocolVersion: "loop-engine-openclaw-planning/v1",
  operation: "plan",
  capabilities: Object.freeze([]),
  requiredTransportCapabilities: Object.freeze([]),
  enabled: false,
  configured: false,
  supports: (request) =>
    supportsExecutableMapping(OpenClawExecutableMapping, request),
});

export function createExecutableMappingRegistry(
  mappings: readonly ExecutableMapping[],
): ExecutableMappingRegistry {
  return Object.freeze({
    mappings: createStaticRegistryEntries(
      mappings,
      (mapping) => mapping.id,
      (id) => `Duplicate executable mapping id: ${id}`,
    ),
  });
}

// Fixed declaration order only: no discovery, plugins, dynamic imports,
// reflection, filesystem lookup, or dependency injection.
export const EXECUTABLE_MAPPING_REGISTRY = createExecutableMappingRegistry([
  OpenClawExecutableMapping,
]);

export function getExecutableMapping(
  id: ExecutableMappingId,
  registry: ExecutableMappingRegistry = EXECUTABLE_MAPPING_REGISTRY,
): ExecutableMapping | null {
  return findStaticRegistryEntry(
    registry.mappings,
    id,
    (mapping) => mapping.id,
  );
}
