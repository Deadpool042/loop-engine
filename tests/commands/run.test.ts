import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { runLoopRunCommand } from "../../src/commands/run.js";
import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
} from "../../src/composition/index.js";
import type { LoopRunResult } from "../../src/loop/types.js";
import type { AgentPolicyResolution } from "../../src/policy/types.js";

const FIXTURE_PROJECT: LoopApplicationProject = {
  name: "run-history-write-failure-fixture",
  path: ".",
  type: "generic",
  required_docs: [],
  validation: [],
};

function fixtureAgentPolicyResolution(): AgentPolicyResolution {
  return {
    policyId: "fixture-policy",
    mode: "plan",
    status: "resolved",
    requirements: {
      category: "architecture",
      mode: "plan",
      requiredCapabilities: ["code_edit", "long_context"],
      requiredPermissions: ["read_only"],
      minimumEffort: "medium",
      maximumEffort: "high",
      preferredCapabilityTier: "high_reasoning",
      contextBudget: {
        maxFiles: 8,
        maxCharacters: 80_000,
        maxEstimatedTokens: 20_000,
        includeFullFiles: false,
      },
      executionBudget: {
        maxTokens: null,
        maxCostUsd: null,
        maxDurationMs: null,
        maxCalls: 0,
        maxRepairs: 0,
      },
      rationale: ["fixture architecture policy"],
    },
    selectionRequest: {
      requiredCapabilities: ["code_edit", "long_context"],
      requiredPermissions: ["read_only"],
      minEffort: "medium",
      maxEffort: "high",
      budgetCeiling: {
        maxTokens: 150_000,
        maxCostUsd: 4,
        maxDurationMs: 300_000,
        maxCalls: 1,
        maxRepairs: 1,
      },
    },
    selection: {
      outcome: "selected",
      profile: {
        id: "fixture.low",
        runtime: "claude_code",
        provider: "anthropic",
        model: "claude-sonnet-5",
        effort: "low",
        capabilities: ["code_edit", "long_context"],
        permissions: ["read_only"],
        budget: {
          maxTokens: 100_000,
          maxCostUsd: 3,
          maxDurationMs: 240_000,
          maxCalls: 1,
          maxRepairs: 1,
        },
      },
      rejected: [],
    },
    reasons: ["fixture decision reason"],
    fallback: {
      active: true,
      reason: "preferred_capability_tier_unavailable",
    },
  };
}

function fixtureCompletedResult(
  agentPolicy: AgentPolicyResolution | null = null,
): LoopRunResult {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: randomUUID(),
    project: FIXTURE_PROJECT.name,
    mode: "plan",
    status: "completed",
    startedAt: timestamp,
    completedAt: timestamp,
    candidate: null,
    steps: [],
    validation: null,
    modifiedFiles: [],
    commit: null,
    publication: null,
    failure: null,
    agentPolicy,
    contextPackage: null,
  };
}

/**
 * A minimal fake `LoopApplicationAssembly` exercising only the members
 * `runLoopRunCommand` actually reads for mode "plan": `runLoopPlan`,
 * `recordLoopRunHistory`, and `generateExecutionReport`. Every other field
 * is intentionally absent -- calling it would be a test bug, not a
 * production path -- hence the cast.
 */
function fakeApplication(
  recordLoopRunHistory: LoopApplicationAssembly["recordLoopRunHistory"],
  result: LoopRunResult = fixtureCompletedResult(),
): LoopApplicationAssembly {
  return {
    runLoopPlan: () => result,
    recordLoopRunHistory,
    generateExecutionReport: (runResult: LoopRunResult) => runResult,
  } as unknown as LoopApplicationAssembly;
}

function captureConsoleLog(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = original;
    },
  };
}

function captureStderrWrites(): {
  writes: string[];
  restore: () => void;
} {
  const writes: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    writes.push(chunk.toString());
    return true;
  }) as typeof process.stderr.write;
  return {
    writes,
    restore: () => {
      process.stderr.write = original;
    },
  };
}

describe("run command — agent decision observability", () => {
  it("shows the executable provider/model decision and distinguishes invocation effort from profile ranking effort", async () => {
    const result = fixtureCompletedResult(fixtureAgentPolicyResolution());
    const application = fakeApplication(
      () => ({ written: true, ok: true }),
      result,
    );

    const log = captureConsoleLog();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        false,
      );
    } finally {
      log.restore();
    }

    assert.equal(exitCode, 0);
    assert.ok(log.lines.some((line) => line.includes("Status: resolved")));
    assert.ok(
      log.lines.some((line) => line.includes("Task category: architecture")),
    );
    assert.ok(
      log.lines.some((line) => line.includes("Invocation effort: medium")),
    );
    assert.ok(log.lines.some((line) => line.includes("Selected: fixture.low")));
    assert.ok(log.lines.some((line) => line.includes("Runtime: claude_code")));
    assert.ok(log.lines.some((line) => line.includes("Provider: anthropic")));
    assert.ok(
      log.lines.some((line) => line.includes("Model: claude-sonnet-5")),
    );
    assert.ok(
      log.lines.some((line) => line.includes("Profile ranking effort: low")),
    );
    assert.ok(
      log.lines.some((line) =>
        line.includes(
          "Budget ceiling: tokens=150000, costUsd=4, durationMs=300000, calls=1, repairs=1",
        ),
      ),
    );
    assert.ok(
      log.lines.some((line) =>
        line.includes(
          "Fallback: preferred_capability_tier_unavailable",
        ),
      ),
    );
    assert.ok(
      log.lines.some((line) => line.includes("Reason: fixture decision reason")),
    );
    assert.ok(
      log.lines.some((line) =>
        line.includes("Execution: forecast only; no agent was called."),
      ),
    );
  });
});

describe("run command — non-silent run history write failure", () => {
  it("text mode: warns without turning a successful run into a failure", async () => {
    const application = fakeApplication(() => ({
      written: false,
      ok: false,
      code: "write_failed",
      message: "simulated disk failure",
    }));

    const log = captureConsoleLog();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        false,
      );
    } finally {
      log.restore();
    }

    assert.equal(exitCode, 0);
    const warningLine = log.lines.find((line) =>
      line.includes("Run history not recorded"),
    );
    assert.ok(warningLine, "expected a non-silent run history warning");
    assert.ok(warningLine?.includes("write_failed"));
    assert.ok(warningLine?.includes("simulated disk failure"));
  });

  it("json mode: reports the failure on stderr as LOOP_RUN_HISTORY_WRITE_FAILED without corrupting stdout JSON", async () => {
    const application = fakeApplication(() => ({
      written: false,
      ok: false,
      code: "write_failed",
      message: "simulated disk failure",
    }));

    const log = captureConsoleLog();
    const stderr = captureStderrWrites();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        true,
      );
    } finally {
      log.restore();
      stderr.restore();
    }

    assert.equal(exitCode, 0);

    // stdout must remain exactly one parsable JSON payload: the failure
    // signal must never leak into it.
    assert.equal(log.lines.length, 1);
    assert.doesNotThrow(() => JSON.parse(log.lines[0] as string));

    const failureLine = stderr.writes.find((line) =>
      line.startsWith("LOOP_RUN_HISTORY_WRITE_FAILED:"),
    );
    assert.ok(failureLine, "expected a non-silent stderr failure signal");
    const detail = JSON.parse(
      (failureLine as string).slice("LOOP_RUN_HISTORY_WRITE_FAILED:".length),
    ) as { code?: unknown; message?: unknown };
    assert.equal(detail.code, "write_failed");
    assert.equal(detail.message, "simulated disk failure");
  });

  it("does not warn when the history write succeeds", async () => {
    const application = fakeApplication(() => ({
      written: true,
      ok: true,
    }));

    const log = captureConsoleLog();
    let exitCode: number;
    try {
      exitCode = await runLoopRunCommand(
        application,
        FIXTURE_PROJECT,
        "plan",
        false,
      );
    } finally {
      log.restore();
    }

    assert.equal(exitCode, 0);
    assert.equal(
      log.lines.some((line) => line.includes("Run history not recorded")),
      false,
    );
  });
});
