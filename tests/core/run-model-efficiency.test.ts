import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRunModelEfficiencyReport,
  projectRunModelObservation,
  type LoopRunHistoryReport,
} from "../../src/core/index.js";
import type { LoopExecutionPlanEvidence } from "../../src/loop/execution-plan-evidence.js";
import type { LoopProviderFailoverEvidence } from "../../src/loop/provider-failover.js";
import type { LoopRunResult } from "../../src/loop/types.js";

function planEvidence(
  provider: "openai" | "anthropic",
  runtime: "codex" | "claude_code",
  profileId: string,
  model: string,
  effort: "low" | "medium" = "low",
): LoopExecutionPlanEvidence {
  return {
    schemaVersion: 1,
    provider,
    runtime,
    profileId,
    model,
    effort,
    delegation:
      effort === "low"
        ? { mode: "direct_preferred", reason: "low_effort" }
        : { mode: "runtime_managed_allowed", reason: "higher_effort" },
    budget: {
      maxTokens: null,
      maxCostUsd: null,
      maxDurationMs: null,
      maxCalls: 1,
      maxRepairs: 1,
    },
    policy: {
      id: "fixture-policy",
      mode: "execute",
      requiredCapabilities: ["code_edit"],
      requiredPermissions: ["write_worktree"],
      rationale: ["fixture"],
    },
  };
}

function failoverEvidence(
  attempts: LoopProviderFailoverEvidence["attempts"],
  selectedProvider: string | null,
): LoopProviderFailoverEvidence {
  return {
    schemaVersion: 1,
    maxAttempts: attempts.length,
    attemptedProviders: attempts.map((attempt) => attempt.provider),
    selectedProvider,
    attempts,
  };
}

function run(
  overrides: Partial<LoopRunResult> & Pick<LoopRunResult, "runId">,
): LoopRunResult {
  return {
    schemaVersion: 1,
    runId: overrides.runId,
    project: "loop-engine",
    mode: "execute",
    status: "completed",
    startedAt: "2026-09-05T10:00:00.000Z",
    completedAt: "2026-09-05T10:00:05.000Z",
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy: null,
    contextPackage: null,
    ...overrides,
  };
}

function history(entries: readonly LoopRunResult[]): LoopRunHistoryReport {
  return {
    schemaVersion: 1,
    project: "loop-engine",
    limit: 20,
    entries,
    corruptedLines: 0,
  };
}

function policyCategory(
  category: "code" | "architecture",
): LoopRunResult["agentPolicy"] {
  return {
    requirements: { category },
  } as unknown as LoopRunResult["agentPolicy"];
}

describe("run model efficiency evidence", () => {
  it("compares terminal model outcomes while preserving every failover attempt", () => {
    const directLuna = run({
      runId: "direct-luna",
      executionPlanEvidence: planEvidence(
        "openai",
        "codex",
        "configured.codex.economy",
        "gpt-5.6-luna",
      ),
      providerFailoverEvidence: failoverEvidence(
        [
          {
            attempt: 1,
            provider: "openai",
            runtime: "codex",
            profileId: "configured.codex.economy",
            model: "gpt-5.6-luna",
            status: "completed",
            failureCode: null,
            recoverable: false,
          },
        ],
        "openai",
      ),
      validation: {
        status: "passed",
        attempts: 1,
        repairAttempts: 0,
        commands: ["pnpm run validate"],
        failedCommand: null,
        exitCode: 0,
      },
      modifiedFiles: ["src/a.ts"],
      writableFileScope: ["src/**"],
      agentPolicy: policyCategory("code"),
    });

    const failoverToLuna = run({
      runId: "haiku-to-luna",
      startedAt: "2026-09-05T10:01:00.000Z",
      completedAt: "2026-09-05T10:01:10.000Z",
      executionPlanEvidence: planEvidence(
        "anthropic",
        "claude_code",
        "configured.claude_code.economy",
        "claude-haiku-4-5",
        "medium",
      ),
      providerFailoverEvidence: failoverEvidence(
        [
          {
            attempt: 1,
            provider: "anthropic",
            runtime: "claude_code",
            profileId: "configured.claude_code.economy",
            model: "claude-haiku-4-5",
            status: "failed",
            failureCode: "provider_unavailable",
            recoverable: true,
          },
          {
            attempt: 2,
            provider: "openai",
            runtime: "codex",
            profileId: "configured.codex.economy",
            model: "gpt-5.6-luna",
            status: "completed",
            failureCode: null,
            recoverable: false,
          },
        ],
        "openai",
      ),
      validation: {
        status: "passed",
        attempts: 2,
        repairAttempts: 1,
        commands: ["pnpm run validate"],
        failedCommand: null,
        exitCode: 0,
      },
      agentPolicy: policyCategory("architecture"),
    });

    const failedHaiku = run({
      runId: "failed-haiku",
      status: "failed",
      startedAt: "2026-09-05T10:02:00.000Z",
      completedAt: "2026-09-05T10:07:00.000Z",
      executionPlanEvidence: planEvidence(
        "anthropic",
        "claude_code",
        "configured.claude_code.economy",
        "claude-haiku-4-5",
      ),
      providerFailoverEvidence: failoverEvidence(
        [
          {
            attempt: 1,
            provider: "anthropic",
            runtime: "claude_code",
            profileId: "configured.claude_code.economy",
            model: "claude-haiku-4-5",
            status: "failed",
            failureCode: "provider_max_turns",
            recoverable: false,
          },
        ],
        null,
      ),
      modifiedFiles: ["tests/outside.ts"],
      writableFileScope: ["src/**"],
      failure: {
        code: "provider_max_turns",
        message: "bounded fixture failure",
        details: [],
      },
      agentPolicy: policyCategory("architecture"),
    });

    const unattributedExecute = run({
      runId: "unattributed",
      executionPlanEvidence: null,
      providerFailoverEvidence: null,
    });
    const planOnly = run({
      runId: "plan-only",
      mode: "plan",
      executionPlanEvidence: null,
      providerFailoverEvidence: null,
    });

    const report = buildRunModelEfficiencyReport(
      history([
        planOnly,
        unattributedExecute,
        failedHaiku,
        failoverToLuna,
        directLuna,
      ]),
    );

    assert.equal(report.historyEntries, 5);
    assert.equal(report.executionRuns, 4);
    assert.equal(report.observedRuns, 3);
    assert.equal(report.unattributedExecutionRuns, 1);

    assert.deepEqual(
      report.observations.map((observation) => ({
        runId: observation.runId,
        model: observation.model,
        effort: observation.effort,
        taskCategory: observation.taskCategory,
        selectedAfterFailover: observation.selectedAfterFailover,
        durationMs: observation.durationMs,
        outOfScopeFileCount: observation.outOfScopeFileCount,
      })),
      [
        {
          runId: "failed-haiku",
          model: "claude-haiku-4-5",
          effort: "low",
          taskCategory: "architecture",
          selectedAfterFailover: false,
          durationMs: 300_000,
          outOfScopeFileCount: 1,
        },
        {
          runId: "haiku-to-luna",
          model: "gpt-5.6-luna",
          effort: null,
          taskCategory: "architecture",
          selectedAfterFailover: true,
          durationMs: 10_000,
          outOfScopeFileCount: null,
        },
        {
          runId: "direct-luna",
          model: "gpt-5.6-luna",
          effort: "low",
          taskCategory: "code",
          selectedAfterFailover: false,
          durationMs: 5_000,
          outOfScopeFileCount: 0,
        },
      ],
    );

    assert.deepEqual(report.models, [
      {
        provider: "anthropic",
        runtime: "claude_code",
        model: "claude-haiku-4-5",
        profileIds: ["configured.claude_code.economy"],
        terminalRuns: 1,
        outcomes: { completed: 0, failed: 1, blocked: 0, cancelled: 0 },
        validation: {
          observedRuns: 0,
          passedRuns: 0,
          failedRuns: 0,
          totalRepairAttempts: 0,
        },
        taskCategories: [{ category: "architecture", count: 1 }],
        duration: {
          observedRuns: 1,
          totalMs: 300_000,
          minMs: 300_000,
          maxMs: 300_000,
        },
        files: {
          modifiedTotal: 1,
          outOfScopeObservedRuns: 1,
          outOfScopeTotal: 1,
        },
      },
      {
        provider: "openai",
        runtime: "codex",
        model: "gpt-5.6-luna",
        profileIds: ["configured.codex.economy"],
        terminalRuns: 2,
        outcomes: { completed: 2, failed: 0, blocked: 0, cancelled: 0 },
        validation: {
          observedRuns: 2,
          passedRuns: 2,
          failedRuns: 0,
          totalRepairAttempts: 1,
        },
        taskCategories: [
          { category: "code", count: 1 },
          { category: "architecture", count: 1 },
        ],
        duration: {
          observedRuns: 2,
          totalMs: 15_000,
          minMs: 5_000,
          maxMs: 10_000,
        },
        files: {
          modifiedTotal: 1,
          outOfScopeObservedRuns: 1,
          outOfScopeTotal: 0,
        },
      },
    ]);

    assert.deepEqual(report.providerAttempts, [
      {
        provider: "anthropic",
        runtime: "claude_code",
        model: "claude-haiku-4-5",
        profileIds: ["configured.claude_code.economy"],
        attempts: 2,
        completed: 0,
        failed: 2,
        recoverableFailures: 1,
        failureCodes: [
          { code: "provider_max_turns", count: 1 },
          { code: "provider_unavailable", count: 1 },
        ],
      },
      {
        provider: "openai",
        runtime: "codex",
        model: "gpt-5.6-luna",
        profileIds: ["configured.codex.economy"],
        attempts: 2,
        completed: 2,
        failed: 0,
        recoverableFailures: 0,
        failureCodes: [],
      },
    ]);

    assert.deepEqual(report.telemetry, {
      tokens: "unavailable",
      costUsd: "unavailable",
      quota: "unavailable",
      reason: "no_reliable_provider_usage_or_quota_source",
    });
  });

  it("does not treat plan forecasts as model effectiveness evidence", () => {
    const observation = projectRunModelObservation(
      run({
        runId: "plan",
        mode: "plan",
        executionPlanEvidence: planEvidence(
          "openai",
          "codex",
          "configured.codex.economy",
          "gpt-5.6-luna",
        ),
      }),
    );

    assert.equal(observation, null);
  });


  it("treats malformed nested model evidence as unattributed instead of failing the report", () => {
    const malformed = run({
      runId: "malformed-evidence",
      executionPlanEvidence: {
        provider: "openai",
        model: 42,
      } as unknown as LoopRunResult["executionPlanEvidence"],
      providerFailoverEvidence: {
        attempts: "not-an-array",
        selectedProvider: "openai",
      } as unknown as LoopRunResult["providerFailoverEvidence"],
    });

    const report = buildRunModelEfficiencyReport(history([malformed]));

    assert.equal(report.executionRuns, 1);
    assert.equal(report.observedRuns, 0);
    assert.equal(report.unattributedExecutionRuns, 1);
    assert.deepEqual(report.models, []);
    assert.deepEqual(report.providerAttempts, []);
  });

  it("keeps malformed or backwards-moving timestamps as unknown duration", () => {
    const observation = projectRunModelObservation(
      run({
        runId: "bad-time",
        startedAt: "2026-09-05T10:00:05.000Z",
        completedAt: "2026-09-05T10:00:00.000Z",
        executionPlanEvidence: planEvidence(
          "openai",
          "codex",
          "configured.codex.economy",
          "gpt-5.6-luna",
        ),
      }),
    );

    assert.equal(observation?.durationMs, null);
  });
});
