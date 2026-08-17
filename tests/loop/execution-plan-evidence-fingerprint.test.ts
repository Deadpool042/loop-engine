import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalizeLoopExecutionPlanEvidence,
  fingerprintLoopExecutionPlanEvidence,
  verifyLoopExecutionPlanEvidenceFingerprint,
} from "../../src/loop/execution-plan-evidence-fingerprint.js";
import type { LoopExecutionPlanEvidence } from "../../src/loop/execution-plan-evidence.js";
import { generateExecutionReportWithEvidence } from "../../src/core/loop-execution-plan-evidence-report.js";

function evidence(): LoopExecutionPlanEvidence {
  return {
    schemaVersion: 1,
    provider: "openai",
    runtime: "codex",
    profileId: "codex-medium",
    model: "gpt-5.6-terra",
    effort: "medium",
    budget: { maxInputTokens: 10_000, maxOutputTokens: 4_000 },
    policy: {
      id: "default-agent-policy",
      mode: "execute",
      requiredCapabilities: ["tests", "code"],
      requiredPermissions: ["workspace_write"],
      rationale: ["safe candidate", "selected deterministic profile"],
    },
  } as LoopExecutionPlanEvidence;
}

test("fingerprints canonical evidence deterministically", () => {
  const first = evidence();
  const reordered = {
    ...first,
    policy: {
      ...first.policy,
      requiredCapabilities: ["code", "tests"],
    },
  } as LoopExecutionPlanEvidence;

  assert.equal(
    canonicalizeLoopExecutionPlanEvidence(first),
    canonicalizeLoopExecutionPlanEvidence(reordered),
  );
  const fingerprint = fingerprintLoopExecutionPlanEvidence(first);
  assert.equal(fingerprint.algorithm, "sha256");
  assert.match(fingerprint.value, /^[a-f0-9]{64}$/);
  assert.equal(
    fingerprint.value,
    fingerprintLoopExecutionPlanEvidence(reordered).value,
  );
  assert.equal(
    verifyLoopExecutionPlanEvidenceFingerprint(first, fingerprint),
    true,
  );
});

test("detects evidence drift", () => {
  const original = evidence();
  const fingerprint = fingerprintLoopExecutionPlanEvidence(original);
  const changed = { ...original, model: "different-model" };

  assert.equal(
    verifyLoopExecutionPlanEvidenceFingerprint(changed, fingerprint),
    false,
  );
});

test("detects writable file scope drift", () => {
  const original = { ...evidence(), allowedPaths: ["docs/platform/**"] };
  const fingerprint = fingerprintLoopExecutionPlanEvidence(original);
  assert.equal(
    verifyLoopExecutionPlanEvidenceFingerprint(
      { ...original, allowedPaths: ["docs/roadmap/**"] },
      fingerprint,
    ),
    false,
  );
});

test("execution report emits evidence and matching fingerprint together", () => {
  const policy = {
    status: "resolved",
    policyId: "default-agent-policy",
    mode: "execute",
    reasons: ["selected deterministic profile"],
    requirements: {
      requiredCapabilities: ["code"],
      requiredPermissions: ["workspace_write"],
      rationale: ["safe candidate"],
    },
    selection: {
      outcome: "selected",
      profile: {
        id: "codex-medium",
        provider: "openai",
        runtime: "codex",
        model: "gpt-5.6-terra",
        effort: "medium",
        budget: { maxInputTokens: 10_000, maxOutputTokens: 4_000 },
      },
      rejected: [],
    },
  } as any;
  const report = generateExecutionReportWithEvidence({
    schemaVersion: 1,
    runId: "run-1",
    project: "fixture",
    mode: "execute",
    status: "completed",
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: policy,
    contextPackage: null,
  });

  assert.ok(report.executionPlanEvidence);
  assert.ok(report.executionPlanFingerprint);
  assert.equal(
    verifyLoopExecutionPlanEvidenceFingerprint(
      report.executionPlanEvidence,
      report.executionPlanFingerprint,
    ),
    true,
  );
});
