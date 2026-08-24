import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";
import type { ContextBudget } from "../../src/policy/types.js";

function fixtureProject(): ProjectConfig {
  return {
    name: "repair-budget-fixture",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["fixture-validation"],
    roadmap: ["roadmap.md"],
  };
}

function fixtureCandidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text: "- [ ] Implement a small code change with tests",
    kind: "safe",
    reason: "fixture",
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

function deterministicOptions() {
  const project = fixtureProject();
  const candidate = fixtureCandidate();
  const snapshot = fixtureSnapshot(project, candidate);
  let tick = 0;

  return {
    now: () => `2026-08-24T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    generateRunId: () => "repair-budget-run",
    loadConfig: (): Config => ({ projects: [project] }),
    planLoopCycle: () => ({
      outcome: "ready" as const,
      candidate,
      plannedSteps: ["Execute", "Validate"],
      snapshot,
    }),
    buildMinimalContext: (
      _snapshot: ProjectSnapshot,
      budget: ContextBudget,
    ) => ({
      project: project.name,
      budget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    }),
    readModifiedWorktreeFiles: async () => [] as readonly string[],
  };
}

describe("runLoopExecute — policy repair budget parity", () => {
  it("clamps a larger caller repair request to the resolved policy ceiling", async () => {
    let repairCalls = 0;
    const repairBudgets: number[] = [];

    const result = await runLoopExecute("repair-budget-fixture", {
      ...deterministicOptions(),
      maxRepairs: 5,
      executor: async () => ({
        status: "completed" as const,
        modifiedFiles: [],
        details: [],
      }),
      validator: async () => ({
        status: "failed" as const,
        failedCommand: "fixture-validation",
        exitCode: 1,
        details: ["fixture failure"],
      }),
      repairer: async (input) => {
        repairCalls += 1;
        repairBudgets.push(input.maxRepairs);
        return {
          status: "completed" as const,
          modifiedFiles: [],
          details: ["fixture repair"],
        };
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(repairCalls, 1);
    assert.deepEqual(repairBudgets, [1]);
    assert.equal(result.validation?.repairAttempts, 1);
    assert.equal(
      result.steps.some((step) =>
        step.details.includes("Repair budget: requested=5, effective=1"),
      ),
      true,
    );
  });

  it("preserves a stricter caller request of zero repairs", async () => {
    let repairCalls = 0;

    const result = await runLoopExecute("repair-budget-fixture", {
      ...deterministicOptions(),
      maxRepairs: 0,
      executor: async () => ({
        status: "completed" as const,
        modifiedFiles: [],
        details: [],
      }),
      validator: async () => ({
        status: "failed" as const,
        failedCommand: "fixture-validation",
        exitCode: 1,
        details: ["fixture failure"],
      }),
      repairer: async () => {
        repairCalls += 1;
        return {
          status: "completed" as const,
          modifiedFiles: [],
          details: [],
        };
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(repairCalls, 0);
    assert.equal(result.validation?.repairAttempts, 0);
    assert.equal(
      result.steps.some((step) =>
        step.details.includes("Repair budget: requested=0, effective=0"),
      ),
      true,
    );
  });
});
