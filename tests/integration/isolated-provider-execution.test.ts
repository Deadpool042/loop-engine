import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createLoopApplicationAssembly } from "../../src/composition/index.js";
import type { Config, ProjectConfig } from "../../src/core/config.js";
import type { RoadmapCandidate } from "../../src/intelligence/roadmap.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import type { LoopRunExecuteOptions } from "../../src/loop/execute-runner.js";

const currentDir = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(
  currentDir,
  "..",
  "fixtures",
  "fake-claude",
  "claude",
);

async function createRepository(
  root: string,
  name: string,
): Promise<ProjectConfig> {
  const path = join(root, name);
  await mkdir(path);
  execFileSync("git", ["init", "-q"], { cwd: path });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: path,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: path });
  await writeFile(join(path, "README.md"), `${name}\n`);
  execFileSync("git", ["add", "README.md"], { cwd: path });
  execFileSync("git", ["commit", "-q", "-m", "test: baseline"], { cwd: path });
  return {
    name,
    path,
    type: "test",
    required_docs: [],
    validation: [],
    roadmap: ["roadmap.md"],
  };
}

function candidate(): RoadmapCandidate {
  return {
    path: "roadmap.md",
    line: 1,
    text: "- [ ] Implement isolated provider execution",
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

function optionsFor(projects: readonly ProjectConfig[]): LoopRunExecuteOptions {
  const config: Config = { projects };
  return {
    maxRepairs: 0,
    loadConfig: () => config,
    planLoopCycle: (project) => ({
      outcome: "ready",
      candidate: candidate(),
      plannedSteps: ["Execute", "Validate"],
      snapshot: snapshot(project),
    }),
    buildMinimalContext: (_snapshot, budget) => ({
      project: projects[0]!.name,
      budget,
      files: [],
      omitted: [],
      totalCharacters: 0,
      estimatedTokens: 0,
      truncated: false,
    }),
  };
}

function application(projects: readonly ProjectConfig[], root: string) {
  return createLoopApplicationAssembly({
    provider: { id: "claude_code", executable: FAKE_CLAUDE, timeoutMs: 5_000 },
    isolatedProviderExecution: {
      lockRoot: join(root, "locks"),
      workspaceRoot: join(root, "workspaces"),
      resolveRepositoryPath: (projectId) => {
        const project = projects.find(
          (candidateProject) => candidateProject.name === projectId,
        );
        if (!project) throw new Error(`unknown test project: ${projectId}`);
        return project.path;
      },
    },
  });
}

async function assertCleanSource(
  project: ProjectConfig,
  file: string,
): Promise<void> {
  await assert.rejects(readFile(join(project.path, file), "utf8"));
  assert.equal(
    execFileSync("git", ["status", "--porcelain=v1"], {
      cwd: project.path,
      encoding: "utf8",
    }),
    "",
  );
}

async function assertNoOrphans(root: string): Promise<void> {
  assert.deepEqual(await readdir(join(root, "workspaces")), []);
  assert.deepEqual(await readdir(join(root, "locks")), []);
}

function cloneRepository(sourcePath: string, destinationPath: string): void {
  execFileSync("git", ["clone", "-q", sourcePath, destinationPath]);
}

function normalizeMacTemporaryPath(path: string): string {
  return path.replace(/^\/private(?=\/var\/folders\/)/, "");
}

describe("isolated provider execution", () => {
  it("allows an uncommitted execution decision as the only dirty source artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    project.execution_decision = "decision.yaml";
    await writeFile(join(project.path, "decision.yaml"), "state: READY\n");
    const cwdCapture = join(root, "provider-cwd.txt");
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      process.env.FAKE_CLAUDE_CAPTURE_CWD = cwdCapture;
      const result = await app.runLoopExecute(
        project.name,
        optionsFor([project]),
      );

      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["provider-created.txt"]);
      assert.notEqual((await readFile(cwdCapture, "utf8")).trim(), project.path);
      await assert.rejects(
        readFile(join(project.path, "provider-created.txt"), "utf8"),
      );
      assert.equal(
        execFileSync("git", ["status", "--porcelain=v1"], {
          cwd: project.path,
          encoding: "utf8",
        }).trim(),
        "?? decision.yaml",
      );
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_CWD;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects isolated execution when source WIP exists beyond the execution decision", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    project.execution_decision = "decision.yaml";
    await writeFile(join(project.path, "decision.yaml"), "state: READY\n");
    await writeFile(join(project.path, "README.md"), "source\nunfinished\n");
    await writeFile(join(project.path, "local-wip.txt"), "unfinished\n");
    const cwdCapture = join(root, "provider-cwd.txt");
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      process.env.FAKE_CLAUDE_CAPTURE_CWD = cwdCapture;
      const result = await app.runLoopExecute(
        project.name,
        optionsFor([project]),
      );

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "source_worktree_dirty");
      assert.equal(result.validation, null);
      assert.deepEqual(result.modifiedFiles, []);
      await assert.rejects(readFile(cwdCapture, "utf8"));
      assert.equal(
        execFileSync("git", ["status", "--porcelain=v1"], {
          cwd: project.path,
          encoding: "utf8",
        })
          .trim()
          .split("\n")
          .sort()
          .join("\n"),
        ["M README.md", "?? decision.yaml", "?? local-wip.txt"]
          .sort()
          .join("\n"),
      );
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_CWD;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs the provider and validation in one isolated worktree, then leaves the source unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const cwdCapture = join(root, "provider-cwd.txt");
    const validationCwdCapture = join(root, "validation-cwd.txt");
    project.validation = [
      `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
        `require("node:fs").writeFileSync(${JSON.stringify(validationCwdCapture)}, process.cwd())`,
      )}`,
    ];
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      process.env.FAKE_CLAUDE_CAPTURE_CWD = cwdCapture;
      const result = await app.runLoopExecute(
        project.name,
        optionsFor([project]),
      );

      const providerCwd = (await readFile(cwdCapture, "utf8")).trim();
      const validationCwd = (
        await readFile(validationCwdCapture, "utf8")
      ).trim();
      assert.equal(result.status, "completed");
      assert.equal(result.patchExport, undefined);
      assert.deepEqual(result.modifiedFiles, ["provider-created.txt"]);
      assert.notEqual(providerCwd, project.path);
      assert.ok(
        providerCwd.startsWith(`${await realpath(join(root, "workspaces"))}/`),
      );
      assert.equal(validationCwd, providerCwd);
      await assertCleanSource(project, "provider-created.txt");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_CWD;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("cleans the worktree and releases the lock after a provider failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const patchPath = join(root, "provider-failure.patch");
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "nonzero_exit_with_file";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        exportPatchPath: patchPath,
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "provider_failed");
      await assert.rejects(readFile(patchPath, "utf8"));
      await assertCleanSource(project, "provider-leftover.txt");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("blocks patch export when generated content violates the governed policy", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const patchPath = join(root, "content-policy-violation.patch");
    const app = application([project], root);
    let validatorCalls = 0;

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_forbidden_content";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        exportPatchPath: patchPath,
        planLoopCycle: (executionProject) => ({
          outcome: "ready" as const,
          candidate: candidate(),
          plannedSteps: ["Execute", "Validate"],
          snapshot: snapshot(executionProject),
          brief: {
            objective: "Write a documentation standard.",
            deliverables: ["provider-created.md"],
            outOfScope: ["Infrastructure configuration"],
            forbiddenContentTerms: ["docker"],
          },
        }),
        validator: async () => {
          validatorCalls += 1;
          return {
            status: "passed" as const,
            failedCommand: null,
            exitCode: 0,
            details: [],
          };
        },
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "content_policy_violation");
      assert.equal(result.validation, null);
      assert.equal(result.patchExport, undefined);
      assert.equal(validatorCalls, 0);
      await assert.rejects(readFile(patchPath, "utf8"));
      await assertCleanSource(project, "provider-created.md");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("cleans the worktree and releases the lock after validation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const patchPath = join(root, "validation-failure.patch");
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        exportPatchPath: patchPath,
        validator: async () => ({
          status: "failed",
          failedCommand: "test validation",
          exitCode: 1,
          details: ["expected failure"],
        }),
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "validation_failed");
      await assert.rejects(readFile(patchPath, "utf8"));
      await assertCleanSource(project, "provider-created.txt");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("quarantines an out-of-scope isolated provider delta before validation or patch export", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const patchPath = join(root, "scope-violation.patch");
    const app = application([project], root);
    let validatorCalls = 0;

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        planLoopCycle: (executionProject) => ({
          outcome: "ready" as const,
          candidate: candidate(),
          plannedSteps: ["Execute", "Validate"],
          snapshot: snapshot(executionProject),
          authorizedBy: "execution_decision" as const,
          allowedPaths: ["docs/platform/**"],
        }),
        exportPatchPath: patchPath,
        validator: async () => {
          validatorCalls += 1;
          return {
            status: "passed" as const,
            failedCommand: null,
            exitCode: 0,
            details: [],
          };
        },
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "scope_violation");
      assert.equal(result.validation, null);
      assert.equal(result.patchExport, undefined);
      assert.equal(validatorCalls, 0);
      await assert.rejects(readFile(patchPath, "utf8"));
      await assertCleanSource(project, "provider-created.txt");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps a deleted tracked file in the scoped Git inventory", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_deleted_file";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        planLoopCycle: (executionProject) => ({
          outcome: "ready" as const,
          candidate: candidate(),
          plannedSteps: ["Execute", "Validate"],
          snapshot: snapshot(executionProject),
          authorizedBy: "execution_decision" as const,
          allowedPaths: ["README.md"],
        }),
      });

      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, ["README.md"]);
      assert.equal(
        await readFile(join(project.path, "README.md"), "utf8"),
        "source\n",
      );
      assert.equal(
        execFileSync("git", ["status", "--porcelain=v1"], {
          cwd: project.path,
          encoding: "utf8",
        }),
        "",
      );
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("runs a bounded injected repairer in the provider and validator worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const providerCwdCapture = join(root, "provider-cwd.txt");
    const patchPath = join(root, "repair.patch");
    let validatorProjectPath: string | undefined;
    let repairerProjectPath: string | undefined;
    const app = application([project], root);

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      process.env.FAKE_CLAUDE_CAPTURE_CWD = providerCwdCapture;
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        maxRepairs: 1,
        exportPatchPath: patchPath,
        validator: async (input) => {
          validatorProjectPath = input.project.path;
          return input.attempt === 1
            ? {
                status: "failed",
                failedCommand: "test validation",
                exitCode: 1,
                details: ["expected first failure"],
              }
            : {
                status: "passed",
                failedCommand: null,
                exitCode: 0,
                details: ["repaired"],
              };
        },
        repairer: async (input) => {
          repairerProjectPath = input.project.path;
          await writeFile(
            join(input.project.path, "repair-created.txt"),
            "repair\n",
          );
          return {
            status: "completed",
            modifiedFiles: ["repair-created.txt"],
            details: ["repair completed"],
          };
        },
      });

      const providerCwd = (await readFile(providerCwdCapture, "utf8")).trim();
      assert.equal(result.status, "completed");
      assert.equal(result.patchExport?.fileCount, 2);
      assert.equal(result.patchExport?.path, patchPath);
      assert.match(await readFile(patchPath, "utf8"), /repair-created\.txt/);
      assert.notEqual(repairerProjectPath, project.path);
      assert.equal(
        normalizeMacTemporaryPath(repairerProjectPath ?? ""),
        normalizeMacTemporaryPath(providerCwd),
      );
      assert.equal(
        normalizeMacTemporaryPath(validatorProjectPath ?? ""),
        normalizeMacTemporaryPath(providerCwd),
      );
      await assertCleanSource(project, "provider-created.txt");
      await assertCleanSource(project, "repair-created.txt");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      delete process.env.FAKE_CLAUDE_CAPTURE_CWD;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("exports a validated patch that Git applies to the original baseline", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const patchPath = join(root, "validated.patch");
    const appliedPath = join(root, "applied");
    const app = application([project], root);
    const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: project.path,
      encoding: "utf8",
    }).trim();

    try {
      process.env.FAKE_CLAUDE_MODE = "success_with_modified_and_file";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        exportPatchPath: patchPath,
      });

      const patch = await readFile(patchPath);
      assert.equal(result.status, "completed");
      assert.deepEqual(result.modifiedFiles, [
        "README.md",
        "provider-created.txt",
      ]);
      assert.deepEqual(result.patchExport, {
        path: patchPath,
        sha256: createHash("sha256").update(patch).digest("hex"),
        fileCount: 2,
        baseSha: sourceHead,
      });
      assert.equal(
        await readFile(join(project.path, "README.md"), "utf8"),
        "source\n",
      );
      await assertCleanSource(project, "provider-created.txt");
      assert.equal(
        execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: project.path,
          encoding: "utf8",
        }).trim(),
        sourceHead,
      );
      cloneRepository(project.path, appliedPath);
      execFileSync("git", ["apply", "--check", patchPath], {
        cwd: appliedPath,
      });
      execFileSync("git", ["apply", patchPath], { cwd: appliedPath });
      assert.equal(
        await readFile(join(appliedPath, "README.md"), "utf8"),
        "source\nmodified\n",
      );
      assert.equal(
        await readFile(join(appliedPath, "provider-created.txt"), "utf8"),
        "created\n",
      );
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails closed without overwriting an existing patch destination", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const patchPath = join(root, "existing.patch");
    const app = application([project], root);

    try {
      await writeFile(patchPath, "existing\n");
      process.env.FAKE_CLAUDE_MODE = "success_with_file";
      const result = await app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        exportPatchPath: patchPath,
      });

      assert.equal(result.status, "failed");
      assert.equal(result.failure?.code, "patch_export_destination_exists");
      assert.equal(result.patchExport, null);
      assert.equal(await readFile(patchPath, "utf8"), "existing\n");
      await assertCleanSource(project, "provider-created.txt");
      await assertNoOrphans(root);
    } finally {
      delete process.env.FAKE_CLAUDE_MODE;
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects a concurrent attempt for the same project without orphaning a worktree", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const project = await createRepository(root, "source");
    const app = application([project], root);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    let started: (() => void) | undefined;
    const startedExecution = new Promise<void>((resolveStarted) => {
      started = resolveStarted;
    });

    try {
      const first = app.runLoopExecute(project.name, {
        ...optionsFor([project]),
        executor: async () => {
          started?.();
          await gate;
          return { status: "completed", modifiedFiles: [], details: [] };
        },
        validator: async () => ({
          status: "passed",
          failedCommand: null,
          exitCode: 0,
          details: [],
        }),
      });
      await startedExecution;
      const second = await app.runLoopExecute(
        project.name,
        optionsFor([project]),
      );
      release?.();
      const firstResult = await first;

      assert.equal(firstResult.status, "completed");
      assert.equal(second.status, "failed");
      assert.equal(second.failure?.code, "project_locked");
      await assertNoOrphans(root);
    } finally {
      release?.();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("allows distinct projects to run in distinct isolated worktrees", async () => {
    const root = await mkdtemp(join(tmpdir(), "loop-isolated-provider-"));
    const firstProject = await createRepository(root, "first-source");
    const secondProject = await createRepository(root, "second-source");
    const app = application([firstProject, secondProject], root);
    const observedPaths: string[] = [];

    try {
      const executor = async (
        _plan: Parameters<NonNullable<LoopRunExecuteOptions["executor"]>>[0],
        cwd: string,
      ) => {
        observedPaths.push(cwd);
        return { status: "completed" as const, modifiedFiles: [], details: [] };
      };
      const validator = async () => ({
        status: "passed" as const,
        failedCommand: null,
        exitCode: 0,
        details: [],
      });
      const [first, second] = await Promise.all([
        app.runLoopExecute(firstProject.name, {
          ...optionsFor([firstProject, secondProject]),
          executor,
          validator,
        }),
        app.runLoopExecute(secondProject.name, {
          ...optionsFor([firstProject, secondProject]),
          executor,
          validator,
        }),
      ]);

      assert.equal(first.status, "completed");
      assert.equal(second.status, "completed");
      assert.equal(new Set(observedPaths).size, 2);
      assert.ok(
        observedPaths.every((path) =>
          path.startsWith(`${join(root, "workspaces")}/`),
        ),
      );
      await assertNoOrphans(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
