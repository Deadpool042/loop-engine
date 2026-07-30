import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canonicalizeLoopProviderFailoverEvidence,
  createEvidenceAwareProviderFailoverLoopExecutor,
  fingerprintLoopProviderFailoverEvidence,
  verifyLoopProviderFailoverEvidenceFingerprint,
} from "../../src/core/index.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
import type { LoopExecutor } from "../../src/loop/execution.js";
import type { LoopProviderFailoverEvidence } from "../../src/loop/provider-failover.js";

function plan(provider: "openai" | "anthropic", model: string): LoopExecutionPlan {
  return Object.freeze({
    provider,
    runtime: provider === "openai" ? "codex" : "claude_code",
    profileId: `${provider}.profile`,
    model,
  }) as LoopExecutionPlan;
}

const recoverableFailure: LoopExecutor = async () =>
  Object.freeze({
    status: "failed" as const,
    modifiedFiles: Object.freeze([]),
    failure: Object.freeze({
      code: "provider_timeout",
      message: "Provider timed out.",
      details: Object.freeze(["bounded"]),
    }),
  });

const completed: LoopExecutor = async () =>
  Object.freeze({
    status: "completed" as const,
    modifiedFiles: Object.freeze(["src/result.ts"]),
    details: Object.freeze(["completed"]),
  });

test("evidence-aware executor preserves bounded failover evidence", async () => {
  const primary = plan("openai", "gpt-test");
  const fallback = plan("anthropic", "claude-test");
  const executor = createEvidenceAwareProviderFailoverLoopExecutor(
    () => [
      { plan: primary, executor: recoverableFailure },
      { plan: fallback, executor: completed },
    ],
    { maxAttempts: 2 },
  );

  const result = await executor(primary);
  assert.equal(result.status, "completed");
  assert.equal(result.providerFailoverEvidence?.selectedProvider, "anthropic");
  assert.deepEqual(result.providerFailoverEvidence?.attemptedProviders, [
    "openai",
    "anthropic",
  ]);
  assert.equal(Object.isFrozen(result.providerFailoverEvidence), true);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("canonical fingerprint detects failover evidence drift", () => {
  const evidence: LoopProviderFailoverEvidence = Object.freeze({
    schemaVersion: 1,
    maxAttempts: 2,
    attemptedProviders: Object.freeze(["openai", "anthropic"]),
    selectedProvider: "anthropic",
    attempts: Object.freeze([
      Object.freeze({
        attempt: 1,
        provider: "openai",
        runtime: "codex",
        profileId: "openai.profile",
        model: "gpt-test",
        status: "failed",
        failureCode: "provider_timeout",
        recoverable: true,
      }),
      Object.freeze({
        attempt: 2,
        provider: "anthropic",
        runtime: "claude_code",
        profileId: "anthropic.profile",
        model: "claude-test",
        status: "completed",
        failureCode: null,
        recoverable: false,
      }),
    ]),
  });

  const canonical = canonicalizeLoopProviderFailoverEvidence(evidence);
  const fingerprint = fingerprintLoopProviderFailoverEvidence(evidence);
  assert.equal(canonical, canonicalizeLoopProviderFailoverEvidence(evidence));
  assert.equal(verifyLoopProviderFailoverEvidenceFingerprint(evidence, fingerprint), true);

  const drifted = Object.freeze({ ...evidence, selectedProvider: "openai" });
  assert.equal(verifyLoopProviderFailoverEvidenceFingerprint(drifted, fingerprint), false);
  assert.equal(Object.isFrozen(fingerprint), true);
});
