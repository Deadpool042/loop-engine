import type {
  InboundAccessDenyReason,
  InboundAccessIndeterminateReason,
  InboundSecurityDecision,
} from "./types.js";

export function denyInboundSecurity(
  requestId: string,
  reason: InboundAccessDenyReason,
): InboundSecurityDecision {
  return Object.freeze({
    kind: "deny" as const,
    requestId,
    reason,
  });
}

export function indeterminateInboundSecurity(
  requestId: string,
  reason: InboundAccessIndeterminateReason,
): InboundSecurityDecision {
  return Object.freeze({
    kind: "indeterminate" as const,
    requestId,
    reason,
  });
}

export function allowInboundSecurity(
  requestId: string,
  principalId: string,
): InboundSecurityDecision {
  return Object.freeze({
    kind: "allow" as const,
    requestId,
    principalId,
  });
}
