import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { OpenClawExecutionAuthorityFixture } from "../../src/dispatch/index.js";
import {
  createOperatorApprovalRFC,
  normalizeOperatorApprovalRFC,
  summarizeOperatorApprovalRFC,
  validateOperatorApprovalRFC,
} from "../../src/authority/rfc/index.js";
import type { OperatorApprovalReview } from "../../src/authority/rfc/index.js";

function review(overrides: Partial<OperatorApprovalReview> = {}): OperatorApprovalReview {
  return {
    state: "under_review",
    previousState: "submitted",
    reviewerId: "operator.local",
    reviewedAt: "2026-07-18T00:00:00.000Z",
    approvalScope: "openclaw.plan",
    approvalVersion: "operator-approval/v1",
    evidenceReferences: ["review.openclaw", "provenance.openclaw"],
    expiryPolicy: "reviewed-explicitly",
    approved: false,
    expired: false,
    revoked: false,
    ...overrides,
  };
}

describe("operator approval RFC contracts", () => {
  test("defaults to draft, denied, and non-started when evidence is missing", () => {
    const result = createOperatorApprovalRFC(null, null);
    assert.equal(result.state, "draft");
    assert.equal(result.error?.code, "operator_approval_missing");
    assert.equal(result.approved, false);
    assert.equal(result.revoked, false);
    assert.equal(result.expired, false);
    assert.equal(result.executionAllowed, false);
    assert.equal(result.executionStarted, false);
  });

  test("builds deeply immutable declarative approval evidence", () => {
    const result = createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review());
    assert.equal(result.validation.valid, true);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.approval), true);
    assert.equal(Object.isFrozen(result.approval.evidence), true);
    assert.equal(Object.isFrozen(result.approval.evidence.references), true);
    assert.equal(Object.isFrozen(result.approval.requirements), true);
    assert.equal(result.executionAllowed, false);
  });

  test("accepts documented lifecycle transitions and explicit approval without authorizing execution", () => {
    for (const item of [
      review({ state: "submitted", previousState: "draft" }),
      review({ state: "under_review", previousState: "submitted" }),
      review({ state: "approved", previousState: "under_review", approved: true }),
      review({ state: "rejected", previousState: "under_review" }),
      review({ state: "superseded", previousState: "approved" }),
    ]) {
      const result = createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, item);
      assert.equal(result.validation.valid, true);
      assert.equal(result.executionAllowed, false);
      assert.equal(result.executionStarted, false);
    }
  });

  test("rejects invalid transitions, expiry, revocation, and incomplete review evidence", () => {
    assert.equal(createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review({ state: "approved", previousState: "draft", approved: true })).error?.code, "operator_approval_transition_invalid");
    assert.equal(createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review({ state: "expired", previousState: "approved", expired: true })).error?.code, "operator_approval_expired");
    assert.equal(createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review({ state: "revoked", previousState: "approved", revoked: true, revocationReason: "scope changed" })).error?.code, "operator_approval_revoked");
    assert.equal(createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review({ evidenceReferences: [] })).error?.code, "operator_approval_evidence_missing");
    assert.equal(createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review({ state: "revoked", previousState: "approved", revoked: true })).error?.code, "operator_approval_review_incomplete");
  });

  test("validates, normalizes, and summarizes deterministically", () => {
    const result = createOperatorApprovalRFC(OpenClawExecutionAuthorityFixture, review());
    assert.equal(validateOperatorApprovalRFC(result.approval).valid, true);
    assert.equal(normalizeOperatorApprovalRFC(result), result);
    assert.deepEqual(summarizeOperatorApprovalRFC(result), result.summary);
    assert.equal(result.summary.transitionValid, true);
    assert.equal(result.summary.executionAllowed, false);
  });
});

describe("operator approval RFC architecture invariants", () => {
  const files = [
    "src/authority/rfc/types.ts",
    "src/authority/rfc/errors.ts",
    "src/authority/rfc/validation.ts",
    "src/authority/rfc/evaluation.ts",
    "src/authority/rfc/support.ts",
    "src/authority/rfc/index.ts",
    "src/core/operator-approval.ts",
  ];

  for (const file of files) {
    test(`${file} stays declarative and isolated`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /RuntimeRequest|TransportRequest|TransportAdapterRequest/);
      assert.doesNotMatch(source, /RuntimeAdapter|TransportAdapter/);
      assert.doesNotMatch(source, /child_process|node:child_process|process\.env/);
      assert.doesNotMatch(source, /\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/);
      assert.doesNotMatch(source, /from\s+["'][^"']*\/(cli|commands|loop|runtime|transports|providers)\//);
    });
  }
});
