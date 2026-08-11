import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { createGitWorktreeWorkspaceManager } from "./git-worktree-workspace-manager.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return result.stdout.trim();
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function createRepository(root: string): Promise<string> {
  const repositoryPath = join(root, "repository");
  await mkdir(repositoryPath, { recursive: true });
  await git(repositoryPath, "init");
  await writeFile(join(repositoryPath, "README.md"), "baseline\n", "utf8");
  await git(repositoryPath, "add", "README.md");
  await git(
    repositoryPath,
    "-c",
    "user.name=Loop Engine Test",
    "-c",
    "user.email=loop-engine@example.invalid",
    "commit",
    "-m",
    "initial",
  );
  return repositoryPath;
}

test("materializes a detached Git worktree and removes it deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "loop-git-worktree-"));
  const workspaceRoot = join(root, "workspaces");
  await mkdir(workspaceRoot);

  try {
    const repositoryPath = await createRepository(root);
    const manager = createGitWorktreeWorkspaceManager({
      workspaceRoot,
      resolveRepositoryPath: (projectId) => {
        assert.equal(projectId, "project-a");
        return repositoryPath;
      },
    });

    const workspace = await manager.allocate({
      projectId: "project-a",
      attemptId: "attempt-1",
    });

    assert.equal(await pathExists(workspace.path), true);
    assert.equal(await readFile(join(workspace.path, "README.md"), "utf8"), "baseline\n");
    assert.equal(await git(workspace.path, "branch", "--show-current"), "");

    const listedBeforeRelease = await git(repositoryPath, "worktree", "list", "--porcelain");
    assert.match(listedBeforeRelease, new RegExp(workspace.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    await manager.release(workspace);

    assert.equal(await pathExists(workspace.path), false);
    const listedAfterRelease = await git(repositoryPath, "worktree", "list", "--porcelain");
    assert.equal(listedAfterRelease.includes(workspace.path), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supports isolated worktrees for unrelated projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "loop-git-worktree-"));
  const workspaceRoot = join(root, "workspaces");
  await mkdir(workspaceRoot);

  try {
    const repositoryA = await createRepository(join(root, "a"));
    const repositoryB = await createRepository(join(root, "b"));
    const repositories = new Map([
      ["project-a", repositoryA],
      ["project-b", repositoryB],
    ]);

    const manager = createGitWorktreeWorkspaceManager({
      workspaceRoot,
      resolveRepositoryPath: (projectId) => {
        const repositoryPath = repositories.get(projectId);
        if (repositoryPath === undefined) {
          throw new Error(`Unknown project: ${projectId}`);
        }
        return repositoryPath;
      },
    });

    const [first, second] = await Promise.all([
      manager.allocate({ projectId: "project-a", attemptId: "attempt-1" }),
      manager.allocate({ projectId: "project-b", attemptId: "attempt-1" }),
    ]);

    assert.notEqual(first.path, second.path);
    assert.equal(await pathExists(join(first.path, "README.md")), true);
    assert.equal(await pathExists(join(second.path, "README.md")), true);

    await Promise.all([manager.release(first), manager.release(second)]);
    assert.equal(await pathExists(first.path), false);
    assert.equal(await pathExists(second.path), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
