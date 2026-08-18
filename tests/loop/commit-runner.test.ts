import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopCommit } from "../../src/loop/commit-runner.js";

function project(): ProjectConfig {
  return {
    name: "fixture-project",
    path: ".",
    type: "test",
    required_docs: [],
    validation: ["pnpm run typecheck"],
    roadmap: ["roadmap.md"],
  };
}

function candidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text: "- [ ] Implement the controlled commit fixture",
    kind: "safe",
    reason: "safe fixture",
    status: "todo",
    priority: "default",
  };
}

function options() {
  const fixtureProject = project();
  const fixtureCandidate = candidate();
  const snapshot: ProjectSnapshot = {
    project: {
      name: fixtureProject.name,
      type: fixtureProject.type,
      path: fixtureProject.path,
    },
    git: {
      branch: "main",
      clean: true,
      requiresGit: true,
      statusText: "",
      lastCommit: null,
    },
    docs: { required: [], missing: [] },
    validation: { commands: fixtureProject.validation, configured: true },
    roadmap: {
      available: true,
      paths: fixtureProject.roadmap,
      candidates: [fixtureCandidate],
      selectedCandidate: fixtureCandidate,
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
  const config: Config = { projects: [fixtureProject] };
  let tick = 0;
  return {
    now: () => `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    generateRunId: () => "run-commit-fixed",
    loadConfig: () => config,
    planLoopCycle: () => ({
      outcome: "ready" as const,
      candidate: fixtureCandidate,
      plannedSteps: ["Execute", "Validate", "Commit"],
      snapshot,
    }),
    buildMinimalContext: (_snapshot: ProjectSnapshot, budget: any) => ({
      project: fixtureProject.name,
      budget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    }),
  };
}

describe("runLoopCommit", () => {
  it("commits the exact modified files only after validation passes", async () => {
    let commitCalls = 0;
    const result = await runLoopCommit("fixture-project", {
      ...options(),
      commitMessage: "feat: controlled fixture",
      readModifiedWorktreeFiles: async () => ["src/a.ts", "tests/a.test.ts"],
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/a.ts", "tests/a.test.ts"],
        details: ["Provider completed."],
      }),
      validator: async () => ({
        status: "passed",
        failedCommand: null,
        exitCode: 0,
        details: ["Validation passed."],
      }),
      committer: async ({ modifiedFiles, message }) => {
        commitCalls += 1;
        assert.deepEqual(modifiedFiles, ["src/a.ts", "tests/a.test.ts"]);
        assert.equal(message, "feat: controlled fixture");
        return {
          committed: true,
          sha: "a".repeat(40),
          message,
        };
      },
    });

    assert.equal(commitCalls, 1);
    assert.equal(result.mode, "commit");
    assert.equal(result.status, "completed");
    assert.equal(result.validation?.status, "passed");
    assert.deepEqual(result.commit, {
      sha: "a".repeat(40),
      message: "feat: controlled fixture",
    });
    assert.equal(result.publication, null);
  });

  it("never calls the committer when validation fails", async () => {
    let commitCalls = 0;
    const result = await runLoopCommit("fixture-project", {
      ...options(),
      commitMessage: "feat: must not be created",
      readModifiedWorktreeFiles: async () => ["src/a.ts"],
      executor: async () => ({
        status: "completed",
        modifiedFiles: ["src/a.ts"],
        details: ["Provider completed."],
      }),
      validator: async () => ({
        status: "failed",
        failedCommand: "pnpm run typecheck",
        exitCode: 1,
        details: ["Validation failed."],
      }),
      committer: async () => {
        commitCalls += 1;
        return {
          committed: true,
          sha: "b".repeat(40),
          message: "unexpected",
        };
      },
    });

    assert.equal(commitCalls, 0);
    assert.equal(result.mode, "commit");
    assert.equal(result.status, "failed");
    assert.equal(result.failure?.code, "validation_failed");
    assert.equal(result.commit, null);
    assert.equal(result.publication, null);
  });
});
