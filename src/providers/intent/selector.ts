import { createTransportIntentError } from "./errors.js";
import { getTransportIntent, TRANSPORT_INTENT_REGISTRY } from "./registry.js";
import { supportsTransportIntent } from "./support.js";
import type {
  TransportIntent,
  TransportIntentRegistry,
  TransportIntentRequest,
  TransportIntentSelection,
} from "./types.js";

function rejectForCompatibility(
  intent: TransportIntent,
  request: TransportIntentRequest,
): TransportIntentSelection {
  if (
    request.providerPlan.providerId !== intent.providerId ||
    request.providerPlan.provider !== intent.provider
  ) {
    return {
      outcome: "rejected",
      error: createTransportIntentError(
        "intent_provider_mismatch",
        "Intent does not match the Provider plan.",
      ),
    };
  }
  if (request.providerPlan.runtimeId !== intent.runtimeId) {
    return {
      outcome: "rejected",
      error: createTransportIntentError(
        "intent_runtime_mismatch",
        "Intent does not match the Provider runtime.",
      ),
    };
  }
  if (request.mappingResult.mappingId !== intent.mappingId) {
    return {
      outcome: "rejected",
      error: createTransportIntentError(
        "intent_mapping_mismatch",
        "Intent does not match the executable mapping.",
      ),
    };
  }
  if (
    !intent.requiredCapabilities.every((capability) =>
      request.mappingResult.intent.requiredTransportCapabilities.includes(
        capability,
      ),
    )
  ) {
    return {
      outcome: "rejected",
      error: createTransportIntentError(
        "intent_transport_mismatch",
        "Intent transport capabilities do not match the executable mapping.",
      ),
    };
  }
  return {
    outcome: "rejected",
    error: createTransportIntentError(
      "intent_invalid",
      "Intent does not support the normalized request.",
    ),
  };
}

/** Pure explicit-first selection over a fixed registry. */
export function selectTransportIntent(
  request: TransportIntentRequest,
  registry: TransportIntentRegistry = TRANSPORT_INTENT_REGISTRY,
): TransportIntentSelection {
  if (request.requestedIntent !== undefined) {
    const intent = getTransportIntent(request.requestedIntent, registry);
    return intent === null
      ? {
          outcome: "rejected",
          error: createTransportIntentError(
            "intent_missing",
            "Requested transport intent is not registered.",
          ),
        }
      : intent.supports(request)
        ? { outcome: "selected", intent }
        : rejectForCompatibility(intent, request);
  }
  const intent = registry.intents.find((candidate) =>
    supportsTransportIntent(candidate, request),
  );
  return intent === undefined
    ? {
        outcome: "rejected",
        error: createTransportIntentError(
          "intent_missing",
          "No transport intent matches the executable mapping.",
        ),
      }
    : { outcome: "selected", intent };
}
