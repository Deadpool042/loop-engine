import { createTransportError } from "./errors.js";
import { TRANSPORT_REGISTRY } from "./registry.js";
import {
  getTransportAuthorizationError,
  getTransportCapabilityError,
} from "./support.js";
import type {
  TransportAdapter,
  TransportRequest,
  TransportSelection,
} from "./types.js";

function rejectionFor(adapter: TransportAdapter, request: TransportRequest) {
  return (
    getTransportAuthorizationError(request) ??
    getTransportCapabilityError(adapter, request) ??
    createTransportError(
      "transport_not_supported",
      "Transport does not support the normalized request.",
    )
  );
}

/** Pure, deterministic selection over the static registry. */
export function selectTransport(request: TransportRequest): TransportSelection {
  const explicit = TRANSPORT_REGISTRY.adapters.find(
    (adapter) => adapter.id === request.transportId,
  );
  if (!explicit) {
    return {
      outcome: "rejected",
      error: createTransportError(
        "transport_not_found",
        `Transport ${request.transportId} is not registered.`,
      ),
    };
  }

  if (explicit.supports(request)) {
    return { outcome: "selected", adapter: explicit };
  }

  return { outcome: "rejected", error: rejectionFor(explicit, request) };
}
