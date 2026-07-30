import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fingerprintLoopProviderFailoverEvidence,
  importTrustedLoopExecutionReport,
  parseTrustedLoopExecutionReport,
  type LoopProviderFailoverEvidence,
  type LoopRunResult,
} from "../../src/core/index.js";

function evidence(): LoopProviderFailoverEvidence {
  return Object.freeze({
    schemaVersion: 1,
    maxAttempts: 2,
    attemptedProviders: Object.freeze(["openai", "anthropic"]),
    selectedProvider: "anthropic",
    attempts: Object.freeze([
      Object.freeze({
        attempt: 1,
        provider: "openai",
        runtime: "codex",
        profileId: "openai.primary",
        model: "gpt-test",
        status: "failed",
        failureCode: "provider_timeout",
        recoverable: true,
      }),
      Object.freeze({
        attempt: 2,
        provider: "anthropic",
        runtime: "claude_code",
        profileId: "anthropic.fallback",
        model: "claude-test",
        status: "completed",
        failureCode: null,
        recoverable: false,
      }),
    ]),
  });
}

function report(): LoopRunResult {
  const providerFailoverEvidence = evidence();
  return Object.freeze({
    schemaVersion: 1,
    runId: "trusted-failover-1",
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: "2026-07-31T00:00:00.000Z",
    completedAt: "2026-07-31T00:00:01.000Z",
    candidate: null,
    steps: Object.freeze([]),
    validation: null,
    modifiedFiles: Object.freeze(["src/result.ts"]),
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    executionPlanEvidence: null,
    executionPlanFingerprint: null,
    providerFailoverEvidence,
    providerFailoverFingerprint:
      fingerprintLoopProviderFailoverEvidence(providerFailoverEvidence),
  });
}

test("trusted boundary accepts a coherent provider failover report", () => {
  const result = importTrustedLoopExecutionReport(report());
  assert.equal(result.status, "accepted");
});

test("trusted boundary rejects a partial provider failover pair", () => {
  const value = { ...report(), providerFailoverFingerprint: null };
  const result = importTrustedLoopExecutionReport(value);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "provider_failover_evidence_pair_mismatch");
  }
});

test("trusted boundary rejects cryptographic drift", () => {
  const original = report();
  const driftedEvidence = {
    ...original.providerFailoverEvidence,
    selectedProvider: "openai",
  };
  const result = importTrustedLoopExecutionReport({
    ...original,
    providerFailoverEvidence: driftedEvidence,
  });
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "provider_failover_semantic_mismatch");
  }
});

test("trusted boundary rejects impossible attempt ordering", () => {
  const original = report();
  const attempts = [...(original.providerFailoverEvidence?.attempts ?? [])];
  attempts[0] = Object.freeze({ ...attempts[0]!, recoverable: false });
  const invalidEvidence = Object.freeze({
    ...original.providerFailoverEvidence!,
    attempts: Object.freeze(attempts),
  });
  const result = importTrustedLoopExecutionReport({
    ...original,
    providerFailoverEvidence: invalidEvidence,
    providerFailoverFingerprint: fingerprintLoopProviderFailoverEvidence(invalidEvidence),
  });
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.code, "provider_failover_semantic_mismatch");
  }
});

test("serialized import applies the same fail-closed boundary", () => {
  const result = parseTrustedLoopExecutionReport(JSON.stringify(report()));
  assert.equal(result.status, "accepted");
});
