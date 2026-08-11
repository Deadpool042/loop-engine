import assert from "node:assert/strict";
import test from "node:test";

import {
  changedPathsFromGitDiff,
  createDocumentationImpactReport,
  mergeChangedPaths,
  untrackedPathsFromGitStatus,
} from "../../src/documentation/documentation-impact.js";

test("extracts deterministic changed paths from git diff --name-only output", () => {
  assert.deepEqual(
    changedPathsFromGitDiff(
      "src/loop/runner.ts\nsrc/commands/run.ts\nsrc/loop/runner.ts\n",
    ),
    ["src/commands/run.ts", "src/loop/runner.ts"],
  );
});

test("extracts only untracked paths from git status --short output", () => {
  assert.deepEqual(
    untrackedPathsFromGitStatus(
      " M src/core/reports.ts\n?? src/documentation/new-file.ts\n?? tests/new.test.ts\n",
    ),
    ["src/documentation/new-file.ts", "tests/new.test.ts"],
  );
});

test("merges tracked and untracked paths deterministically", () => {
  assert.deepEqual(
    mergeChangedPaths(
      ["src/core/reports.ts", "src/execution/index.ts"],
      ["src/execution/index.ts", "src/execution/new-adapter.ts"],
    ),
    [
      "src/core/reports.ts",
      "src/execution/index.ts",
      "src/execution/new-adapter.ts",
    ],
  );
});

test("maps changed implementation paths to governed architecture documents", () => {
  const report = createDocumentationImpactReport([
    "src/execution/adapters/git-worktree-workspace-manager.ts",
    "src/commands/run.ts",
  ]);

  assert.deepEqual(report, {
    changedPaths: [
      "src/commands/run.ts",
      "src/execution/adapters/git-worktree-workspace-manager.ts",
    ],
    impacts: [
      {
        document: "docs/architecture/commands.md",
        reason: "CLI command surface or command routing changed",
        required: true,
      },
      {
        document: "docs/architecture/isolated-worker-platform-v16.1.md",
        reason: "execution workspace, worker isolation, or execution reporting changed",
        required: true,
      },
    ],
    semanticReviewRequired: true,
  });
});

test("normalizes and deduplicates changed paths and document impacts", () => {
  const report = createDocumentationImpactReport([
    ".\\src\\loop\\runner.ts",
    "src/loop/planner.ts",
    "src/loop/runner.ts",
  ]);

  assert.deepEqual(report.changedPaths, [
    "src/loop/planner.ts",
    "src/loop/runner.ts",
  ]);
  assert.deepEqual(report.impacts, [
    {
      document: "docs/architecture/autonomous-loop-runner.md",
      reason: "autonomous loop runner behavior or contract changed",
      required: true,
    },
  ]);
});

test("does not recursively flag documentation-only changes", () => {
  const report = createDocumentationImpactReport([
    "docs/architecture/commands.md",
    "README.md",
  ]);

  assert.deepEqual(report.impacts, []);
  assert.equal(report.semanticReviewRequired, false);
});

test("reports no documentation impact for unrelated implementation paths", () => {
  const report = createDocumentationImpactReport(["scripts/generate-report-fixtures.ts"]);

  assert.deepEqual(report.impacts, []);
  assert.equal(report.semanticReviewRequired, false);
});
