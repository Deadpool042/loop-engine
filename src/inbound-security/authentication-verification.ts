import type { InboundAuthenticationEvidence } from "./types.js";
import { isInvalidAuthenticationEvidenceWindow } from "./validation.js";

export const INBOUND_AUTHENTICATION_VERIFICATION_FAILURE_REASONS = [
  "verification_rejected",
  "verification_unavailable",
  "verification_invalid",
] as const;

export type InboundAuthenticationVerificationFailureReason =
  (typeof INBOUND_AUTHENTICATION_VERIFICATION_FAILURE_REASONS)[number];

/**
 * Transport-neutral authentication material that is not trusted yet.
 * `credential` is intentionally opaque and may contain secret-bearing input;
 * Core never reads, logs, serializes, or forwards it beyond the injected
 * verifier boundary.
 */
export type InboundAuthenticationInput = Readonly<{
  method: string;
  credential: unknown;
  issuerHint: string | null;
  subjectHint: string | null;
  metadata?: Readonly<Record<string, string>>;
}>;

export type InboundAuthenticationVerificationContext = Readonly<{
  requestId: string;
  evaluatedAt: string;
}>;

export type InboundAuthenticationVerifierResult =
  | Readonly<{
      verified: true;
      evidence: InboundAuthenticationEvidence;
    }>
  | Readonly<{
      verified: false;
      reason: "rejected" | "unavailable" | "invalid";
    }>;

export type InboundAuthenticationVerifier = Readonly<{
  verify(
    input: InboundAuthenticationInput,
    context: InboundAuthenticationVerificationContext,
  ): InboundAuthenticationVerifierResult | Promise<InboundAuthenticationVerifierResult>;
}>;

export type InboundAuthenticationVerificationResult =
  | Readonly<{
      verified: true;
      evidence: InboundAuthenticationEvidence;
    }>
  | Readonly<{
      verified: false;
      reason: InboundAuthenticationVerificationFailureReason;
    }>;

const VERIFICATION_REJECTED = Object.freeze({
  verified: false as const,
  reason: "verification_rejected" as const,
});

const VERIFICATION_UNAVAILABLE = Object.freeze({
  verified: false as const,
  reason: "verification_unavailable" as const,
});

const VERIFICATION_INVALID = Object.freeze({
  verified: false as const,
  reason: "verification_invalid" as const,
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

function hasOnlyKeys(
  descriptors: Readonly<Record<PropertyKey, PropertyDescriptor>>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = [],
): boolean {
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...requiredKeys, ...optionalKeys]);
  return (
    requiredKeys.every((key) => keys.includes(key)) &&
    keys.every((key) => typeof key === "string" && allowed.has(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringRecord(value: unknown): boolean {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every((key) => {
    const descriptor = descriptors[key];
    return (
      typeof key === "string" &&
      isEnumerableDataProperty(descriptor) &&
      typeof descriptor.value === "string"
    );
  });
}

function isValidAuthenticationInput(value: unknown): value is InboundAuthenticationInput {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !hasOnlyKeys(
      descriptors,
      ["method", "credential", "issuerHint", "subjectHint"],
      ["metadata"],
    ) ||
    !isEnumerableDataProperty(descriptors.method) ||
    !isNonEmptyString(descriptors.method.value) ||
    !isEnumerableDataProperty(descriptors.credential) ||
    descriptors.credential.value === undefined ||
    !isEnumerableDataProperty(descriptors.issuerHint) ||
    (descriptors.issuerHint.value !== null &&
      typeof descriptors.issuerHint.value !== "string") ||
    !isEnumerableDataProperty(descriptors.subjectHint) ||
    (descriptors.subjectHint.value !== null &&
      typeof descriptors.subjectHint.value !== "string")
  ) {
    return false;
  }

  return (
    descriptors.metadata === undefined ||
    (isEnumerableDataProperty(descriptors.metadata) &&
      isStringRecord(descriptors.metadata.value))
  );
}

function isValidVerificationContext(
  value: unknown,
): value is InboundAuthenticationVerificationContext {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  return (
    hasOnlyKeys(descriptors, ["requestId", "evaluatedAt"]) &&
    isEnumerableDataProperty(descriptors.requestId) &&
    isNonEmptyString(descriptors.requestId.value) &&
    isEnumerableDataProperty(descriptors.evaluatedAt) &&
    isNonEmptyString(descriptors.evaluatedAt.value)
  );
}

function isValidEvidence(value: unknown): value is InboundAuthenticationEvidence {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const stringKeys = [
    "evidenceId",
    "method",
    "subjectId",
    "issuerId",
    "credentialFingerprint",
    "issuedAt",
    "validFrom",
    "expiresAt",
  ] as const;

  if (
    !hasOnlyKeys(descriptors, [...stringKeys, "verified"], ["metadata"]) ||
    stringKeys.some(
      (key) =>
        !isEnumerableDataProperty(descriptors[key]) ||
        !isNonEmptyString(descriptors[key]!.value),
    ) ||
    !isEnumerableDataProperty(descriptors.verified) ||
    descriptors.verified.value !== true
  ) {
    return false;
  }

  return (
    descriptors.metadata === undefined ||
    (isEnumerableDataProperty(descriptors.metadata) &&
      isStringRecord(descriptors.metadata.value))
  );
}

function readVerifyFunction(
  verifier: InboundAuthenticationVerifier | null,
): ((
  input: InboundAuthenticationInput,
  context: InboundAuthenticationVerificationContext,
) => unknown) | null {
  if (!isOrdinaryObject(verifier)) {
    return null;
  }

  const descriptors = Object.getOwnPropertyDescriptors(verifier);
  if (
    !hasOnlyKeys(descriptors, ["verify"]) ||
    !isEnumerableDataProperty(descriptors.verify) ||
    typeof descriptors.verify.value !== "function"
  ) {
    return null;
  }

  return descriptors.verify.value as (
    input: InboundAuthenticationInput,
    context: InboundAuthenticationVerificationContext,
  ) => unknown;
}

function canonicalizeVerifierResult(
  value: unknown,
): InboundAuthenticationVerificationResult {
  if (!isOrdinaryObject(value)) {
    return VERIFICATION_INVALID;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    !isEnumerableDataProperty(descriptors.verified) ||
    typeof descriptors.verified.value !== "boolean"
  ) {
    return VERIFICATION_INVALID;
  }

  if (descriptors.verified.value === false) {
    if (
      !hasOnlyKeys(descriptors, ["verified", "reason"]) ||
      !isEnumerableDataProperty(descriptors.reason)
    ) {
      return VERIFICATION_INVALID;
    }

    if (descriptors.reason.value === "rejected") {
      return VERIFICATION_REJECTED;
    }

    if (descriptors.reason.value === "unavailable") {
      return VERIFICATION_UNAVAILABLE;
    }

    return VERIFICATION_INVALID;
  }

  if (
    !hasOnlyKeys(descriptors, ["verified", "evidence"]) ||
    !isEnumerableDataProperty(descriptors.evidence) ||
    !isValidEvidence(descriptors.evidence.value)
  ) {
    return VERIFICATION_INVALID;
  }

  if (isInvalidAuthenticationEvidenceWindow(descriptors.evidence.value)) {
    return VERIFICATION_INVALID;
  }

  return Object.freeze({
    verified: true as const,
    evidence: descriptors.evidence.value,
  });
}

/**
 * Executes exactly one injected verifier call and normalizes every failure to
 * a stable redacted result. No retry, fallback, registry, implicit clock,
 * environment access, transport, or concrete credential verification exists
 * here.
 */
export async function evaluateInboundAuthenticationVerifier(
  input: InboundAuthenticationInput,
  context: InboundAuthenticationVerificationContext,
  verifier: InboundAuthenticationVerifier | null,
): Promise<InboundAuthenticationVerificationResult> {
  try {
    if (!isValidAuthenticationInput(input) || !isValidVerificationContext(context)) {
      return VERIFICATION_INVALID;
    }

    const verify = readVerifyFunction(verifier);
    if (verify === null) {
      return VERIFICATION_UNAVAILABLE;
    }

    const result = await Reflect.apply(verify, verifier, [input, context]);
    return canonicalizeVerifierResult(result);
  } catch {
    return VERIFICATION_INVALID;
  }
}
