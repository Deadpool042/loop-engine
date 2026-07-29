import {
  denyInboundSecurity,
  indeterminateInboundSecurity,
} from "../inbound-security/errors.js";
import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationInput,
  type InboundAuthenticationVerificationContext,
  type InboundAuthenticationVerificationFailureReason,
  type InboundAuthenticationVerifier,
} from "../inbound-security/authentication-verification.js";
import {
  evaluateInboundReplayProtection,
  type InboundReplayProtectionPort,
} from "../inbound-security/replay-protection.js";
import type { InboundSecurityEvaluationInput } from "../inbound-security/types.js";
import {
  isEvidenceExpired,
  isEvidenceNotYetValid,
  isInboundOperationAllowed,
  isInstantAfter,
  isInvalidEvaluationTime,
  isInvalidPresentReplayNonce,
  isInvalidReplayProtectionReceivedAt,
  isInvalidReplayReceivedAt,
  isInvalidRequestId,
  isReplayReceiptTimeAfterEvaluation,
} from "../inbound-security/validation.js";
import type { LoopRuntimePublicRequestAuthorizer } from "./loop-runtime-public-request-authorization.js";
import { decodeLoopRuntimePublicRequest } from "./loop-runtime-public-request-decoder.js";
import type { LoopRuntimeAuthorizedEngineAssembler } from "./loop-runtime-public-request-engine-assembly.js";
import {
  evaluateInboundSecurityAndPrepareLoopRuntimeRequest,
  type InboundSecurityGatedPreparationResult,
} from "./inbound-security.js";

export type InboundAuthenticationGatedPreparationInput = Readonly<{
  authenticationInput: InboundAuthenticationInput;
  verificationContext: InboundAuthenticationVerificationContext;
  verifier: InboundAuthenticationVerifier | null;
  replayProtectionPort: InboundReplayProtectionPort | null;
  security: Omit<InboundSecurityEvaluationInput, "evidence">;
  evaluatedAt: string;
  payload: unknown;
  authorizer: LoopRuntimePublicRequestAuthorizer;
  assembler: LoopRuntimeAuthorizedEngineAssembler;
}>;

export type InboundAuthenticationGatedPreparationResult =
  | Readonly<{
      verified: false;
      reason: InboundAuthenticationVerificationFailureReason;
    }>
  | Readonly<{
      verified: true;
      security: InboundSecurityGatedPreparationResult;
    }>;

/**
 * V14.0b trust boundary.
 *
 * Untrusted authentication material is consumed only by the injected verifier.
 * The existing V14.0a facade receives authentication evidence only after an
 * explicit successful verification. Raw authentication material is never
 * forwarded into inbound security, authorization, assembly, preparation, or
 * Runtime contracts.
 */
export async function verifyInboundAuthenticationAndPrepareLoopRuntimeRequest(
  input: InboundAuthenticationGatedPreparationInput,
): Promise<InboundAuthenticationGatedPreparationResult> {
  const verification = await evaluateInboundAuthenticationVerifier(
    input.authenticationInput,
    input.verificationContext,
    input.verifier,
  );

  if (!verification.verified) {
    return Object.freeze({
      verified: false as const,
      reason: verification.reason,
    });
  }

  if (input.authenticationInput.method !== verification.evidence.method) {
    return Object.freeze({
      verified: false as const,
      reason: "verification_invalid" as const,
    });
  }

  if (
    input.authenticationInput.subjectHint !== null &&
    input.authenticationInput.subjectHint !== verification.evidence.subjectId
  ) {
    return Object.freeze({
      verified: false as const,
      reason: "verification_invalid" as const,
    });
  }

  if (
    input.authenticationInput.issuerHint !== null &&
    input.authenticationInput.issuerHint !== verification.evidence.issuerId
  ) {
    return Object.freeze({
      verified: false as const,
      reason: "verification_invalid" as const,
    });
  }

  if (input.verificationContext.evaluatedAt !== input.evaluatedAt) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "evaluation_time_mismatch",
        ),
      }),
    });
  }

  if (isInvalidEvaluationTime(input.evaluatedAt)) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "evaluation_time_mismatch",
        ),
      }),
    });
  }

  if (isEvidenceNotYetValid(verification.evidence, input.evaluatedAt)) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "authentication_not_yet_valid",
        ),
      }),
    });
  }

  if (isEvidenceExpired(verification.evidence, input.evaluatedAt)) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "authentication_expired",
        ),
      }),
    });
  }

  const principal = input.security.principal;

  if (principal === null) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: indeterminateInboundSecurity(
          input.verificationContext.requestId,
          "insufficient_evidence",
        ),
      }),
    });
  }

  if (
    (principal.principalId !== verification.evidence.subjectId ||
      principal.principalId !== input.security.accessRequest.principalId)
  ) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "principal_mismatch",
        ),
      }),
    });
  }

  if (principal.tenantId !== input.security.accessRequest.tenantId) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "tenant_mismatch",
        ),
      }),
    });
  }

  if (isInvalidRequestId(input.security.accessRequest.requestId)) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "request_id_mismatch",
        ),
      }),
    });
  }

  if (
    input.verificationContext.requestId !== input.security.accessRequest.requestId
  ) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "request_id_mismatch",
        ),
      }),
    });
  }

  const decoded = decodeLoopRuntimePublicRequest(input.payload);

  if (!decoded.parsed) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "operation_mismatch",
        ),
      }),
    });
  }

  if (input.security.accessRequest.project !== decoded.request.project) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "project_mismatch",
        ),
      }),
    });
  }

  if (input.security.accessRequest.operation !== decoded.request.mode) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "operation_mismatch",
        ),
      }),
    });
  }

  if (
    !isInboundOperationAllowed(
      input.security.accessRequest.operation,
      input.security.policy,
    )
  ) {
    return Object.freeze({
      verified: true as const,
      security: Object.freeze({
        allowed: false as const,
        decision: denyInboundSecurity(
          input.verificationContext.requestId,
          "operation_not_allowed",
        ),
      }),
    });
  }

  if (input.security.policy.replayCheckRequired) {
    const replayEvidence = input.security.replayEvidence;

    if (replayEvidence === null) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_evidence_missing",
          ),
        }),
      });
    }

    if (replayEvidence.evidenceId !== verification.evidence.evidenceId) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (replayEvidence.requestId !== input.security.accessRequest.requestId) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (replayEvidence.replayed) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (isInvalidReplayReceivedAt(replayEvidence)) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (isReplayReceiptTimeAfterEvaluation(replayEvidence, input.evaluatedAt)) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (isInvalidPresentReplayNonce(replayEvidence)) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    const replay = await evaluateInboundReplayProtection(
      Object.freeze({
        requestId: input.verificationContext.requestId,
        evidenceId: verification.evidence.evidenceId,
        nonce: replayEvidence.nonce,
        evaluatedAt: input.evaluatedAt,
      }),
      input.replayProtectionPort,
    );

    if (!replay.accepted) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (isInvalidReplayProtectionReceivedAt(replay.receivedAt)) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }

    if (isInstantAfter(replay.receivedAt, input.evaluatedAt)) {
      return Object.freeze({
        verified: true as const,
        security: Object.freeze({
          allowed: false as const,
          decision: denyInboundSecurity(
            input.verificationContext.requestId,
            "replay_rejected",
          ),
        }),
      });
    }
  }

  const security: InboundSecurityEvaluationInput = Object.freeze({
    evidence: verification.evidence,
    principal: input.security.principal,
    accessRequest: input.security.accessRequest,
    replayEvidence: input.security.replayEvidence,
    policy: input.security.policy,
  });

  const gated = await evaluateInboundSecurityAndPrepareLoopRuntimeRequest({
    security,
    evaluatedAt: input.evaluatedAt,
    request: decoded.request,
    authorizer: input.authorizer,
    assembler: input.assembler,
  });

  return Object.freeze({
    verified: true as const,
    security: gated,
  });
}
