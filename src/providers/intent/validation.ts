import {
  createTransportIntentError,
  createTransportIntentResult,
} from "./errors.js";
import { selectTransportIntent } from "./selector.js";
import { isTransportIntentAuthorized } from "./support.js";
import type {
  TransportIntent,
  TransportIntentRegistry,
  TransportIntentRequest,
  TransportIntentResolution,
  TransportIntentResult,
} from "./types.js";

function intentResult(
  request: TransportIntentRequest,
  intent: TransportIntent,
  code: TransportIntentResult["status"],
  message: string,
): TransportIntentResult {
  return createTransportIntentResult(
    request,
    code,
    createTransportIntentError(code, message),
    intent.id,
    intent.transportId,
    intent.requiredCapabilities,
    intent.requiredPermissions,
  );
}

/** Resolution stops at the inactive intent layer; it never selects a transport adapter. */
export function resolveTransportIntent(
  request: TransportIntentRequest,
  registry?: TransportIntentRegistry,
): TransportIntentResolution {
  const selection = selectTransportIntent(request, registry);
  if (selection.outcome === "rejected") return selection;
  return selection.intent.active
    ? { outcome: "resolved", intent: selection.intent, request }
    : {
        outcome: "rejected",
        error: createTransportIntentError(
          "intent_disabled",
          "Transport intent is inactive by default.",
        ),
      };
}

/** Validates intent gates only; no runtime, provider, or transport is invoked. */
export function validateTransportIntent(
  request: TransportIntentRequest,
  registry?: TransportIntentRegistry,
): TransportIntentResult {
  const selection = selectTransportIntent(request, registry);
  if (selection.outcome === "rejected") {
    return createTransportIntentResult(
      request,
      selection.error.code,
      selection.error,
    );
  }
  const { intent } = selection;
  if (!intent.active)
    return intentResult(
      request,
      intent,
      "intent_disabled",
      "Transport intent is inactive by default.",
    );
  if (!isTransportIntentAuthorized(intent, request)) {
    return intentResult(
      request,
      intent,
      "intent_policy_denied",
      "Transport intent is denied by intent policy.",
    );
  }
  if (!intent.configured)
    return intentResult(
      request,
      intent,
      "intent_not_configured",
      "Transport intent is not configured.",
    );
  return intentResult(
    request,
    intent,
    "intent_not_configured",
    "Transport intent cannot be executed in V10.6.",
  );
}
