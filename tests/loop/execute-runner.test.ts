import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";

function fixtureProject(): ProjectConfig {
  return {
    name: "fixture-project",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["pnpm run typecheck", "pnpm run audit:strict"],
    roadmap: ["roadmap.md"],
  };
}

function fixtureCandidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 3,
    text: "- [ ] Implement a small code change with tests",
    kind: "safe",
    reason: "no sensitive keyword detected",
    status: "todo",
    priority: "default",
  };
}

function fixtureSnapshot(
  project: ProjectConfig,
  candidate: RoadmapCandidate,
): ProjectSnapshot {
  return {
    project: { name: project.name, type: project.type, path: project.path },
    git: {
      branch: "main",
      clean: true,
      requiresGit: true,
      statusText: "",
      lastCommit: null,
    },
    docs: { required: [], missing: [] },
    validation: { commands: project.validation, configured: true },
    roadmap: {
      available: true,
      paths: project.roadmap,
      candidates: [candidate],
      selectedCandidate: candidate,
      stats: {
        total: 1,
        todo: 1,
        inProgress: 0,
        done: 0,
        unknown: 0,
        safe: 1,
        warning: 0,
        blocked: 0,
      },
      summary: { active: 1, done: 0, selectable: 1, hasBlocked: false },
    },
    health: "good",
  };
}

function fixtureConfig(project: ProjectConfig): Config {
  return { projects: [project] };
}

function deterministicOptions() {
  const project = fixtureProject();
  const candidate = fixtureCandidate();
  const snapshot = fixtureSnapshot(project, candidate);
  let tick = 0;

  return {
    now: () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    generateRunId: () => "run-execute-fixed",
    loadConfig: () => fixtureConfig(project),
    planLoopCycle: () => ({
      outcome: "ready" as const,
      candidate,
      plannedSteps: ["Execute candidate", "Validate changes"],
      snapshot,
    }),
    buildMinimalContext: (_snapshot: ProjectSnapshot, budget: any) => ({
      project: project.name,
      budget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    }),
  };
}

describe("runLoopExecute", () => {
  it("executes once, validates once and reports modified files without commit", async () => {
    let executorCalls = 0;
    let validatorCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["src/feature.ts", "src/feature.ts"],
          details: ["Injected executor completed."],
        };
      },
      validator: async ({ attempt }) => {
        validatorCalls += 1;
        return {
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: [`Validation attempt ${attempt} passed.`],
        };
      },
    });

    assert.equal(executorCalls, 1);
    assert.equal(validatorCalls, 1);
    assert.equal(result.mode, "execute");
    assert.equal(result.status, "completed");
    assert.equal(result.agentPolicy?.mode, "execute");
    assert.equal(result.validation?.status, "passed");
    assert.equal(result.validation?.attempts, 1);
    assert.equal(result.validation?.repairAttempts, 0);
    assert.deepEqual(result.modifiedFiles, ["src/feature.ts"]);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
    assert.equal(result.failure, null);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      ["planning", "ready", "executing", "validating", "completed"],
    );
  });

  it("repairs once and revalidates within the finite budget", async () => {
    let validationCalls = 0;
    let repairCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      maxRepairs: 1,
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: ["Execution completed."],
      }),
      validator: async ({ attempt }) => {
        validationCalls += 1;
        return attempt === 1
          ? {
              status: "failed",
              failedCommand: "pnpm run typecheck",
              exitCode: 1,
              details: ["Typecheck failed."],
            }
          : {
              status: "passed",
              failedCommand: null,
              exitCode: 0,
              details: ["Validation passed after repair."],
            };
      },
      repairer: async ({ attempt, maxRepairs }) => {
        repairCalls += 1;
        assert.equal(attempt, 1);
        assert.equal(maxRepairs, 1);
        return {
          status: "completed",
          modifiedFiles: ["tests/feature.test.ts"],
          details: ["Repair completed."],
        };
      },
    });

    assert.equal(validationCalls, 2);
    assert.equal(repairCalls, 1);
    assert.equal(result.status, "completed");
    assert.equal(result.validation?.attempts, 2);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.deepEqual(result.modifiedFiles, [
      "src/feature.ts",
      "tests/feature.test.ts",
    ]);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "planning",
        "ready",
        "executing",
        "validating",
        "repairing",
        "validating",
        "completed",
      ],
    );
  });

  it("fails closed after the repair budget is exhausted", async () => {
    let repairCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      maxRepairs: 1,
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/feature.ts"],
        details: ["Execution completed."],
      }),
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run audit:strict",
        exitCode: 1,
        details: ["Audit failed."],
      }),
      repairer: async () => {
        repairCalls += 1;
        return {
          status: "completed",
          modifiedFiles: ["src/repair.ts"],
          details: ["Repair attempted."],
        };
      },
    });

    assert.equal(repairCalls, 1);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(result.validation?.attempts, 2);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });

  it("never calls the executor when execute policy admission fails", async () => {
    let executorCalls = 0;

    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
      agentRegistry: { profiles: [] },
      executor: async () => {
        executorCalls += 1;
        return {
          status: "completed",
          modifiedFiles: [],
          details: [],
        };
      },
    });

    assert.equal(executorCalls, 0);
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "agent_policy_rejected");
    assert.equal(result.validation, null);
    assert.deepEqual(result.modifiedFiles, []);
  });

  it("fails closed when no concrete executor is configured", async () => {
    const result = await runLoopExecute("fixture-project", {
      ...deterministicOptions(),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "executor_unavailable");
    assert.equal(result.validation, null);
    assert.deepEqual(
      result.steps.map((step) => step.name),
      ["planning", "ready", "executing", "failed"],
    );
  });
});
