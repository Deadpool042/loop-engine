import assert from "node:assert/strict";
import { test } from "node:test";

import {
  fingerprintLoopProviderFailoverEvidence,
  generateExecutionReportWithEvidence,
} from "../../src/core/index.js";
import { createLoopApplicationAssembly } from "../../src/composition/application-assembly.js";
import type { LoopProviderFailoverEvidence } from "../../src/loop/provider-failover.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function baseResult(): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-report-1",
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
  });
}

function failoverEvidence(): LoopProviderFailoverEvidence {
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

test("execution report preserves failover evidence with matching fingerprint", () => {
  const evidence = failoverEvidence();
  const report = generateExecutionReportWithEvidence(
    Object.freeze({ ...baseResult(), providerFailoverEvidence: evidence }),
  );

  assert.equal(report.providerFailoverEvidence, evidence);
  assert.deepEqual(
    report.providerFailoverFingerprint,
    fingerprintLoopProviderFailoverEvidence(evidence),
  );
  assert.equal(Object.isFrozen(report), true);
});

test("single-provider report keeps failover fields explicitly null", () => {
  const report = generateExecutionReportWithEvidence(baseResult());
  assert.equal(report.providerFailoverEvidence, null);
  assert.equal(report.providerFailoverFingerprint, null);
});

test("application assembly exposes the evidence-preserving execute facade", () => {
  const application = createLoopApplicationAssembly();
  assert.equal(
    application.runLoopExecute.name,
    "runLoopExecuteWithProviderFailoverEvidence",
  );
});
