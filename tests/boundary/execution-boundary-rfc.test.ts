import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import {
  createBoundaryHandoff,
  OpenClawBoundaryHandoffFixture,
} from "../../src/boundary/index.js";
import {
  createExecutionBoundaryRFC,
  EXECUTION_BOUNDARY_INVARIANT_FAMILIES,
  normalizeExecutionBoundaryRFC,
  summarizeExecutionBoundaryRFC,
  validateExecutionBoundaryRFC,
} from "../../src/boundary/rfc/index.js";
import type { DispatchDescriptorResult } from "../../src/dispatch/index.js";
import {
  createDispatchDescriptor,
  OpenClawExecutionAuthorityFixture,
} from "../../src/dispatch/index.js";
import type { HandoffEligibilityResult } from "../../src/handoff-eligibility/index.js";
import { OpenClawHandoffEligibilityFixture } from "../../src/handoff-eligibility/index.js";

function eligibleResult(): HandoffEligibilityResult {
  const eligibility = {
    ...OpenClawHandoffEligibilityFixture,
    status: "evaluated",
    decision: "eligible",
    reason: "requirements_satisfied",
    requirements: OpenClawHandoffEligibilityFixture.requirements.map(
      (item) => ({
        ...item,
        outcome: "pass",
        reason: "requirements_satisfied",
      }),
    ),
  } as const;
  return {
    status: "evaluated",
    decision: "eligible",
    eligibility,
    summary: {
      totalRequirements: eligibility.requirements.length,
      passedRequirements: eligibility.requirements.length,
      failedRequirements: 0,
      unknownRequirements: 0,
      reviewPresent: true,
      provenancePresent: true,
      approvalExplicit: true,
      versionsConsistent: true,
      requestNonExecutable: true,
      adapterRequestAbsent: true,
      defaultDenied: true,
      handoffAllowed: false,
      dispatchable: false,
      executable: false,
    },
    validation: { valid: true, diagnostics: [] },
    diagnostics: [],
    metadata: { fixture: "eligible-handoff-result" },
    handoffAllowed: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  };
}

function validDescriptorResult(): DispatchDescriptorResult {
  const authority = {
    ...OpenClawExecutionAuthorityFixture,
    status: "granted",
    eligibilityId: OpenClawHandoffEligibilityFixture.id,
    approved: true,
  } as const;
  return createDispatchDescriptor(eligibleResult(), authority);
}

describe("execution boundary RFC contracts", () => {
  test("keeps missing handoff pending, denied, and non-executing", () => {
    const result = createExecutionBoundaryRFC(null);

    assert.equal(result.status, "pending");
    assert.equal(result.validation.valid, false);
    assert.equal(result.error?.code, "boundary_missing");
    assert.equal(result.boundarySatisfied, false);
    assert.equal(result.crossingAllowed, false);
    assert.equal(result.dispatchable, false);
    assert.equal(result.executable, false);
    assert.equal(result.executionStarted, false);
    assert.equal(result.rfc.boundarySatisfied, false);
    assert.equal(result.rfc.crossingAllowed, false);
    assert.equal(result.rfc.dispatchable, false);
    assert.equal(result.rfc.executable, false);
    assert.equal(result.rfc.executionStarted, false);
  });

  test("builds immutable invariant evidence from a valid boundary handoff", () => {
    const result = createExecutionBoundaryRFC(
      createBoundaryHandoff(validDescriptorResult()),
    );

    assert.equal(result.status, "evaluated");
    assert.equal(result.validation.valid, true);
    assert.equal(result.error, undefined);
    assert.deepEqual(
      result.rfc.invariants.map((item) => item.family),
      [...EXECUTION_BOUNDARY_INVARIANT_FAMILIES],
    );
    assert.equal(result.summary.totalInvariants, 10);
    assert.equal(result.summary.failedInvariants, 0);
    assert.equal(result.summary.unknownRequirements, 0);
    assert.equal(result.summary.authoritySatisfied, true);
    assert.equal(result.summary.eligibilitySatisfied, true);
    assert.equal(result.summary.descriptorSatisfied, true);
    assert.equal(result.summary.boundarySatisfied, false);
    assert.equal(result.summary.crossingAllowed, false);
    assert.equal(result.summary.dispatchable, false);
    assert.equal(result.summary.executable, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.rfc), true);
    assert.equal(Object.isFrozen(result.rfc.invariants), true);
    assert.equal(Object.isFrozen(result.rfc.invariants[0]?.requirements), true);
    assert.equal(Object.isFrozen(result.evaluation), true);
    assert.equal(Object.isFrozen(result.summary), true);
  });

  test("rejects invalid handoff, missing evidence, missing review, missing policy, and missing configuration", () => {
    const base = createBoundaryHandoff(validDescriptorResult());

    assert.equal(
      createExecutionBoundaryRFC({
        ...base,
        status: "invalid",
        validation: { valid: false, diagnostics: [] },
      }).error?.code,
      "boundary_invalid",
    );
    assert.equal(
      createExecutionBoundaryRFC({
        ...base,
        summary: { ...base.summary, evidenceComplete: false },
      }).error?.code,
      "boundary_evidence_missing",
    );
    assert.equal(
      createExecutionBoundaryRFC({
        ...base,
        summary: { ...base.summary, reviewReferenced: false },
      }).error?.code,
      "boundary_review_required",
    );
    assert.equal(
      createExecutionBoundaryRFC({
        ...base,
        summary: { ...base.summary, policyReferenced: false },
      }).error?.code,
      "boundary_policy_denied",
    );
    assert.equal(
      createExecutionBoundaryRFC({
        ...base,
        metadata: {},
      }).error?.code,
      "boundary_configuration_missing",
    );
  });

  test("validates, normalizes, summarizes, and keeps stable diagnostics", () => {
    const result = createExecutionBoundaryRFC(
      createBoundaryHandoff(validDescriptorResult()),
    );
    const validation = validateExecutionBoundaryRFC(result.rfc);
    const normalized = normalizeExecutionBoundaryRFC(result);
    const summary = summarizeExecutionBoundaryRFC(result);

    assert.equal(validation.valid, true);
    assert.equal(normalized, result);
    assert.deepEqual(summary, result.summary);
    assert.equal(
      createExecutionBoundaryRFC(null).diagnostics[0]?.code,
      "boundary_missing",
    );
    assert.equal(
      createExecutionBoundaryRFC(null).diagnostics[0]?.details.executionStarted,
      undefined,
    );
    assert.equal(createExecutionBoundaryRFC(null).error?.executionStarted, false);
  });

  test("keeps the OpenClaw fixture reference-only and non-executing", () => {
    const result = createExecutionBoundaryRFC({
      status: "validated",
      handoff: OpenClawBoundaryHandoffFixture,
      summary: {
        descriptorReferenced: true,
        authorityReferenced: true,
        eligibilityReferenced: true,
        reviewReferenced: true,
        policyReferenced: true,
        evidenceComplete: true,
        diagnosticsCount: 0,
        ready: false,
        accepted: false,
        dispatchable: false,
        executable: false,
      },
      validation: { valid: true, diagnostics: [] },
      diagnostics: [],
      metadata: { fixture: "openclaw-boundary-rfc" },
      ready: false,
      accepted: false,
      dispatchable: false,
      executable: false,
      executionStarted: false,
    });

    assert.equal(result.rfc.evidence.runtimeContractVersion, "openclaw/v1");
    assert.equal(result.boundarySatisfied, false);
    assert.equal(result.crossingAllowed, false);
    assert.equal(result.dispatchable, false);
    assert.equal(result.executable, false);
    assert.equal(result.executionStarted, false);
  });
});

describe("execution boundary RFC architecture invariants", () => {
  const boundaryRfcFiles = [
    "src/boundary/rfc/types.ts",
    "src/boundary/rfc/errors.ts",
    "src/boundary/rfc/validation.ts",
    "src/boundary/rfc/evaluation.ts",
    "src/boundary/rfc/support.ts",
    "src/boundary/rfc/index.ts",
    "src/core/boundary-rfc.ts",
  ];

  test("exposes a pure builder function", () => {
    const source = readFileSync("src/boundary/rfc/evaluation.ts", "utf8");
    assert.match(source, /ExecutionBoundaryBuilder/);
    assert.match(source, /export const createExecutionBoundaryRFC/);
    assert.doesNotMatch(source, /\bclass\s+/);
    assert.doesNotMatch(source, /new\s+[A-Z]/);
  });

  for (const file of boundaryRfcFiles) {
    test(`${file} has no execution, request, Runtime, Transport, or process coupling`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /RuntimeRequest/);
      assert.doesNotMatch(source, /TransportRequest/);
      assert.doesNotMatch(source, /TransportAdapterRequest/);
      assert.doesNotMatch(source, /RuntimeAdapter/);
      assert.doesNotMatch(source, /TransportAdapter/);
      assert.doesNotMatch(source, /child_process|node:child_process/);
      assert.doesNotMatch(
        source,
        /\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/,
      );
      assert.doesNotMatch(source, /process\.env/);
      assert.doesNotMatch(
        source,
        /\bcommand\s*:|\bcommands\s*:|\bargs\s*:|\barguments\s*:/,
      );
      assert.doesNotMatch(source, /from\s+["'][^"']*\/(cli|commands|loop)\//);
      assert.doesNotMatch(
        source,
        /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
      );
      assert.doesNotMatch(
        source,
        /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
      );
    });
  }
});
