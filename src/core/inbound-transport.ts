import {
  handleInboundLoopRuntimeRequest,
  type InboundLoopRuntimeRequestHandlerDependencies,
  type InboundLoopRuntimeRequestHandlerResult,
} from "./inbound.js";

export type InboundTransportResponse = Readonly<{
  outcome: InboundLoopRuntimeRequestHandlerResult["outcome"];
  payload: unknown;
}>;

export type InboundTransportAdapter = Readonly<{
  decode(input: unknown): unknown | Promise<unknown>;
  mapResponse(
    result: InboundLoopRuntimeRequestHandlerResult,
  ): InboundTransportResponse | Promise<InboundTransportResponse>;
}>;

export type InboundTransportAdapterFailureReason =
  | "adapter_unavailable"
  | "response_mapping_failed"
  | "response_mapping_invalid";

export type InboundTransportHandlingResult =
  | Readonly<{
      handled: true;
      response: InboundTransportResponse;
    }>
  | Readonly<{
      handled: false;
      reason: InboundTransportAdapterFailureReason;
    }>;

function isOrdinaryObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isEnumerableDataProperty(
  descriptor: PropertyDescriptor | undefined,
): descriptor is PropertyDescriptor & { value: unknown } {
  return (
    descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor &&
    !("get" in descriptor) &&
    !("set" in descriptor)
  );
}

function readAdapterMethod(
  adapter: InboundTransportAdapter | null,
  key: "decode" | "mapResponse",
): ((...args: unknown[]) => unknown) | null {
  if (!isOrdinaryObject(adapter)) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(adapter);
  const descriptor = descriptors[key];
  if (!isEnumerableDataProperty(descriptor) || typeof descriptor.value !== "function") {
    return null;
  }

  return descriptor.value as (...args: unknown[]) => unknown;
}

function isValidTransportResponse(
  value: unknown,
  expectedOutcome: InboundLoopRuntimeRequestHandlerResult["outcome"],
): value is InboundTransportResponse {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  return (
    keys.length === 2 &&
    keys.includes("outcome") &&
    keys.includes("payload") &&
    isEnumerableDataProperty(descriptors.outcome) &&
    descriptors.outcome.value === expectedOutcome &&
    isEnumerableDataProperty(descriptors.payload)
  );
}

/**
 * V14.0d transport adapter port.
 *
 * Core receives an opaque transport request only through the injected decoder.
 * Decoder failure is normalized to an invalid envelope and still traverses the
 * V14.0c handler exactly once. The adapter then receives only the closed,
 * redacted handler result to build an abstract transport response.
 */
export async function handleInboundTransportRequest(
  input: unknown,
  adapter: InboundTransportAdapter | null,
  dependencies: InboundLoopRuntimeRequestHandlerDependencies,
): Promise<InboundTransportHandlingResult> {
  const decode = readAdapterMethod(adapter, "decode");
  const mapResponse = readAdapterMethod(adapter, "mapResponse");
  if (decode === null || mapResponse === null || adapter === null) {
    return Object.freeze({
      handled: false as const,
      reason: "adapter_unavailable" as const,
    });
  }

  let decoded: unknown;
  try {
    decoded = await Reflect.apply(decode, adapter, [input]);
  } catch {
    decoded = undefined;
  }

  const handled = await handleInboundLoopRuntimeRequest(decoded, dependencies);

  let response: unknown;
  try {
    response = await Reflect.apply(mapResponse, adapter, [handled]);
  } catch {
    return Object.freeze({
      handled: false as const,
      reason: "response_mapping_failed" as const,
    });
  }

  if (!isValidTransportResponse(response, handled.outcome)) {
    return Object.freeze({
      handled: false as const,
      reason: "response_mapping_invalid" as const,
    });
  }

  return Object.freeze({
    handled: true as const,
    response,
  });
}
