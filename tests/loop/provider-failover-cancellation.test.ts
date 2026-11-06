import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runLoopExecuteWithProviderFailoverEvidence } from "../../src/loop/provider-failover-runner.js";
import { createEvidenceAwareProviderFailoverLoopExecutor } from "../../src/loop/provider-failover-evidence-executor.js";
import {
  createProviderFailoverLoopExecutor,
  executeLoopProviderFailover,
} from "../../src/loop/provider-failover.js";
import type { LoopExecutionPlan } from "../../src/loop/execution-plan.js";
import type { LoopExecutor } from "../../src/loop/execution.js";
import { createRunnerFixture } from "./support/runner-fixture.js";

function plan(provider: "openai" | "anthropic"): LoopExecutionPlan {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-failover-cancel",
    provider,
    runtime: provider === "openai" ? "codex" : "claude_code",
    profileId: `${provider}-profile`,
    model: `${provider}-model`,
  }) as LoopExecutionPlan;
}

const recoverableFailure: LoopExecutor = async () => ({
  status: "failed",
  modifiedFiles: [],
  failure: {
    code: "provider_timeout",
    message: "timeout",
    details: ["redacted"],
  },
});

const resetFactory = async () => async (): Promise<void> => undefined;

describe("provider failover — cancellation (L7)", () => {
  it("never falls over to the next provider once the signal is aborted", async () => {
    const controller = new AbortController();
    let secondCalls = 0;
    let resets = 0;
    const outcome = await executeLoopProviderFailover({
      maxAttempts: 2,
      cwd: "/tmp",
      signal: controller.signal,
      createWorkspaceReset: async () => async () => {
        resets += 1;
      },
      attempts: [
        {
          plan: plan("openai"),
          executor: async () => {
            controller.abort();
            return recoverableFailure(plan("openai"), "/tmp");
          },
        },
        {
          plan: plan("anthropic"),
          executor: async () => {
            secondCalls += 1;
            return { status: "completed", modifiedFiles: [], details: [] };
          },
        },
      ],
    });

    assert.equal(outcome.result.status, "failed");
    assert.equal(
      outcome.result.status === "failed" ? outcome.result.failure.code : null,
      "execution_cancelled",
    );
    assert.equal(secondCalls, 0);
    assert.equal(resets, 0);
    assert.deepEqual(outcome.evidence.attemptedProviders, ["openai"]);
  });

  it("starts no attempt at all when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const outcome = await executeLoopProviderFailover({
      maxAttempts: 1,
      cwd: "/tmp",
      signal: controller.signal,
      attempts: [
        {
          plan: plan("openai"),
          executor: async () => {
            calls += 1;
            return { status: "completed", modifiedFiles: [], details: [] };
          },
        },
      ],
    });
    assert.equal(calls, 0);
    assert.equal(
      outcome.result.status === "failed" ? outcome.result.failure.code : null,
      "execution_cancelled",
    );
  });

  it("forwards the signal through createProviderFailoverLoopExecutor to the end-of-chain executor", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const executor = createProviderFailoverLoopExecutor(
      (primary) => [
        {
          plan: primary,
          executor: async (_plan, _cwd, context) => {
            received = context?.signal;
            return { status: "completed", modifiedFiles: [], details: [] };
          },
        },
      ],
      { maxAttempts: 1 },
    );
    await executor(plan("openai"), "/tmp", { signal: controller.signal });
    assert.equal(received, controller.signal);
  });

  it("forwards the signal through the evidence-aware executor to the end-of-chain executor", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const executor = createEvidenceAwareProviderFailoverLoopExecutor(
      (primary) => [
        {
          plan: primary,
          executor: async (_plan, _cwd, context) => {
            received = context?.signal;
            return { status: "completed", modifiedFiles: [], details: [] };
          },
        },
      ],
      { maxAttempts: 1, createWorkspaceReset: resetFactory },
    );
    await executor(plan("openai"), "/tmp", { signal: controller.signal });
    assert.equal(received, controller.signal);
  });

  it("runLoopExecuteWithProviderFailoverEvidence keeps the signal reaching the executor and preserves cancelled", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const fixture = createRunnerFixture();
    const result = await runLoopExecuteWithProviderFailoverEvidence(
      "cancellation-fixture",
      {
        ...fixture.options,
        signal: controller.signal,
        executor: async (_plan, _cwd, context) => {
          received = context?.signal;
          controller.abort();
          return { status: "completed", modifiedFiles: [], details: [] };
        },
      },
    );
    assert.equal(received, controller.signal);
    assert.equal(result.status, "cancelled");
  });
});
