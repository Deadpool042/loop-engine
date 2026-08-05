import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createLoopApplicationAssembly } from "../../src/composition/index.js";
import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import { runLoopCommit } from "../../src/loop/commit-runner.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(
  currentDir,
  "..",
  "fixtures",
  "fake-claude",
  "claude",
);

function setupProject(): { project: ProjectConfig; cleanup: () => void } {
  const cwd = mkdtempSync(join(tmpdir(), "loop-controlled-commit-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd });
  execFileSync("git", ["config", "user.name", "Test"], { cwd });
  writeFileSync(join(cwd, "README.md"), "controlled commit burn-in\n");
  execFileSync("git", ["add", "README.md"], { cwd });
  execFileSync("git", ["commit", "-q", "-m", "test: baseline"], { cwd });

  return {
    project: {
      name: "controlled-commit-burn-in",
      path: cwd,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
    },
    cleanup: () => rmSync(cwd, { recursive: true, force: true }),
  };
}

function candidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text: "- [ ] Create the controlled commit burn-in file",
    kind: "safe",
    reason: "no sensitive keyword detected",
    status: "todo",
    priority: "default",
  };
}

function snapshot(project: ProjectConfig): ProjectSnapshot {
  const selectedCandidate = candidate();
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
    validation: { commands: [], configured: true },
    roadmap: {
      available: true,
      paths: project.roadmap,
      candidates: [selectedCandidate],
      selectedCandidate,
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

describe("controlled commit burn-in", () => {
  it("executes, validates, and commits exactly the provider-created file in a real Git worktree", async () => {
    const { project, cleanup } = setupProject();
    const application = createLoopApplicationAssembly({
      provider: {
        id: "claude_code",
        executable: FAKE_CLAUDE,
        timeoutMs: 5_000,
      },
    });
    assert.equal(typeof application.loopExecutor, "function");
    assert.ok(application.loopAgentRegistry);

    const config: Config = { projects: [project] };
    const projectSnapshot = snapshot(project);
    let tick = 0;

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const result = await runLoopCommit(project.name, {
        commitMessage: "test: controlled provider commit",
        maxRepairs: 0,
        executor: application.loopExecutor!,
        agentRegistry: application.loopAgentRegistry,
        loadConfig: () => config,
        now: () =>
          `2026-01-01T00:00:${String(tick++).padStart(2, "0")}.000Z`,
        generateRunId: () => "run-controlled-commit-burn-in",
        planLoopCycle: () => ({
          outcome: "ready",
          candidate: candidate(),
          plannedSteps: ["Execute", "Validate", "Commit"],
          snapshot: projectSnapshot,
        }),
        buildMinimalContext: (_snapshot, budget) => ({
          project: project.name,
          budget,
          files: [],
          omitted: [],
          totalCharacters: 0,
          estimatedTokens: 0,
          truncated: false,
        }),
        validator: async () => ({
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: ["Validation passed."],
        }),
      });

      assert.equal(result.status, "completed");
      assert.equal(result.mode, "commit");
      assert.deepEqual(result.modifiedFiles, ["provider-created.txt"]);
      assert.equal(result.validation?.status, "passed");
      assert.equal(result.commit?.message, "test: controlled provider commit");
      assert.match(result.commit?.sha ?? "", /^[a-f0-9]{40}$/);
      assert.equal(
        readFileSync(join(project.path, "provider-created.txt"), "utf8"),
        "created\n",
      );

      const committedFiles = execFileSync(
        "git",
        ["show", "--pretty=format:", "--name-only", "HEAD"],
        { cwd: project.path, encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .filter(Boolean);
      assert.deepEqual(committedFiles, ["provider-created.txt"]);
      assert.equal(
        execFileSync("git", ["status", "--porcelain=v1"], {
          cwd: project.path,
          encoding: "utf8",
        }),
        "",
      );
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      cleanup();
    }
  });
});
