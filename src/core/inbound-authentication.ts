import {
  evaluateInboundAuthenticationVerifier,
  type InboundAuthenticationInput,
  type InboundAuthenticationVerificationContext,
  type InboundAuthenticationVerificationFailureReason,
  type InboundAuthenticationVerifier,
} from "../inbound-security/authentication-verification.js";
import type { InboundSecurityEvaluationInput } from "../inbound-security/types.js";
import type { LoopRuntimePublicRequestAuthorizer } from "./loop-runtime-public-request-authorization.js";
import type { LoopRuntimeAuthorizedEngineAssembler } from "./loop-runtime-public-request-engine-assembly.js";
import {
  evaluateInboundSecurityAndPrepareLoopRuntimeRequest,
  type InboundSecurityGatedPreparationResult,
} from "./inbound-security.js";

export type InboundAuthenticationGatedPreparationInput = Readonly<{
  authenticationInput: InboundAuthenticationInput;
  verificationContext: InboundAuthenticationVerificationContext;
  verifier: InboundAuthenticationVerifier | null;
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
    payload: input.payload,
    authorizer: input.authorizer,
    assembler: input.assembler,
  });

  return Object.freeze({
    verified: true as const,
    security: gated,
  });
}
