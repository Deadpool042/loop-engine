import { LocalProcessTransport } from "./local-process.js";
import {
  createStaticRegistryEntries,
  findStaticRegistryEntry,
} from "../registry.js";
import type {
  TransportAdapter,
  TransportId,
  TransportRegistry,
} from "./types.js";

export function createTransportRegistry(
  adapters: readonly TransportAdapter[],
): TransportRegistry {
  return Object.freeze({
    adapters: createStaticRegistryEntries(
      adapters,
      (adapter) => adapter.id,
      (id) => `Duplicate transport adapter id: ${id}`,
    ),
  });
}

// Declaration order is the only fallback order. There is no discovery,
// dynamic import, reflection, dependency injection, or network lookup.
export const TRANSPORT_REGISTRY = createTransportRegistry([
  LocalProcessTransport,
]);

export function getTransportAdapter(
  transportId: TransportId,
): TransportAdapter | null {
  return findStaticRegistryEntry(
    TRANSPORT_REGISTRY.adapters,
    transportId,
    (adapter) => adapter.id,
  );
}
