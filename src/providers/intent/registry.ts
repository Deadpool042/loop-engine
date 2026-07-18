import { supportsTransportIntent } from "./support.js";
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
  const ids = new Set<string>();
  for (const intent of intents) {
    if (ids.has(intent.id))
      throw new Error(`Duplicate transport intent id: ${intent.id}`);
    ids.add(intent.id);
  }
  return Object.freeze({ intents: Object.freeze([...intents]) });
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
  return registry.intents.find((intent) => intent.id === id) ?? null;
}
