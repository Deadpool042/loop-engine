import { supportsTransportIntent } from "./support.js";
import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../../registry.js";
import type {
  TransportIntent,
  TransportIntentId,
  TransportIntentRegistry,
} from "./types.js";

/** The sole V10.6 intent declaration: inactive, unconfigured, and declarative. */
export const OpenClawTransportIntent: TransportIntent = Object.freeze({
  id: "openclaw-plan",
  providerId: "openclaw",
  provider: "local",
  runtimeId: "openclaw",
  mappingId: "openclaw-planning",
  transportId: "local-process",
  requiredCapabilities: Object.freeze([] as const),
  requiredPermissions: Object.freeze(["read_only"] as const),
  requiresPolicy: true,
  active: false,
  configured: false,
  supports: (request) =>
    supportsTransportIntent(OpenClawTransportIntent, request),
});

export function createTransportIntentRegistry(
  intents: readonly TransportIntent[],
): TransportIntentRegistry {
  return Object.freeze({
    intents: createStaticRegistryEntries(
      intents,
      (intent) => intent.id,
      (id) => `Duplicate transport intent id: ${id}`,
    ),
  });
}

// Fixed declaration order only: no discovery, plugins, dynamic imports,
// filesystem lookup, reflection, or dependency injection.
export const TRANSPORT_INTENT_REGISTRY = createTransportIntentRegistry([
  OpenClawTransportIntent,
]);

export function getTransportIntent(
  id: TransportIntentId,
  registry: TransportIntentRegistry = TRANSPORT_INTENT_REGISTRY,
): TransportIntent | null {
  return findStaticRegistryEntry(registry.intents, id, (intent) => intent.id);
}
