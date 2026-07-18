import { LocalProcessTransport } from "./local-process.js";
import type {
  TransportAdapter,
  TransportId,
  TransportRegistry,
} from "./types.js";

export function createTransportRegistry(
  adapters: readonly TransportAdapter[],
): TransportRegistry {
  const ids = new Set<string>();
  for (const adapter of adapters) {
    if (ids.has(adapter.id)) {
      throw new Error(`Duplicate transport adapter id: ${adapter.id}`);
    }
    ids.add(adapter.id);
  }

  return Object.freeze({ adapters: Object.freeze([...adapters]) });
}

// Declaration order is the only fallback order. There is no discovery,
// dynamic import, reflection, dependency injection, or network lookup.
export const TRANSPORT_REGISTRY = createTransportRegistry([
  LocalProcessTransport,
]);

export function getTransportAdapter(
  transportId: TransportId,
): TransportAdapter | null {
  return (
    TRANSPORT_REGISTRY.adapters.find((adapter) => adapter.id === transportId) ??
    null
  );
}
