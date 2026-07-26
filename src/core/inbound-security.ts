import { evaluateInboundSecurity } from "../inbound-security/evaluation.js";
import type {
  InboundSecurityDecision,
  InboundSecurityEvaluationInput,
} from "../inbound-security/types.js";
import type { LoopRuntimeAuthenticatedPrincipal } from "./loop-runtime-public-request-authorization.js";
import type { LoopRuntimePublicRequestAuthorizer } from "./loop-runtime-public-request-authorization.js";
import type { LoopRuntimeAuthorizedEngineAssembler } from "./loop-runtime-public-request-engine-assembly.js";
import {
  prepareAuthorizedLoopRuntimeRequest,
  type LoopRuntimePreparedPublicRequestEntryResult,
} from "./loop-runtime-public-request-prepared-entry.js";

/**
 * Core-only inbound boundary facade (V14.0a).
 *
 * This is the sole seam that may gate the existing public-runtime
 * authorization/preparation chain (decode -> authorize -> assemble ->
 * prepare, see loop-runtime-public-request-prepared-entry.ts) behind an
 * explicit inbound security decision. It composes, but never duplicates,
 * that existing chain: `prepareAuthorizedLoopRuntimeRequest` is invoked
 * verbatim and exactly once, and only after `evaluateInboundSecurity`
 * returns an explicit "allow".
 *
 * No transport, authenticator, or replay adapter exists yet. Authentication
 * evidence, the principal, and replay evidence must all be supplied
 * explicitly by the caller of this facade — Core never derives them.
 */
export type InboundSecurityGatedPreparationInput = Readonly<{
  security: InboundSecurityEvaluationInput;
  evaluatedAt: string;
  payload: unknown;
  authorizer: LoopRuntimePublicRequestAuthorizer;
  assembler: LoopRuntimeAuthorizedEngineAssembler;
}>;

export type InboundSecurityGatedPreparationResult =
  | Readonly<{
      allowed: false;
      decision: InboundSecurityDecision;
    }>
  | Readonly<{
      allowed: true;
      decision: Extract<InboundSecurityDecision, { kind: "allow" }>;
      prepared: LoopRuntimePreparedPublicRequestEntryResult;
    }>;

export async function evaluateInboundSecurityAndPrepareLoopRuntimeRequest(
  input: InboundSecurityGatedPreparationInput,
): Promise<InboundSecurityGatedPreparationResult> {
  const decision = evaluateInboundSecurity(input.security, input.evaluatedAt);

  if (decision.kind !== "allow") {
    return Object.freeze({
      allowed: false as const,
      decision,
    });
  }

  const principal: LoopRuntimeAuthenticatedPrincipal = Object.freeze({
    principalId: decision.principalId,
  });

  const prepared = await prepareAuthorizedLoopRuntimeRequest({
    principal,
    payload: input.payload,
    authorizer: input.authorizer,
    assembler: input.assembler,
  });

  return Object.freeze({
    allowed: true as const,
    decision,
    prepared,
  });
}
