import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import {
  createDispatchDescriptor,
  normalizeDispatchDescriptor,
  OpenClawDispatchDescriptorFixture,
  OpenClawExecutionAuthorityFixture,
  summarizeDispatchDescriptor,
  validateDispatchDescriptor,
} from "../../src/dispatch/index.js";
import type {
  DispatchDescriptor,
  ExecutionAuthority,
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

function grantedAuthority(): ExecutionAuthority {
  const evidence = OpenClawHandoffEligibilityFixture.evidence;
  return {
    ...OpenClawExecutionAuthorityFixture,
    status: "granted",
    eligibilityId: OpenClawHandoffEligibilityFixture.id,
    reviewedRequestId: evidence.reviewedRequestId,
    reviewId: evidence.reviewId,
    provenanceId: evidence.provenanceId,
    policyVersion: evidence.policyVersion,
    configurationVersion: evidence.configurationVersion,
    mappingVersion: evidence.mappingVersion,
    protocolVersion: evidence.protocolVersion,
    runtimeContractVersion: evidence.runtimeContractVersion,
    transportContractVersion: evidence.transportContractVersion,
    approved: true,
    revoked: false,
    expired: false,
  };
}

describe("dispatch descriptor contracts", () => {
  test("keeps missing evidence pending, denied, and non-executing", () => {
    const result = createDispatchDescriptor(null, null);

    assert.equal(result.status, "pending");
    assert.equal(result.validation.valid, false);
    assert.equal(result.error?.code, "dispatch_eligibility_missing");
    assert.equal(result.readyForBoundary, false);
    assert.equal(result.dispatchable, false);
    assert.equal(result.executable, false);
    assert.equal(result.executionStarted, false);
    assert.equal(result.descriptor.readyForBoundary, false);
    assert.equal(result.descriptor.dispatchable, false);
    assert.equal(result.descriptor.executable, false);
    assert.equal(result.descriptor.executionStarted, false);
  });

  test("builds an immutable transport-independent descriptor from explicit evidence", () => {
    const result = createDispatchDescriptor(
      eligibleResult(),
      grantedAuthority(),
    );

    assert.equal(result.status, "validated");
    assert.equal(result.validation.valid, true);
    assert.equal(result.error, undefined);
    assert.equal(result.summary.eligibilityConsistent, true);
    assert.equal(result.summary.authorityConsistent, true);
    assert.equal(result.summary.referencesConsistent, true);
    assert.equal(result.summary.versionsConsistent, true);
    assert.equal(result.summary.readyForBoundary, false);
    assert.equal(result.summary.dispatchable, false);
    assert.equal(result.summary.executable, false);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.descriptor), true);
    assert.equal(Object.isFrozen(result.descriptor.evidence), true);
    assert.equal(Object.isFrozen(result.summary), true);
    assert.equal(Object.isFrozen(result.validation), true);
    assert.equal(Object.isFrozen(result.metadata), true);
  });

  test("rejects absent, invalid, revoked, mismatched, and stale authority deterministically", () => {
    const eligible = eligibleResult();

    assert.equal(
      createDispatchDescriptor(eligible, null).error?.code,
      "dispatch_authority_missing",
    );
    assert.equal(
      createDispatchDescriptor(
        {
          ...eligible,
          decision: "not_eligible",
          validation: {
            valid: false,
            diagnostics: [],
          },
        },
        grantedAuthority(),
      ).error?.code,
      "dispatch_eligibility_invalid",
    );
    assert.equal(
      createDispatchDescriptor(eligible, {
        ...grantedAuthority(),
        revoked: true,
      }).error?.code,
      "dispatch_authority_not_granted",
    );
    assert.equal(
      createDispatchDescriptor(eligible, {
        ...grantedAuthority(),
        reviewId: "different-review",
      }).error?.code,
      "dispatch_reference_mismatch",
    );
    assert.equal(
      createDispatchDescriptor(eligible, {
        ...grantedAuthority(),
        policyVersion: "stale-policy",
      }).error?.code,
      "dispatch_version_mismatch",
    );
  });

  test("validates, normalizes, and summarizes descriptors without changing behavior", () => {
    const result = createDispatchDescriptor(
      eligibleResult(),
      grantedAuthority(),
    );
    const validation = validateDispatchDescriptor(result.descriptor);
    const normalized = normalizeDispatchDescriptor(result);
    const summary = summarizeDispatchDescriptor(result);

    assert.equal(validation.valid, true);
    assert.equal(normalized, result);
    assert.deepEqual(summary, result.summary);

    const incomplete = {
      ...result.descriptor,
      evidence: { ...result.descriptor.evidence, authorityId: "" },
    } as DispatchDescriptor;
    assert.equal(
      validateDispatchDescriptor(incomplete).error?.code,
      "dispatch_descriptor_incomplete",
    );
  });

  test("keeps the OpenClaw fixtures inactive and not executable", () => {
    assert.equal(OpenClawExecutionAuthorityFixture.status, "pending");
    assert.equal(OpenClawExecutionAuthorityFixture.approved, false);
    assert.equal(OpenClawExecutionAuthorityFixture.executionStarted, false);
    assert.equal(OpenClawDispatchDescriptorFixture.status, "pending");
    assert.equal(OpenClawDispatchDescriptorFixture.readyForBoundary, false);
    assert.equal(OpenClawDispatchDescriptorFixture.dispatchable, false);
    assert.equal(OpenClawDispatchDescriptorFixture.executable, false);
    assert.equal(OpenClawDispatchDescriptorFixture.executionStarted, false);
    assert.equal(Object.isFrozen(OpenClawDispatchDescriptorFixture), true);
  });
});

describe("dispatch descriptor architecture invariants", () => {
  const dispatchFiles = [
    "src/dispatch/types.ts",
    "src/dispatch/errors.ts",
    "src/dispatch/validation.ts",
    "src/dispatch/descriptor.ts",
    "src/dispatch/support.ts",
    "src/dispatch/index.ts",
    "src/core/dispatch.ts",
  ];

  test("exposes one pure builder function", () => {
    const source = readFileSync("src/dispatch/descriptor.ts", "utf8");
    assert.match(source, /DispatchDescriptorBuilder/);
    assert.match(source, /export const createDispatchDescriptor/);
    assert.doesNotMatch(source, /\bclass\s+/);
    assert.doesNotMatch(source, /new\s+[A-Z]/);
  });

  for (const file of dispatchFiles) {
    test(`${file} has no Runtime, Transport, process, command, or execution coupling`, () => {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /RuntimeAdapter/);
      assert.doesNotMatch(source, /TransportAdapter/);
      assert.doesNotMatch(source, /TransportAdapterRequest/);
      assert.doesNotMatch(source, /RuntimeRequest/);
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
