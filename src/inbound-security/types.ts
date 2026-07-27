import type { LoopRuntimePublicRequest } from "../core/loop-runtime-public-request.js";

export const INBOUND_SECURITY_SCHEMA_VERSION = 1 as const;

/**
 * Evidence already obtained and verified by a future transport/authenticator.
 * This type never performs authentication itself and must never carry raw
 * secret material (tokens, passwords, keys, cookies) — only a fingerprint
 * or reference to the credential that produced it.
 */
export type InboundAuthenticationEvidence = Readonly<{
  evidenceId: string;
  method: string;
  subjectId: string;
  issuerId: string;
  credentialFingerprint: string;
  verified: boolean;
  issuedAt: string;
  validFrom: string;
  expiresAt: string;
  metadata?: Readonly<Record<string, string>>;
}>;

/** Authenticated caller identity, already resolved upstream. */
export type InboundPrincipal = Readonly<{
  principalId: string;
  principalType: string;
  tenantId: string | null;
  roles: readonly string[];
}>;

/**
 * Declarative description of what the caller is asking Loop Engine to do at
 * the inbound boundary. References the existing public-runtime request
 * intent (project + mode) rather than duplicating its full schema.
 */
export type InboundAccessRequest = Readonly<{
  requestId: string;
  principalId: string;
  tenantId: string | null;
  project: string;
  operation: LoopRuntimePublicRequest["mode"];
}>;

/**
 * Pure contract for a future replay-protection adapter. Loop Engine consumes
 * replay evidence supplied explicitly by the caller; it never maintains
 * nonce/replay state itself.
 */
export type InboundReplayEvidence = Readonly<{
  requestId: string;
  evidenceId: string;
  receivedAt: string;
  nonce: string | null;
  replayed: boolean;
}>;

/** Explicit, fail-closed authorization policy consulted by the evaluator. */
export type InboundAccessPolicy = Readonly<{
  allowedOperations: readonly LoopRuntimePublicRequest["mode"][];
  replayCheckRequired: boolean;
}>;

export const INBOUND_ACCESS_DENY_REASONS = [
  "authentication_missing",
  "authentication_invalid",
  "authentication_expired",
  "authentication_not_yet_valid",
  "principal_mismatch",
  "tenant_mismatch",
  "request_id_mismatch",
  "project_mismatch",
  "operation_not_allowed",
  "operation_mismatch",
  "replay_evidence_missing",
  "replay_rejected",
] as const;

export type InboundAccessDenyReason =
  (typeof INBOUND_ACCESS_DENY_REASONS)[number];

export const INBOUND_ACCESS_INDETERMINATE_REASONS = [
  "insufficient_evidence",
] as const;

export type InboundAccessIndeterminateReason =
  (typeof INBOUND_ACCESS_INDETERMINATE_REASONS)[number];

/** Pure ACL evaluation result. Default is always deny. */
export type InboundSecurityDecision =
  | Readonly<{
      kind: "allow";
      requestId: string;
      principalId: string;
    }>
  | Readonly<{
      kind: "deny";
      requestId: string;
      reason: InboundAccessDenyReason;
    }>
  | Readonly<{
      kind: "indeterminate";
      requestId: string;
      reason: InboundAccessIndeterminateReason;
    }>;

export type InboundSecurityEvaluationInput = Readonly<{
  evidence: InboundAuthenticationEvidence | null;
  principal: InboundPrincipal | null;
  accessRequest: InboundAccessRequest;
  replayEvidence: InboundReplayEvidence | null;
  policy: InboundAccessPolicy;
}>;
