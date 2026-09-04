import assert from "node:assert/strict";
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { Config, ProjectConfig } from "../../src/core/config.js";
import { runLoopExecute } from "../../src/loop/execute-runner.js";
import { planLoopCycle } from "../../src/loop/planner.js";
import { runLoopPlan } from "../../src/loop/runner.js";

function initGitRepo(projectPath: string): string {
  const run = (command: string) =>
    execSync(command, { cwd: projectPath, stdio: "pipe" });

  run("git init -q");
  run('git -c user.email=test@example.com -c user.name=test add -A');
  run(
    'git -c user.email=test@example.com -c user.name=test commit -q -m "initial"',
  );

  return execSync("git rev-parse HEAD", { cwd: projectPath, encoding: "utf8" }).trim();
}

function setupGovernedProject(options: {
  roadmap: string;
  decisionYaml: (headSha: string) => string;
  projectName?: string;
}): { project: ProjectConfig; projectPath: string; headSha: string } {
  const projectPath = mkdtempSync(join(tmpdir(), "loop-governed-"));
  writeFileSync(join(projectPath, "roadmap.md"), options.roadmap);

  const headSha = initGitRepo(projectPath);

  writeFileSync(
    join(projectPath, "decision.yaml"),
    options.decisionYaml(headSha),
  );

  const project: ProjectConfig = {
    name: options.projectName ?? "fixture",
    path: projectPath,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
    execution_decision: "decision.yaml",
  };

  return { project, projectPath, headSha };
}

function readyDecision(headSha: string, candidateId: string, project = "fixture"): string {
  return [
    "version: 1",
    `project: ${project}`,
    "decision:",
    "  state: READY",
    "  candidate:",
    `    id: ${candidateId}`,
    "    allowedPaths:",
    "      - src/**",
    "source:",
    `  gitHead: ${headSha}`,
  ].join("\n");
}

function createIsolatedWorktree(sourcePath: string, headSha: string): {
  path: string;
  cleanup: () => void;
} {
  const path = mkdtempSync(join(tmpdir(), "loop-governed-worktree-"));
  execFileSync("git", ["worktree", "add", "--detach", path, headSha], {
    cwd: sourcePath,
    stdio: "pipe",
  });

  return {
    path,
    cleanup: () => {
      execFileSync("git", ["worktree", "remove", "--force", path], {
        cwd: sourcePath,
        stdio: "pipe",
      });
      rmSync(path, { recursive: true, force: true });
    },
  };
}

describe("project-owned execution decision governance", () => {
  it("authorizes plan when READY, SHA matches, and the candidate is admissible", () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "ready");
      if (plan.outcome === "ready") {
        assert.equal(plan.candidate.id, "H1-L4");
        assert.equal(plan.authorizedBy, "execution_decision");
      }
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("blocks fail-closed when source.gitHead does not match the evaluated HEAD", () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: () => readyDecision("b".repeat(40), "H1-L4"),
    });

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "sha_stale");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("blocks fail-closed when the decision file is absent", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "loop-governed-missing-"));
    writeFileSync(join(projectPath, "roadmap.md"), "| H1-L4 | Item | ⬜ À faire |");
    initGitRepo(projectPath);
    const project: ProjectConfig = {
      name: "fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      execution_decision: "decision.yaml",
    };

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "decision_missing");
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("blocks fail-closed when the decision file is malformed", () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Item | ⬜ À faire |",
      decisionYaml: () => "not: [valid, decision",
    });

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "decision_malformed");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("blocks READY decisions with a missing or malformed writable file scope", () => {
    for (const decisionYaml of [
      (sha: string) => [
        "version: 1", "project: fixture", "decision:", "  state: READY", "  candidate:", "    id: H1-L4", "source:", `  gitHead: ${sha}`,
      ].join("\n"),
      (sha: string) => [
        "version: 1", "project: fixture", "decision:", "  state: READY", "  candidate:", "    id: H1-L4", "    allowedPaths:", "      - docs/*/README.md", "source:", `  gitHead: ${sha}`,
      ].join("\n"),
    ]) {
      const { project } = setupGovernedProject({
        roadmap: "| H1-L4 | Item | ⬜ À faire |",
        decisionYaml,
      });
      try {
        const plan = planLoopCycle(project);
        assert.equal(plan.outcome, "blocked");
        assert.ok(plan.code === "scope_missing" || plan.code === "scope_malformed");
      } finally {
        rmSync(project.path, { recursive: true, force: true });
      }
    }
  });

  it("blocks deterministically when execution_decision is not a non-empty string", () => {
    for (const executionDecision of [null, 42, "   "] as const) {
      const projectPath = mkdtempSync(join(tmpdir(), "loop-governed-invalid-config-"));
      writeFileSync(join(projectPath, "roadmap.md"), "| H1-L4 | Item | ⬜ À faire |");
      initGitRepo(projectPath);
      const project: ProjectConfig = {
        name: "fixture",
        path: projectPath,
        type: "test",
        required_docs: [],
        validation: [],
        roadmap: ["roadmap.md"],
        execution_decision: executionDecision as unknown as string,
      };

      try {
        const plan = planLoopCycle(project);
        assert.equal(plan.outcome, "blocked");
        assert.equal(plan.code, "decision_malformed");
      } finally {
        rmSync(projectPath, { recursive: true, force: true });
      }
    }
  });

  it("blocks fail-closed on a project mismatch", () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Item | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4", "some-other-project"),
    });

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "project_mismatch");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("blocks fail-closed for a READY decision without decision.candidate.id", () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Item | ⬜ À faire |",
      decisionYaml: (sha) =>
        ["version: 1", "project: fixture", "decision:", "  state: READY", "source:", `  gitHead: ${sha}`].join(
          "\n",
        ),
    });

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "decision_malformed");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("blocks fail-closed for an unknown authorized candidate", () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Item | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H9-L9"),
    });

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "candidate_not_found");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("blocks fail-closed for an authorized candidate that is done, blocked, or not admissible", () => {
    const cases = [
      { roadmap: "| H1-L4 | Item | ✅ Terminé |", code: "candidate_done" },
      { roadmap: "| H1-L4 | Production finale | ⬜ À faire |", code: "candidate_blocked" },
      { roadmap: "| H1-L4 | Item | En attente |", code: "candidate_not_admissible" },
    ] as const;

    for (const testCase of cases) {
      const { project } = setupGovernedProject({
        roadmap: testCase.roadmap,
        decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
      });

      try {
        const plan = planLoopCycle(project);
        assert.equal(plan.outcome, "blocked", testCase.code);
        assert.equal(plan.code, testCase.code, testCase.code);
      } finally {
        rmSync(project.path, { recursive: true, force: true });
      }
    }
  });

  it("authorizes no candidate for BLOCKED, REVALIDATION_REQUIRED, and NO_ACTIONABLE_WORK", () => {
    const states = [
      "BLOCKED",
      "REVALIDATION_REQUIRED",
      "NO_ACTIONABLE_WORK",
    ] as const;

    for (const state of states) {
      const { project } = setupGovernedProject({
        roadmap: "| H1-L4 | Item | ⬜ À faire |",
        decisionYaml: (sha) =>
          [
            "version: 1",
            "project: fixture",
            "decision:",
            `  state: ${state}`,
            "source:",
            `  gitHead: ${sha}`,
          ].join("\n"),
      });

      try {
        const plan = planLoopCycle(project);
        assert.equal(plan.outcome, "blocked", state);
        assert.equal(plan.code, state.toLowerCase() === "blocked" ? "decision_blocked" : `decision_${state.toLowerCase()}`, state);
      } finally {
        rmSync(project.path, { recursive: true, force: true });
      }
    }
  });

  it("rejects a governed candidateId request that does not match the authorized candidate", () => {
    const { project } = setupGovernedProject({
      roadmap: [
        "| H1-L4 | Authorized candidate | ⬜ À faire |",
        "| H1-L5 | Other candidate | ⬜ À faire |",
      ].join("\n"),
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });

    try {
      const plan = planLoopCycle(project, { candidateId: "H1-L5" });
      assert.equal(plan.outcome, "blocked");
      assert.equal(plan.code, "candidate_authorization_mismatch");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("preserves existing heuristic behavior for a non opted-in (legacy) project", () => {
    const projectPath = mkdtempSync(join(tmpdir(), "loop-legacy-"));
    writeFileSync(
      join(projectPath, "roadmap.md"),
      "| H1-L4 | Legacy candidate | ⬜ À faire |",
    );
    const project: ProjectConfig = {
      name: "fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      requires_git: false,
    };

    try {
      const plan = planLoopCycle(project);
      assert.equal(plan.outcome, "ready");
      if (plan.outcome === "ready") {
        assert.equal(plan.candidate.id, "H1-L4");
        assert.equal(plan.authorizedBy, undefined);
      }
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("prevents the executor from ever being called when governance blocks the cycle", async () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: () => readyDecision("b".repeat(40), "H1-L4"),
    });
    const config: Config = { projects: [project] };

    try {
      let executorCalls = 0;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        executor: async () => {
          executorCalls += 1;
          return { status: "completed", modifiedFiles: [], details: [] };
        },
      });

      assert.equal(execution.status, "blocked");
      assert.equal(execution.failure?.code, "sha_stale");
      assert.equal(executorCalls, 0);
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("reads an uncommitted canonical decision while validating the real isolated worktree HEAD", async () => {
    const source = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });
    const worktree = createIsolatedWorktree(source.projectPath, source.headSha);
    const config: Config = { projects: [source.project] };

    try {
      assert.equal(existsSync(join(worktree.path, "decision.yaml")), false);
      let executorCalls = 0;
      let authorizedBy: string | undefined;
      const execution = await runLoopExecute(source.project.name, {
        loadConfig: () => config,
        executionProjectPath: worktree.path,
        planLoopCycle: (project, options) => {
          const plan = planLoopCycle(project, options);
          authorizedBy = plan.outcome === "ready" ? plan.authorizedBy : undefined;
          return plan;
        },
        executor: async () => {
          executorCalls += 1;
          return {
            status: "completed",
            modifiedFiles: ["src/generated.ts"],
            details: [],
          };
        },
        readModifiedWorktreeFiles: async () => ["src/generated.ts"],
        validator: async () => ({
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: [],
        }),
      });

      assert.equal(execution.status, "completed");
      assert.equal(execution.candidate?.id, "H1-L4");
      assert.equal(execution.failure, null);
      assert.equal(authorizedBy, "execution_decision");
      assert.equal(executorCalls, 1);
    } finally {
      worktree.cleanup();
      rmSync(source.projectPath, { recursive: true, force: true });
    }
  });

  it("blocks before execution when the canonical decision SHA diverges from the isolated worktree", async () => {
    const source = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });
    const worktree = createIsolatedWorktree(source.projectPath, source.headSha);
    const config: Config = { projects: [source.project] };

    try {
      writeFileSync(join(source.projectPath, "source-change.md"), "source change\n");
      execFileSync("git", ["add", "source-change.md"], {
        cwd: source.projectPath,
        stdio: "pipe",
      });
      execSync('git -c user.email=test@example.com -c user.name=test commit -qm "source change"', {
        cwd: source.projectPath,
        stdio: "pipe",
      });
      const sourceHead = execSync("git rev-parse HEAD", {
        cwd: source.projectPath,
        encoding: "utf8",
      }).trim();
      writeFileSync(
        join(source.projectPath, "decision.yaml"),
        readyDecision(sourceHead, "H1-L4"),
      );

      let executorCalls = 0;
      const execution = await runLoopExecute(source.project.name, {
        loadConfig: () => config,
        executionProjectPath: worktree.path,
        executor: async () => {
          executorCalls += 1;
          return { status: "completed", modifiedFiles: [], details: [] };
        },
      });

      assert.equal(execution.status, "blocked");
      assert.equal(execution.failure?.code, "sha_stale");
      assert.equal(executorCalls, 0);
    } finally {
      worktree.cleanup();
      rmSync(source.projectPath, { recursive: true, force: true });
    }
  });

  it("blocks before execution when the canonical checkout has no decision", async () => {
    const source = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });
    const worktree = createIsolatedWorktree(source.projectPath, source.headSha);
    const config: Config = { projects: [source.project] };

    try {
      rmSync(join(source.projectPath, "decision.yaml"));
      let executorCalls = 0;
      const execution = await runLoopExecute(source.project.name, {
        loadConfig: () => config,
        executionProjectPath: worktree.path,
        executor: async () => {
          executorCalls += 1;
          return { status: "completed", modifiedFiles: [], details: [] };
        },
      });

      assert.equal(execution.status, "blocked");
      assert.equal(execution.failure?.code, "decision_missing");
      assert.equal(executorCalls, 0);
    } finally {
      worktree.cleanup();
      rmSync(source.projectPath, { recursive: true, force: true });
    }
  });

  it("fails governed READY execution before validation when the worktree delta is empty", async () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });
    const config: Config = { projects: [project] };

    try {
      let validatorCalls = 0;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        readModifiedWorktreeFiles: async () => [],
        executor: async () => ({
          status: "completed",
          modifiedFiles: [],
          details: [],
        }),
        validator: async () => {
          validatorCalls += 1;
          return {
            status: "passed",
            failedCommand: null,
            exitCode: 0,
            details: [],
          };
        },
      });

      assert.equal(execution.status, "failed");
      assert.equal(execution.failure?.code, "no_effective_change");
      assert.deepEqual(execution.modifiedFiles, []);
      assert.equal(validatorCalls, 0);
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("fails governed execution when a successful repair removes the entire delta", async () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });
    const config: Config = { projects: [project] };
    const observedDeltas: readonly string[][] = [
      ["src/generated.ts"],
      [],
    ];
    let worktreeReads = 0;
    let validatorCalls = 0;
    let repairerCalls = 0;

    try {
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        maxRepairs: 1,
        readModifiedWorktreeFiles: async () =>
          observedDeltas[worktreeReads++] ?? [],
        executor: async () => ({
          status: "completed",
          modifiedFiles: ["src/generated.ts"],
          details: [],
        }),
        validator: async () => {
          validatorCalls += 1;
          return {
            status: "failed",
            failedCommand: "pnpm run validate",
            exitCode: 1,
            details: ["fixture validation failure"],
          };
        },
        repairer: async () => {
          repairerCalls += 1;
          return {
            status: "completed",
            modifiedFiles: [],
            details: [],
          };
        },
      });

      assert.equal(execution.status, "failed");
      assert.equal(execution.failure?.code, "no_effective_change");
      assert.deepEqual(execution.modifiedFiles, []);
      assert.equal(validatorCalls, 1);
      assert.equal(repairerCalls, 1);
      assert.equal(worktreeReads, 2);
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });

  it("preserves empty-delta execute behavior for non-governed legacy projects", async () => {
    const projectPath = mkdtempSync(join(tmpdir(), "loop-legacy-empty-delta-"));
    writeFileSync(
      join(projectPath, "roadmap.md"),
      "| H1-L4 | Legacy candidate | ⬜ À faire |",
    );
    const project: ProjectConfig = {
      name: "fixture",
      path: projectPath,
      type: "test",
      required_docs: [],
      validation: [],
      roadmap: ["roadmap.md"],
      requires_git: false,
    };
    const config: Config = { projects: [project] };

    try {
      let validatorCalls = 0;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        readModifiedWorktreeFiles: async () => [],
        executor: async () => ({
          status: "completed",
          modifiedFiles: [],
          details: [],
        }),
        validator: async () => {
          validatorCalls += 1;
          return {
            status: "passed",
            failedCommand: null,
            exitCode: 0,
            details: [],
          };
        },
      });

      assert.equal(execution.status, "completed");
      assert.equal(execution.failure, null);
      assert.equal(validatorCalls, 1);
    } finally {
      rmSync(projectPath, { recursive: true, force: true });
    }
  });

  it("authorizes plan and execute end-to-end when governed, READY, and fresh", async () => {
    const { project } = setupGovernedProject({
      roadmap: "| H1-L4 | Confirmed candidate | ⬜ À faire |",
      decisionYaml: (sha) => readyDecision(sha, "H1-L4"),
    });
    const config: Config = { projects: [project] };

    try {
      const plan = runLoopPlan(project.name, { loadConfig: () => config });
      assert.equal(plan.status, "completed");
      assert.equal(plan.candidate?.id, "H1-L4");

      let executedCandidateId: string | undefined;
      const execution = await runLoopExecute(project.name, {
        loadConfig: () => config,
        readModifiedWorktreeFiles: async () => ["src/generated.ts"],
        executor: async (executionPlan) => {
          executedCandidateId = executionPlan.candidate.id;
          return {
            status: "completed",
            modifiedFiles: ["src/generated.ts"],
            details: [],
          };
        },
        validator: async () => ({
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: [],
        }),
      });

      assert.equal(execution.status, "completed");
      assert.equal(executedCandidateId, "H1-L4");
    } finally {
      rmSync(project.path, { recursive: true, force: true });
    }
  });
});
