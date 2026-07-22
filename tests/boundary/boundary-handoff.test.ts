import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import {
  ClaudeBoundaryHandoffFixture,
  CodexBoundaryHandoffFixture,
  createBoundaryHandoff,
  listBoundaryHandoffs,
  normalizeBoundaryHandoff,
  OpenClawBoundaryHandoffFixture,
  resolveBoundaryHandoff,
  selectBoundaryHandoff,
  summarizeBoundaryHandoff,
  validateBoundaryHandoff,
} from "../../src/boundary/index.js";
import type { DispatchDescriptorResult } from "../../src/dispatch/index.js";
import {
  createDispatchDescriptor,
  OpenClawDispatchDescriptorFixture,
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

describe("boundary handoff contracts", () => {
  test("keeps missing descriptor pending, denied, and non-executing", () => {
    const result = createBoundaryHandoff(null);

    assert.equal(result.status, "pending");
    assert.equal(result.validation.valid, false);
    assert.equal(result.error?.code, "handoff_missing");
    assert.equal(result.ready, false);
    assert.equal(result.accepted, false);
    assert.equal(result.dispatchable, false);
    assert.equal(result.executable, false);
    assert.equal(result.executionStarted, false);
    assert.equal(result.handoff.ready, false);
    assert.equal(result.handoff.accepted, false);
    assert.equal(result.handoff.dispatchable, false);
    assert.equal(result.handoff.executable, false);
    assert.equal(result.handoff.executionStarted, false);
  });

  test("builds an immutable declarative boundary handoff from a descriptor result", () => {
    const result = createBoundaryHandoff(validDescriptorResult());

    assert.equal(result.status, "validated");
    assert.equal(result.validation.valid, true);
    assert.equal(result.error, undefined);
    assert.equal(result.summary.descriptorReferenced, true);
    assert.equal(result.summary.authorityReferenced, true);
    assert.equal(result.summary.eligibilityReferenced, true);
    assert.equal(result.summary.reviewReferenced, true);
    assert.equal(result.summary.policyReferenced, true);
    assert.equal(result.summary.evidenceComplete, true);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.handoff), true);
    assert.equal(Object.isFrozen(result.handoff.evidence), true);
    assert.equal(Object.isFrozen(result.summary), true);
    assert.equal(Object.isFrozen(result.validation), true);
  });

  test("rejects invalid descriptors, missing configuration, review gaps, and missing authority", () => {
    assert.equal(
      createBoundaryHandoff({
        ...validDescriptorResult(),
        status: "invalid",
        validation: { valid: false, diagnostics: [] },
      }).error?.code,
      "handoff_invalid",
    );
    assert.equal(
      createBoundaryHandoff({
        ...validDescriptorResult(),
        summary: {
          ...validDescriptorResult().summary,
          descriptorComplete: false,
        },
      }).error?.code,
      "handoff_configuration_missing",
    );
    assert.equal(
      createBoundaryHandoff({
        ...validDescriptorResult(),
        summary: {
          ...validDescriptorResult().summary,
          eligibilityConsistent: false,
        },
      }).error?.code,
      "handoff_review_required",
    );
    assert.equal(
      createBoundaryHandoff({
        ...validDescriptorResult(),
        summary: {
          ...validDescriptorResult().summary,
          authorityConsistent: false,
        },
      }).error?.code,
      "handoff_not_authorized",
    );
  });

  test("validates, normalizes, summarizes, and keeps safe diagnostics", () => {
    const result = createBoundaryHandoff(validDescriptorResult());
    const validation = validateBoundaryHandoff(result.handoff);
    const normalized = normalizeBoundaryHandoff(result);
    const summary = summarizeBoundaryHandoff(result);

    assert.equal(validation.valid, true);
    assert.equal(normalized, result);
    assert.deepEqual(summary, result.summary);
    assert.equal(
      createBoundaryHandoff(null).diagnostics[0]?.code,
      "handoff_missing",
    );
    assert.equal(
      createBoundaryHandoff(null).diagnostics[0]?.details.executionStarted,
      undefined,
    );
    assert.equal(createBoundaryHandoff(null).error?.executionStarted, false);
  });

  test("keeps OpenClaw, Claude, and Codex fixtures inactive and non-executing", () => {
    for (const fixture of [
      OpenClawBoundaryHandoffFixture,
      ClaudeBoundaryHandoffFixture,
      CodexBoundaryHandoffFixture,
    ]) {
      assert.equal(fixture.status, "inactive");
      assert.equal(fixture.ready, false);
      assert.equal(fixture.accepted, false);
      assert.equal(fixture.dispatchable, false);
      assert.equal(fixture.executable, false);
      assert.equal(fixture.executionStarted, false);
      assert.equal(Object.isFrozen(fixture), true);
    }
  });

  test("exposes a static deterministic registry and selector", () => {
    const registry = listBoundaryHandoffs();
    assert.deepEqual(
      registry.map((item) => item.id),
      [
        OpenClawBoundaryHandoffFixture.id,
        ClaudeBoundaryHandoffFixture.id,
        CodexBoundaryHandoffFixture.id,
      ],
    );
    assert.equal(Object.isFrozen(registry), true);
    assert.equal(
      selectBoundaryHandoff(OpenClawBoundaryHandoffFixture.id).supported,
      true,
    );
    assert.equal(selectBoundaryHandoff("missing").supported, false);
    assert.equal(
      resolveBoundaryHandoff("missing").diagnostics[0]?.code,
      "handoff_not_supported",
    );
  });
});

describe("boundary handoff architecture invariants", () => {
  const boundaryFiles = [
    "src/boundary/types.ts",
    "src/boundary/errors.ts",
    "src/boundary/registry.ts",
    "src/boundary/selector.ts",
    "src/boundary/validation.ts",
    "src/boundary/handoff.ts",
    "src/boundary/support.ts",
    "src/boundary/index.ts",
    "src/core/boundary.ts",
  ];

  test("exposes a pure builder function", () => {
    const source = readFileSync("src/boundary/handoff.ts", "utf8");
    assert.match(source, /BoundaryHandoffBuilder/);
    assert.match(source, /export const createBoundaryHandoff/);
    assert.doesNotMatch(source, /\bclass\s+/);
    assert.doesNotMatch(source, /new\s+[A-Z]/);
  });

  for (const file of boundaryFiles) {
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

  test("does not reuse dispatch descriptor fixture as a handoff", () => {
    assert.notEqual(
      OpenClawBoundaryHandoffFixture.id,
      OpenClawDispatchDescriptorFixture.id,
    );
  });
});
