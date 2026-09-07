import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { buildExecutionStatusReport } from "../../src/composition/execution-status.js";
import { createFileDurableExecutionStore } from "../../src/loop/file-durable-execution-store.js";
import type { DurableExecutionRecord } from "../../src/loop/durable-execution.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function runningRecord(): DurableExecutionRecord {
  return Object.freeze({
    schemaVersion: 1,
    revision: 1,
    idempotencyKey:
      "auto-subscription:creatyss:VNEXT3-G1B3A:" + "a".repeat(40),
    project: "creatyss",
    status: "running",
    attempt: 1,
    leaseOwner: "worker-1",
    leaseExpiresAt: "2026-09-06T22:30:00.000Z",
    cancellationRequested: false,
    createdAt: "2026-09-06T22:00:00.000Z",
    updatedAt: "2026-09-06T22:00:30.000Z",
    progress: Object.freeze({
      status: "executing",
      at: "2026-09-06T22:00:30.000Z",
      runId: "run-active",
      step: "executing",
      executor: Object.freeze({
        profileId: "configured.claude_code.economy",
        provider: "anthropic",
        runtime: "claude_code",
        model: "claude-haiku-4-5",
        effort: "low",
        fundingMode: "included_subscription",
        attempt: 1,
        maxAttempts: 2,
      }),
    }),
    result: null,
    failure: null,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at: "2026-09-06T22:00:00.000Z",
        type: "lease_acquired" as const,
        owner: "worker-1",
      }),
    ]),
  });
}

function failedResult(): LoopRunResult {
  return Object.freeze({
    schemaVersion: 1,
    runId: "run-failed",
    project: "creatyss",
    mode: "publish",
    status: "failed",
    startedAt: "2026-09-06T22:00:00.000Z",
    completedAt: "2026-09-06T22:02:00.000Z",
    candidate: null,
    steps: Object.freeze([
      Object.freeze({
        name: "failed",
        status: "failed" as const,
        startedAt: "2026-09-06T22:02:00.000Z",
        completedAt: "2026-09-06T22:02:00.000Z",
        details: Object.freeze(["Validation failed."]),
      }),
    ]),
    validation: Object.freeze({
      status: "failed" as const,
      attempts: 1,
      repairAttempts: 0,
      commands: Object.freeze(["pnpm run typecheck"]),
      failedCommand: "pnpm run typecheck",
      exitCode: 1,
    }),
    modifiedFiles: Object.freeze(["src/feature.ts"]),
    commit: null,
    publication: null,
    failure: Object.freeze({
      code: "validation_failed",
      message: "Validation failed.",
      details: Object.freeze(["pnpm run typecheck"]),
    }),
    agentPolicy: Object.freeze({
      policyId: "default",
      mode: "execute" as const,
      status: "resolved" as const,
      requirements: Object.freeze({
        category: "code" as const,
        mode: "execute" as const,
        requiredCapabilities: Object.freeze(["code_edit", "shell_exec", "test_execution"] as const),
        requiredPermissions: Object.freeze(["read_only", "write_worktree", "shell_exec"] as const),
        minimumEffort: "medium" as const,
        maximumEffort: "high" as const,
        contextBudget: Object.freeze({
          maxFiles: 8,
          maxCharacters: 60_000,
          maxEstimatedTokens: 15_000,
          includeFullFiles: false,
        }),
        executionBudget: Object.freeze({
          maxTokens: null,
          maxCostUsd: null,
          maxDurationMs: null,
          maxCalls: 2,
          maxRepairs: 1,
        }),
        rationale: Object.freeze(["test"]),
      }),
      selectionRequest: Object.freeze({
        requiredCapabilities: Object.freeze(["code_edit", "shell_exec", "test_execution"] as const),
        requiredPermissions: Object.freeze(["read_only", "shell_exec", "write_worktree"] as const),
        minEffort: "medium" as const,
        maxEffort: "high" as const,
      }),
      selection: Object.freeze({
        outcome: "selected" as const,
        profile: Object.freeze({
          id: "configured.claude_code.standard",
          runtime: "claude_code" as const,
          provider: "anthropic" as const,
          model: "claude-sonnet-5",
          effort: "low" as const,
          fundingMode: "included_subscription" as const,
          capabilities: Object.freeze(["code_edit", "shell_exec", "test_execution"] as const),
          permissions: Object.freeze(["read_only", "write_worktree", "shell_exec"] as const),
          budget: Object.freeze({
            maxTokens: null,
            maxCostUsd: null,
            maxDurationMs: 300_000,
            maxCalls: 1,
            maxRepairs: 1,
          }),
        }),
        rejected: Object.freeze([]),
      }),
      reasons: Object.freeze(["test"]),
      fallback: Object.freeze({ active: false, reason: null }),
    }),
    contextPackage: null,
  });
}

function failedRecord(): DurableExecutionRecord {
  const result = failedResult();
  return Object.freeze({
    schemaVersion: 1,
    revision: 2,
    idempotencyKey:
      "auto-subscription:creatyss:VNEXT3-G1B3A:" + "a".repeat(40),
    project: "creatyss",
    status: "failed",
    attempt: 1,
    leaseOwner: null,
    leaseExpiresAt: null,
    cancellationRequested: false,
    createdAt: "2026-09-06T22:00:00.000Z",
    updatedAt: "2026-09-06T22:02:00.000Z",
    result,
    failure: result.failure,
    events: Object.freeze([
      Object.freeze({
        sequence: 1,
        at: "2026-09-06T22:00:00.000Z",
        type: "lease_acquired" as const,
        owner: "worker-1",
      }),
      Object.freeze({
        sequence: 2,
        at: "2026-09-06T22:02:00.000Z",
        type: "failed" as const,
        owner: "worker-1",
      }),
    ]),
  });
}

test("execution status persists active progress and estimates ETA without inventing usage", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-execution-status-"));
  try {
    const store = createFileDurableExecutionStore({ directory: root });
    assert.equal(await store.save(runningRecord(), null), true);

    const report = await buildExecutionStatusReport(
      "creatyss",
      {
        directory: root,
        nowMs: Date.parse("2026-09-06T22:00:30.000Z"),
        expectedDurationMs: 120_000,
      },
    );

    assert.equal(report.execution?.state, "running");
    assert.equal(report.execution?.candidateId, "VNEXT3-G1B3A");
    assert.equal(report.execution?.progress.status, "executing");
    assert.equal(report.execution?.progress.percent, 25);
    assert.equal(report.execution?.progress.percentSource, "estimate");
    assert.equal(report.execution?.progress.remainingMs, 90_000);
    assert.equal(report.execution?.executor?.runtime, "claude_code");
    assert.equal(report.execution?.executor?.model, "claude-haiku-4-5");
    assert.equal(report.telemetry.tokens.status, "unavailable");
    assert.equal(report.telemetry.costUsd.status, "unavailable");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("execution status exposes a terminal failure instead of making the same candidate look startable", async () => {
  const root = mkdtempSync(join(tmpdir(), "loop-execution-status-"));
  try {
    const store = createFileDurableExecutionStore({ directory: root });
    assert.equal(await store.save(failedRecord(), null), true);

    const report = await buildExecutionStatusReport(
      "creatyss",
      {
        directory: root,
        nowMs: Date.parse("2026-09-06T22:03:00.000Z"),
        expectedDurationMs: 120_000,
      },
    );

    assert.equal(report.execution?.state, "failed");
    assert.equal(report.execution?.progress.percent, 100);
    assert.equal(report.execution?.progress.percentSource, "terminal");
    assert.equal(report.execution?.progress.elapsedMs, 120_000);
    assert.equal(report.execution?.terminal?.failure?.code, "validation_failed");
    assert.equal(report.execution?.terminal?.validation?.failedCommand, "pnpm run typecheck");
    assert.deepEqual(report.execution?.terminal?.modifiedFiles, ["src/feature.ts"]);
    assert.equal(report.execution?.executor?.model, "claude-sonnet-5");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
