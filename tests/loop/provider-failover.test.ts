import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProviderFailoverLoopExecutor,
  executeLoopProviderFailover,
} from "../../src/loop/provider-failover.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
import type { LoopExecutor } from "../../src/loop/execution.js";

function plan(provider: "openai" | "anthropic", model: string): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-failover-1",
    provider,
    runtime: provider === "openai" ? "codex" : "claude_code",
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
  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    attempts: [
      { plan: plan("openai", "gpt-5-codex"), executor: failed("provider_timeout") },
      { plan: plan("anthropic", "claude-sonnet"), executor: completed("src/result.ts") },
    ],
  });

  assert.equal(outcome.result.status, "completed");
  assert.equal(outcome.evidence.selectedProvider, "anthropic");
  assert.deepEqual(outcome.evidence.attemptedProviders, ["openai", "anthropic"]);
  assert.deepEqual(
    outcome.evidence.attempts.map((attempt) => [attempt.provider, attempt.status, attempt.recoverable]),
    [
      ["openai", "failed", true],
      ["anthropic", "completed", false],
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
      { plan: plan("openai", "gpt-5-codex"), executor: failed("policy_rejected") },
      { plan: plan("anthropic", "claude-sonnet"), executor: fallback },
    ],
  });

  assert.equal(outcome.result.status, "failed");
  assert.equal(fallbackCalls, 0);
  assert.equal(outcome.evidence.attempts.length, 1);
  assert.equal(outcome.evidence.attempts[0]?.recoverable, false);
});

test("enforces the global attempt budget", async () => {
  let fallbackCalls = 0;
  const fallback: LoopExecutor = async () => {
    fallbackCalls += 1;
    return completed("fallback.ts")({} as LoopExecutionPlan);
  };

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 1,
    attempts: [
      { plan: plan("openai", "a"), executor: failed("provider_timeout") },
      { plan: plan("anthropic", "b"), executor: fallback },
    ],
  });

  assert.equal(outcome.result.status, "failed");
  assert.equal(fallbackCalls, 0);
  assert.equal(outcome.evidence.attempts.length, 1);
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
      { plan: plan("openai", "a"), executor },
      { plan: plan("openai", "b"), executor },
    ],
  });

  assert.equal(outcome.result.status, "failed");
  assert.equal(calls, 0);
  if (outcome.result.status === "failed") {
    assert.equal(outcome.result.failure.code, "provider_attempt_duplicate");
  }
});

test("redacts thrown provider errors and permits reviewed recovery", async () => {
  const throwing: LoopExecutor = async () => {
    throw new Error("secret provider diagnostic");
  };

  const outcome = await executeLoopProviderFailover({
    maxAttempts: 2,
    isRecoverableFailure: (failure) => failure.code === "provider_executor_exception",
    attempts: [
      { plan: plan("openai", "a"), executor: throwing },
      { plan: plan("anthropic", "b"), executor: completed("safe.ts") },
    ],
  });

  assert.equal(outcome.result.status, "completed");
  assert.equal(JSON.stringify(outcome).includes("secret provider diagnostic"), false);
});

test("LoopExecutor facade preserves the admitted primary plan as attempt one", async () => {
  const primary = plan("openai", "a");
  const replacement = plan("openai", "b");
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
    attempts: [{ plan: plan("openai", "a"), executor: completed("file.ts") }],
  });

  assert.equal(Object.isFrozen(outcome), true);
  assert.equal(Object.isFrozen(outcome.evidence), true);
  assert.equal(Object.isFrozen(outcome.evidence.attempts), true);
  assert.equal(Object.isFrozen(outcome.evidence.attempts[0]), true);
});
