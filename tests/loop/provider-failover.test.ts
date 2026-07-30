import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProviderFailoverLoopExecutor,
  executeLoopProviderFailover,
} from "../../src/loop/provider-failover.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
import type { LoopExecutor } from "../../src/loop/execution.js";

function plan(provider: "codex" | "claude-code", model: string): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-failover-1",
    provider,
    runtime: provider === "codex" ? "codex-cli" : "claude-code-cli",
    profileId: `${provider}-profile`,
    model,
  }) as LoopExecutionPlan;
}

function failed(code: string): LoopExecutor {
  return async () =>
    Object.freeze({
      status: "failed" as const,
      modifiedFiles: Object.freeze([]),
      failure: Object.freeze({
        code,
        message: `Failure: ${code}`,
        details: Object.freeze(["redacted"]),
      }),
    });
}

function completed(file: string): LoopExecutor {
  return async () =>
    Object.freeze({
      status: "completed" as const,
      modifiedFiles: Object.freeze([file]),
      details: Object.freeze(["completed"]),
    });
}

test("falls back after a recoverable provider failure", async () => {
  const primary = plan("codex", "gpt-5-codex");
  const fallback = plan("claude-code", "claude-sonnet");

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    attempts: [
      { plan: primary, executor: failed("provider_timeout") },
      { plan: fallback, executor: completed("src/result.ts") },
    ],
  });

  assert.equal(outcome.result.status, "completed");
  assert.equal(outcome.evidence.selectedProvider, "claude-code");
  assert.deepEqual(outcome.evidence.attemptedProviders, ["codex", "claude-code"]);
  assert.deepEqual(
    outcome.evidence.attempts.map((attempt) => [
      attempt.provider,
      attempt.status,
      attempt.recoverable,
    ]),
    [
      ["codex", "failed", true],
      ["claude-code", "completed", false],
    ],
  );
});

test("stops immediately on a terminal provider failure", async () => {
  let fallbackCalls = 0;
  const fallback: LoopExecutor = async () => {
    fallbackCalls += 1;
    return completed("never.ts")({} as LoopExecutionPlan);
  };

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    attempts: [
      { plan: plan("codex", "gpt-5-codex"), executor: failed("policy_rejected") },
      { plan: plan("claude-code", "claude-sonnet"), executor: fallback },
    ],
  });

  assert.equal(outcome.result.status, "failed");
  assert.equal(fallbackCalls, 0);
  assert.equal(outcome.evidence.attempts.length, 1);
  assert.equal(outcome.evidence.attempts[0].recoverable, false);
});

test("enforces the global attempt budget", async () => {
  let thirdCalls = 0;
  const third: LoopExecutor = async () => {
    thirdCalls += 1;
    return completed("third.ts")({} as LoopExecutionPlan);
  };

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    attempts: [
      { plan: plan("codex", "a"), executor: failed("provider_timeout") },
      { plan: plan("claude-code", "b"), executor: failed("provider_unavailable") },
      { plan: plan("codex", "c"), executor: third },
    ],
  });

  assert.equal(outcome.result.status, "failed");
  assert.equal(thirdCalls, 0);
  assert.equal(outcome.evidence.attempts.length, 0);
  if (outcome.result.status === "failed") {
    assert.equal(outcome.result.failure.code, "provider_attempt_duplicate");
  }
});

test("rejects duplicate providers before any effect", async () => {
  let calls = 0;
  const executor: LoopExecutor = async () => {
    calls += 1;
    return completed("file.ts")({} as LoopExecutionPlan);
  };

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    attempts: [
      { plan: plan("codex", "a"), executor },
      { plan: plan("codex", "b"), executor },
    ],
  });

  assert.equal(outcome.result.status, "failed");
  assert.equal(calls, 0);
  if (outcome.result.status === "failed") {
    assert.equal(outcome.result.failure.code, "provider_attempt_duplicate");
  }
});

test("redacts thrown provider errors and may recover through an explicit classifier", async () => {
  const throwing: LoopExecutor = async () => {
    throw new Error("secret provider diagnostic");
  };

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    isRecoverableFailure: (failure) =>
      failure.code === "provider_executor_exception",
    attempts: [
      { plan: plan("codex", "a"), executor: throwing },
      { plan: plan("claude-code", "b"), executor: completed("safe.ts") },
    ],
  });

  assert.equal(outcome.result.status, "completed");
  assert.equal(JSON.stringify(outcome).includes("secret provider diagnostic"), false);
});

test("LoopExecutor facade preserves the admitted primary plan as attempt one", async () => {
  const primary = plan("codex", "a");
  const replacement = plan("codex", "b");
  const executor = createProviderFailoverLoopExecutor(
    () => [{ plan: replacement, executor: completed("file.ts") }],
    { maxAttempts: 1 },
  );

  const result = await executor(primary);
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.failure.code, "provider_primary_plan_mismatch");
  }
});

test("freezes bounded public evidence", async () => {
  const outcome = await executeLoopProviderFailover({
    maxAttempts: 1,
    attempts: [
      { plan: plan("codex", "a"), executor: completed("file.ts") },
    ],
  });

  assert.equal(Object.isFrozen(outcome), true);
  assert.equal(Object.isFrozen(outcome.evidence), true);
  assert.equal(Object.isFrozen(outcome.evidence.attempts), true);
  assert.equal(Object.isFrozen(outcome.evidence.attempts[0]), true);
});
