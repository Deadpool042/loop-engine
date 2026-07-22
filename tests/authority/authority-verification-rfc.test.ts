import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { createOperatorApprovalRFC } from "../../src/authority/rfc/index.js";
import { createAuthorityVerification, evaluateAuthorityVerification, summarizeAuthorityVerification, validateAuthorityVerification } from "../../src/authority/verification/index.js";
import type { ExecutionAuthority } from "../../src/dispatch/types.js";
import type { AuthorityVerificationContext } from "../../src/authority/verification/types.js";

const authority: ExecutionAuthority = Object.freeze({ id: "authority.openclaw", status: "granted", eligibilityId: "eligibility.openclaw", reviewedRequestId: "request.openclaw", reviewId: "review.openclaw", provenanceId: "provenance.openclaw", policyVersion: "policy/v1", configurationVersion: "configuration/v1", mappingVersion: "mapping/v1", protocolVersion: "protocol/v1", runtimeContractVersion: "runtime/v1", transportContractVersion: "transport/v1", architectureRfcVersion: "rfc-execution-boundary-v12", metadata: Object.freeze({}), approved: true, revoked: false, expired: false, executionStarted: false });
const approval = createOperatorApprovalRFC(authority, { state: "approved", previousState: "under_review", reviewerId: "operator.local", reviewedAt: "2026-07-18T00:00:00.000Z", approvalScope: "openclaw.plan", approvalVersion: "approval/v1", evidenceReferences: ["evidence.b", "evidence.a"], expiryPolicy: "declared", approved: true, expired: false, revoked: false });
function context(overrides: Partial<AuthorityVerificationContext> = {}): AuthorityVerificationContext {
  return { verificationAt: "2026-07-18T12:00:00.000Z", supported: true, subject: { authorityId: authority.id, authorityVersion: authority.architectureRfcVersion, approvalId: approval.approval.id, approvalVersion: "approval/v1", approvalScope: "openclaw.plan", providerId: "openclaw", protocolId: "openclaw/v1", mappingId: "mapping.openclaw", intentId: "intent.openclaw", runtimeCapabilityId: "runtime.capability", transportCapabilityId: "transport.capability", policyId: "policy/v1", evidenceIds: ["evidence.b", "evidence.a"] }, ...overrides };
}

describe("authority verification RFC", () => {
  test("creates deeply immutable, stably ordered verification evidence", () => {
    const result = createAuthorityVerification(authority, approval, context());
    assert.equal(result.verified, true); assert.equal(result.executionAllowed, false); assert.equal(result.executionStarted, false);
    assert.equal(Object.isFrozen(result), true); assert.equal(Object.isFrozen(result.verification.checks), true); assert.equal(Object.isFrozen(result.verification.evidence), true);
    assert.deepEqual(result.verification.evidence.map((item) => item.id), ["evidence.a", "evidence.b"]);
    assert.deepEqual(result.verification.checks.map((item) => item.id), ["authority_present", "authority_structurally_valid", "authority_active", "authority_approval_state", "approval_present", "approval_lifecycle_state", "approval_review_complete", "approval_scope_consistent", "authority_version_consistent", "approval_version_consistent", "provider_consistent", "protocol_consistent", "mapping_consistent", "intent_consistent", "runtime_capability_consistent", "transport_capability_consistent", "policy_consistent", "evidence_complete", "valid_from_enforced", "expiry_enforced", "revocation_enforced", "supersession_enforced", "verification_context_valid"]);
    assert.deepEqual(summarizeAuthorityVerification(result), result.summary); assert.equal(evaluateAuthorityVerification(result).verified, true); assert.equal(validateAuthorityVerification(result).valid, true);
  });
  test("fails closed for missing, inactive, invalid, and unapproved governance evidence", () => {
    assert.equal(createAuthorityVerification(null, approval, context()).verified, false);
    assert.equal(createAuthorityVerification({ ...authority, status: "pending" }, approval, context()).authorityVerified, false);
    assert.equal(createAuthorityVerification({ ...authority, id: "" }, approval, context()).verified, false);
    assert.equal(createAuthorityVerification({ ...authority, approved: false }, approval, context()).verified, false);
    assert.equal(createAuthorityVerification(authority, null, context()).approvalVerified, false);
    assert.equal(createAuthorityVerification(authority, createOperatorApprovalRFC(authority, { ...approval.approval.review, state: "under_review", previousState: "submitted", approved: false }), context()).verified, false);
  });
  test("checks scope, versions, declared references, policy, and evidence independently", () => {
    const cases: readonly [string, Partial<AuthorityVerificationContext>][] = [["scope", { subject: { ...context().subject, approvalScope: "other" } }], ["authority version", { subject: { ...context().subject, authorityVersion: "other" } }], ["approval version", { subject: { ...context().subject, approvalVersion: "other" } }], ["provider", { subject: { ...context().subject, providerId: "" } }], ["protocol", { subject: { ...context().subject, protocolId: "" } }], ["mapping", { subject: { ...context().subject, mappingId: "" } }], ["intent", { subject: { ...context().subject, intentId: "" } }], ["runtime", { subject: { ...context().subject, runtimeCapabilityId: "" } }], ["transport", { subject: { ...context().subject, transportCapabilityId: "" } }], ["policy", { subject: { ...context().subject, policyId: "other" } }], ["evidence", { subject: { ...context().subject, evidenceIds: [] } }]];
    for (const [name, override] of cases) assert.equal(createAuthorityVerification(authority, approval, context(override)).verified, false, name);
  });
  test("uses supplied time with inclusive valid-from and exclusive expiry boundaries", () => {
    assert.equal(createAuthorityVerification(authority, approval, context({ validFrom: "2026-07-18T12:00:00.000Z" })).validityVerified, true);
    assert.equal(createAuthorityVerification(authority, approval, context({ validFrom: "2026-07-18T12:00:00.001Z" })).state, "not_verified");
    assert.equal(createAuthorityVerification(authority, approval, context({ expiresAt: "2026-07-18T12:00:00.000Z" })).state, "expired");
  });
  test("rejects declared revocation, supersession, unsupported context, and incomplete revocation data", () => {
    assert.equal(createAuthorityVerification(authority, approval, context({ revokedAt: "2026-07-18T11:00:00.000Z", revocationReason: "withdrawn" })).state, "revoked");
    assert.equal(createAuthorityVerification(authority, approval, context({ revokedAt: "2026-07-18T11:00:00.000Z" })).verified, false);
    assert.equal(createAuthorityVerification(authority, approval, context({ superseded: true })).state, "superseded");
    assert.equal(createAuthorityVerification(authority, approval, context({ supported: false })).state, "unsupported");
  });
});

describe("authority verification isolation", () => {
  for (const file of ["src/authority/verification/types.ts", "src/authority/verification/errors.ts", "src/authority/verification/validation.ts", "src/authority/verification/evaluation.ts", "src/authority/verification/support.ts", "src/authority/verification/index.ts", "src/core/authority-verification.ts"]) test(file, () => {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /Date\.now|new Date\s*\(|performance\.now|process\.env|child_process|node:fs|node:net|\bfetch\s*\(/);
    assert.doesNotMatch(source, /from\s+["'][^"']*\/(cli|commands|loop|runtime|transports|providers|boundary)\//);
    assert.doesNotMatch(source, /\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/);
  });
});
