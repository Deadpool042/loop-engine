import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  fingerprintLoopExecutionPlanEvidence,
  verifyLoopExecutionReportIntegrity,
} from "../../src/core/index.js";
import type { LoopExecutionPlanEvidence } from "../../src/loop/execution-plan-evidence.js";

function evidence(): LoopExecutionPlanEvidence {
  return {
    schemaVersion: 1,
    provider: "openai",
    runtime: "codex",
    profileId: "codex-medium",
    model: "gpt-5-codex",
    effort: "medium",
    budget: {
      maxTokens: 10_000,
      maxCostUsd: 2,
      maxDurationMs: 300_000,
      maxCalls: 1,
      maxRepairs: 1,
    },
    policy: {
      id: "default-agent-policy",
      mode: "execute",
      requiredCapabilities: ["code_edit", "test_execution"],
      requiredPermissions: ["write_worktree", "shell_exec"],
      rationale: ["safe candidate", "selected deterministic profile"],
    },
  };
}

function report() {
  const executionPlanEvidence = evidence();
  return {
    schemaVersion: 1,
    runId: "run-integrity-1",
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
    agentPolicy: null,
    contextPackage: null,
    executionPlanEvidence,
    executionPlanFingerprint: fingerprintLoopExecutionPlanEvidence(executionPlanEvidence),
  };
}

describe("verifyLoopExecutionReportIntegrity", () => {
  it("accepts a coherent evidence and fingerprint pair", () => {
    const result = verifyLoopExecutionReportIntegrity(report());
    assert.equal(result.status, "accepted");
  });

  it("accepts reports where both evidence fields are absent", () => {
    const value = { ...report(), executionPlanEvidence: null, executionPlanFingerprint: null };
    const result = verifyLoopExecutionReportIntegrity(value);
    assert.equal(result.status, "accepted");
  });

  it("rejects partial evidence pairs", () => {
    const value = { ...report(), executionPlanFingerprint: null };
    const result = verifyLoopExecutionReportIntegrity(value);
    assert.deepEqual(
      result.status === "rejected" ? result.code : null,
      "evidence_pair_mismatch",
    );
  });

  it("rejects malformed evidence before hashing", () => {
    const value = {
      ...report(),
      executionPlanEvidence: { ...evidence(), provider: "unknown-provider" },
    };
    const result = verifyLoopExecutionReportIntegrity(value);
    assert.deepEqual(
      result.status === "rejected" ? result.code : null,
      "invalid_execution_plan_evidence",
    );
  });

  it("rejects evidence drift", () => {
    const value = {
      ...report(),
      executionPlanEvidence: { ...evidence(), model: "different-model" },
    };
    const result = verifyLoopExecutionReportIntegrity(value);
    assert.deepEqual(
      result.status === "rejected" ? result.code : null,
      "execution_plan_fingerprint_mismatch",
    );
  });

  it("rejects unsupported or malformed fingerprints", () => {
    const value = {
      ...report(),
      executionPlanFingerprint: { algorithm: "sha256", value: "not-a-digest" },
    };
    const result = verifyLoopExecutionReportIntegrity(value);
    assert.deepEqual(
      result.status === "rejected" ? result.code : null,
      "invalid_execution_plan_fingerprint",
    );
  });
});
