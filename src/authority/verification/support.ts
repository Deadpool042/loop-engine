import type { ExecutionAuthority } from "../../dispatch/types.js";
import type { OperatorApprovalResult } from "../rfc/types.js";
import type { AuthorityVerificationContext, AuthorityVerificationEvidence, AuthorityVerificationMetadata, AuthorityVerificationRequirement, AuthorityVerificationResult, AuthorityVerificationState, AuthorityVerificationSubject } from "./types.js";

export const AUTHORITY_VERIFICATION_RFC_VERSION = "authority-verification-rfc-v13.2" as const;
export function freezeAuthorityVerificationValue<T>(value: T): T {
  if (Array.isArray(value)) value.forEach(freezeAuthorityVerificationValue);
  else if (value && typeof value === "object" && !Object.isFrozen(value)) Object.values(value as Record<string, unknown>).forEach(freezeAuthorityVerificationValue);
  if (value && typeof value === "object") Object.freeze(value);
  return value;
}
export function emptySubject(): AuthorityVerificationSubject {
  return freezeAuthorityVerificationValue({ authorityId: "", authorityVersion: "", approvalId: "", approvalVersion: "", approvalScope: "", providerId: "", protocolId: "", mappingId: "", intentId: "", runtimeCapabilityId: "", transportCapabilityId: "", policyId: "", evidenceIds: [] });
}
export function normalizedContext(context?: AuthorityVerificationContext): AuthorityVerificationContext {
  return freezeAuthorityVerificationValue({ verificationAt: context?.verificationAt ?? "", supported: context?.supported ?? false, subject: freezeAuthorityVerificationValue({ ...(context?.subject ?? emptySubject()), evidenceIds: [...(context?.subject?.evidenceIds ?? [])].sort() }), ...(context?.validFrom ? { validFrom: context.validFrom } : {}), ...(context?.expiresAt ? { expiresAt: context.expiresAt } : {}), ...(context?.revokedAt ? { revokedAt: context.revokedAt } : {}), ...(context?.revocationReason ? { revocationReason: context.revocationReason } : {}), ...(context?.superseded ? { superseded: true } : {}), metadata: freezeAuthorityVerificationValue({ ...(context?.metadata ?? {}), rfcVersion: AUTHORITY_VERIFICATION_RFC_VERSION, declarative: true }) });
}
export function verificationIdFor(context: AuthorityVerificationContext): string { return `authority-verification-rfc.${context.subject.authorityId || "missing"}.${context.subject.approvalVersion || "pending"}`; }
export function evidenceFor(authority: ExecutionAuthority | null, approval: OperatorApprovalResult | null, context: AuthorityVerificationContext): readonly AuthorityVerificationEvidence[] {
  const ids = context.subject.evidenceIds;
  return freezeAuthorityVerificationValue(ids.map((id) => freezeAuthorityVerificationValue({ id, type: "declared_reference", sourceId: authority?.id ?? "", referenceId: approval?.approval.id ?? "", subjectId: context.subject.authorityId, issuerId: approval?.approval.review.reviewerId ?? "", issuedAt: context.verificationAt, reviewedAt: approval?.approval.review.reviewedAt ?? "", ...(context.expiresAt ? { expiresAt: context.expiresAt } : {}), notes: [] })).sort((a, b) => a.id.localeCompare(b.id)));
}
export function requirement(id: string, pass: boolean, reason: string): AuthorityVerificationRequirement { return freezeAuthorityVerificationValue({ id, outcome: pass ? "pass" : "fail", reason, executionStarted: false }); }
export function stateFor(checks: readonly AuthorityVerificationRequirement[], context: AuthorityVerificationContext): AuthorityVerificationState {
  if (!context.supported) return "unsupported";
  if (context.superseded) return "superseded";
  if (context.revokedAt) return "revoked";
  if (context.expiresAt && context.verificationAt >= context.expiresAt) return "expired";
  return checks.every((item) => item.outcome === "pass") ? "verified" : "not_verified";
}
export function summaryFor(result: Pick<AuthorityVerificationResult, "state" | "verification" | "verified">): AuthorityVerificationResult["summary"] {
  const checks = result.verification.checks;
  return freezeAuthorityVerificationValue({ state: result.state, checkCount: checks.length, passedChecks: checks.filter((item) => item.outcome === "pass").length, failedChecks: checks.filter((item) => item.outcome === "fail").length, verified: result.verified, executionAllowed: false, executionStarted: false });
}
