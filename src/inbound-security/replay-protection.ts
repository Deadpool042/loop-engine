export const INBOUND_REPLAY_PROTECTION_FAILURE_REASONS = [
  "replay_detected",
  "replay_unavailable",
  "replay_invalid",
] as const;

export type InboundReplayProtectionFailureReason =
  (typeof INBOUND_REPLAY_PROTECTION_FAILURE_REASONS)[number];

export type InboundReplayProtectionInput = Readonly<{
  requestId: string;
  evidenceId: string;
  nonce: string | null;
  evaluatedAt: string;
}>;

export type InboundReplayProtectionPortResult =
  | Readonly<{
      accepted: true;
      receivedAt: string;
    }>
  | Readonly<{
      accepted: false;
      reason: "replayed" | "unavailable" | "invalid";
    }>;

export type InboundReplayProtectionPort = Readonly<{
  check(
    input: InboundReplayProtectionInput,
  ): InboundReplayProtectionPortResult | Promise<InboundReplayProtectionPortResult>;
}>;

export type InboundReplayProtectionResult =
  | Readonly<{
      accepted: true;
      receivedAt: string;
    }>
  | Readonly<{
      accepted: false;
      reason: InboundReplayProtectionFailureReason;
    }>;

const REPLAY_DETECTED = Object.freeze({
  accepted: false as const,
  reason: "replay_detected" as const,
});

const REPLAY_UNAVAILABLE = Object.freeze({
  accepted: false as const,
  reason: "replay_unavailable" as const,
});

const REPLAY_INVALID = Object.freeze({
  accepted: false as const,
  reason: "replay_invalid" as const,
});

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidInput(value: unknown): value is InboundReplayProtectionInput {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const expected = ["requestId", "evidenceId", "nonce", "evaluatedAt"];

  return (
    keys.length === expected.length &&
    expected.every((key) => keys.includes(key)) &&
    expected.every((key) => isEnumerableDataProperty(descriptors[key])) &&
    isNonEmptyString(descriptors.requestId!.value) &&
    isNonEmptyString(descriptors.evidenceId!.value) &&
    (descriptors.nonce!.value === null ||
      isNonEmptyString(descriptors.nonce!.value)) &&
    isNonEmptyString(descriptors.evaluatedAt!.value)
  );
}

function readCheck(
  port: InboundReplayProtectionPort | null,
): ((input: InboundReplayProtectionInput) => unknown) | null {
  if (!isOrdinaryObject(port)) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(port);
  const keys = Reflect.ownKeys(descriptors);

  if (
    keys.length !== 1 ||
    keys[0] !== "check" ||
    !isEnumerableDataProperty(descriptors.check) ||
    typeof descriptors.check.value !== "function"
  ) {
    return null;
  }

  return descriptors.check.value as (
    input: InboundReplayProtectionInput,
  ) => unknown;
}

function normalizeResult(value: unknown): InboundReplayProtectionResult {
  if (!isOrdinaryObject(value)) {
    return REPLAY_INVALID;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);

  if (
    !isEnumerableDataProperty(descriptors.accepted) ||
    typeof descriptors.accepted.value !== "boolean"
  ) {
    return REPLAY_INVALID;
  }

  if (descriptors.accepted.value === true) {
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== 2 ||
      !keys.includes("accepted") ||
      !keys.includes("receivedAt") ||
      !isEnumerableDataProperty(descriptors.receivedAt) ||
      !isNonEmptyString(descriptors.receivedAt.value)
    ) {
      return REPLAY_INVALID;
    }

    return Object.freeze({
      accepted: true as const,
      receivedAt: descriptors.receivedAt.value,
    });
  }

  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 2 ||
    !keys.includes("accepted") ||
    !keys.includes("reason") ||
    !isEnumerableDataProperty(descriptors.reason)
  ) {
    return REPLAY_INVALID;
  }

  if (descriptors.reason.value === "replayed") {
    return REPLAY_DETECTED;
  }

  if (descriptors.reason.value === "unavailable") {
    return REPLAY_UNAVAILABLE;
  }

  return REPLAY_INVALID;
}

/**
 * V14.0e replay-protection port evaluator.
 *
 * No persistence, cache, network, filesystem, environment access, retry,
 * implicit clock, registry, or concrete replay backend exists here.
 */
export async function evaluateInboundReplayProtection(
  input: InboundReplayProtectionInput,
  port: InboundReplayProtectionPort | null,
): Promise<InboundReplayProtectionResult> {
  try {
    if (!isValidInput(input)) {
      return REPLAY_INVALID;
    }

    const check = readCheck(port);
    if (check === null) {
      return REPLAY_UNAVAILABLE;
    }

    const result = await Reflect.apply(check, port, [input]);
    return normalizeResult(result);
  } catch {
    return REPLAY_INVALID;
  }
}
