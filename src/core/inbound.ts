import type { InboundReplayProtectionPort } from "../inbound-security/replay-protection.js";
import type {
  InboundAccessPolicy,
  InboundAccessRequest,
  InboundAuthenticationVerificationFailureReason,
  InboundAuthenticationVerificationContext,
  InboundAuthenticationInput,
  InboundAuthenticationVerifier,
  InboundPrincipal,
  InboundReplayEvidence,
  InboundSecurityDecision,
} from "../inbound-security/index.js";
import type { LoopRuntimePublicRequestAuthorizer } from "./loop-runtime-public-request-authorization.js";
import type { LoopRuntimeAuthorizedEngineAssembler } from "./loop-runtime-public-request-engine-assembly.js";
import type { LoopRuntimePreparedPublicRequestEntryResult } from "./loop-runtime-public-request-prepared-entry.js";
import { verifyInboundAuthenticationAndPrepareLoopRuntimeRequest } from "./inbound-authentication.js";

/**
 * V14.0c transport-neutral inbound application handler.
 *
 * This is the single intentional Core entrypoint a future HTTP, webhook,
 * socket, or queue adapter must call. It knows no transport concept (no
 * method, URL, path, header, status code, cookie, or framework request/
 * response object) — a future adapter is responsible for translating its own
 * protocol into this neutral envelope.
 *
 * The handler composes the existing V14.0b facade
 * (`verifyInboundAuthenticationAndPrepareLoopRuntimeRequest`) rather than
 * reimplementing authentication verification, inbound security evaluation,
 * authorization, assembly, or Runtime preparation. It adds exactly one thing
 * on top of V14.0b: fail-closed structural/identity validation of the
 * untrusted envelope before any verifier call is made.
 */
export const INBOUND_ENVELOPE_VALIDATION_FAILURE_REASONS = [
  "malformed_envelope",
  "request_id_mismatch",
] as const;

export type InboundEnvelopeValidationFailureReason =
  (typeof INBOUND_ENVELOPE_VALIDATION_FAILURE_REASONS)[number];

/**
 * Untrusted transport-neutral input. Every field is either opaque
 * authentication material (`authenticationInput`) or a value that a future
 * transport adapter is expected to have already resolved/attached upstream
 * (principal, access request, replay evidence) — this handler never derives
 * any of them itself.
 */
export type InboundLoopRuntimeRequestEnvelope = Readonly<{
  requestId: string;
  authenticationInput: InboundAuthenticationInput;
  verificationContext: InboundAuthenticationVerificationContext;
  principal: InboundPrincipal | null;
  accessRequest: InboundAccessRequest;
  replayEvidence: InboundReplayEvidence | null;
  policy: InboundAccessPolicy;
  evaluatedAt: string;
  payload: unknown;
}>;

/** Explicit, injected dependencies. No default, no registry, no discovery. */
export type InboundLoopRuntimeRequestHandlerDependencies = Readonly<{
  verifier: InboundAuthenticationVerifier | null;
  replayProtectionPort: InboundReplayProtectionPort | null;
  authorizer: LoopRuntimePublicRequestAuthorizer;
  assembler: LoopRuntimeAuthorizedEngineAssembler;
}>;

export type InboundLoopRuntimeRequestHandlerResult =
  | Readonly<{
      outcome: "invalid";
      reason: InboundEnvelopeValidationFailureReason;
    }>
  | Readonly<{
      outcome: "rejected";
      stage: "authentication";
      reason: InboundAuthenticationVerificationFailureReason;
    }>
  | Readonly<{
      outcome: "rejected";
      stage: "security";
      decision: InboundSecurityDecision;
    }>
  | Readonly<{
      outcome: "accepted";
      prepared: LoopRuntimePreparedPublicRequestEntryResult;
    }>;

type EnvelopeValidationResult =
  | Readonly<{ valid: true }>
  | Readonly<{ valid: false; reason: InboundEnvelopeValidationFailureReason }>;

function isOrdinaryObject(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequestId(value: unknown): string | null {
  if (!isOrdinaryObject(value)) {
    return null;
  }

  const requestId = (value as { requestId?: unknown }).requestId;
  return isNonEmptyString(requestId) ? requestId : null;
}

const REQUIRED_ENVELOPE_KEYS = Object.freeze([
  "requestId",
  "authenticationInput",
  "verificationContext",
  "principal",
  "accessRequest",
  "replayEvidence",
  "policy",
  "evaluatedAt",
  "payload",
]);

function hasExactEnvelopeShape(
  value: unknown,
): value is Record<(typeof REQUIRED_ENVELOPE_KEYS)[number], unknown> {
  if (!isOrdinaryObject(value)) {
    return false;
  }

  const keys = Reflect.ownKeys(value);
  if (keys.length !== REQUIRED_ENVELOPE_KEYS.length) {
    return false;
  }

  return REQUIRED_ENVELOPE_KEYS.every((key) => keys.includes(key));
}

function invalid(
  reason: InboundEnvelopeValidationFailureReason,
): EnvelopeValidationResult {
  return Object.freeze({ valid: false as const, reason });
}

/**
 * Fail-closed structural and identity validation of the untrusted envelope.
 * Runs before any authentication verifier call — a malformed or
 * internally-inconsistent envelope never reaches V14.0b. Never mutates or
 * silently normalizes disagreeing identifiers.
 */
export function validateInboundLoopRuntimeRequestEnvelope(
  envelope: unknown,
): EnvelopeValidationResult {
  if (!hasExactEnvelopeShape(envelope)) {
    return invalid("malformed_envelope");
  }

  if (!isNonEmptyString(envelope.requestId)) {
    return invalid("malformed_envelope");
  }

  if (!isOrdinaryObject(envelope.authenticationInput)) {
    return invalid("malformed_envelope");
  }

  if (!isOrdinaryObject(envelope.verificationContext)) {
    return invalid("malformed_envelope");
  }

  if (envelope.principal !== null && !isOrdinaryObject(envelope.principal)) {
    return invalid("malformed_envelope");
  }

  if (!isOrdinaryObject(envelope.accessRequest)) {
    return invalid("malformed_envelope");
  }

  if (
    envelope.replayEvidence !== null &&
    !isOrdinaryObject(envelope.replayEvidence)
  ) {
    return invalid("malformed_envelope");
  }

  if (!isOrdinaryObject(envelope.policy)) {
    return invalid("malformed_envelope");
  }

  if (!isNonEmptyString(envelope.evaluatedAt)) {
    return invalid("malformed_envelope");
  }

  const verificationContextRequestId = readRequestId(envelope.verificationContext);
  const accessRequestRequestId = readRequestId(envelope.accessRequest);

  if (verificationContextRequestId === null || accessRequestRequestId === null) {
    return invalid("malformed_envelope");
  }

  if (
    envelope.requestId !== verificationContextRequestId ||
    envelope.requestId !== accessRequestRequestId
  ) {
    return invalid("request_id_mismatch");
  }

  if (envelope.replayEvidence !== null) {
    const replayRequestId = readRequestId(envelope.replayEvidence);
    if (replayRequestId === null) {
      return invalid("malformed_envelope");
    }

    if (replayRequestId !== envelope.requestId) {
      return invalid("request_id_mismatch");
    }
  }

  return Object.freeze({ valid: true as const });
}

/**
 * Transport-neutral inbound application entrypoint (V14.0c).
 *
 * Call order is always: validate envelope -> (invalid: stop) ->
 * `verifyInboundAuthenticationAndPrepareLoopRuntimeRequest` exactly once ->
 * map its result. No retry, no fallback, no double decode, no duplicate
 * authorization, and no direct call to any lower-level V14.0a/V14.0b
 * function.
 */
export async function handleInboundLoopRuntimeRequest(
  envelope: InboundLoopRuntimeRequestEnvelope,
  dependencies: InboundLoopRuntimeRequestHandlerDependencies,
): Promise<InboundLoopRuntimeRequestHandlerResult> {
  const validation = validateInboundLoopRuntimeRequestEnvelope(envelope);
  if (!validation.valid) {
    return Object.freeze({
      outcome: "invalid" as const,
      reason: validation.reason,
    });
  }

  const result = await verifyInboundAuthenticationAndPrepareLoopRuntimeRequest({
    authenticationInput: envelope.authenticationInput,
    verificationContext: envelope.verificationContext,
    verifier: dependencies.verifier,
    replayProtectionPort: dependencies.replayProtectionPort,
    security: Object.freeze({
      principal: envelope.principal,
      accessRequest: envelope.accessRequest,
      replayEvidence: envelope.replayEvidence,
      policy: envelope.policy,
    }),
    evaluatedAt: envelope.evaluatedAt,
    payload: envelope.payload,
    authorizer: dependencies.authorizer,
    assembler: dependencies.assembler,
  });

  if (!result.verified) {
    return Object.freeze({
      outcome: "rejected" as const,
      stage: "authentication" as const,
      reason: result.reason,
    });
  }

  if (!result.security.allowed) {
    return Object.freeze({
      outcome: "rejected" as const,
      stage: "security" as const,
      decision: result.security.decision,
    });
  }

  return Object.freeze({
    outcome: "accepted" as const,
    prepared: result.security.prepared,
  });
}
