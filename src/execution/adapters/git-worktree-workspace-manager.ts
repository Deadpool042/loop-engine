import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  createWorkspaceManager,
  type WorkspaceHandle,
  type WorkspaceManager,
} from "../workspace-manager.js";

const execFileAsync = promisify(execFile);

export class SourceWorktreePreflightError extends Error {
  readonly code: "source_worktree_dirty" | "source_worktree_inspection_failed";

  constructor(
    code: "source_worktree_dirty" | "source_worktree_inspection_failed",
  ) {
    super(
      code === "source_worktree_dirty"
        ? "Source worktree contains changes outside the allowed control artifacts."
        : "Source worktree could not be inspected before isolated execution.",
    );
    this.name = "SourceWorktreePreflightError";
    this.code = code;
  }
}

function encodeSegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

async function runGit(
  repositoryPath: string,
  args: readonly string[],
): Promise<void> {
  await execFileAsync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  });
}

async function readGitPaths(
  repositoryPath: string,
  args: readonly string[],
): Promise<readonly string[]> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repositoryPath,
      encoding: "utf8",
    });
    return Object.freeze(
      stdout
        .split("\0")
        .filter((path) => path.length > 0),
    );
  } catch {
    throw new SourceWorktreePreflightError(
      "source_worktree_inspection_failed",
    );
  }
}

async function assertSourceWorktreeReady(
  repositoryPath: string,
  allowedSourceDirtyPaths: readonly string[],
): Promise<void> {
  const [tracked, untracked] = await Promise.all([
    readGitPaths(repositoryPath, [
      "diff",
      "--name-only",
      "-z",
      "HEAD",
      "--",
    ]),
    readGitPaths(repositoryPath, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
    ]),
  ]);
  const allowed = new Set(allowedSourceDirtyPaths);
  const unexpected = [...new Set([...tracked, ...untracked])].filter(
    (path) => !allowed.has(path),
  );
  if (unexpected.length > 0) {
    throw new SourceWorktreePreflightError("source_worktree_dirty");
  }
}

export type GitWorktreeWorkspaceManagerOptions = Readonly<{
  workspaceRoot: string;
  resolveRepositoryPath(projectId: string): string;
  baseRef?: string;
}>;

export function createGitWorktreeWorkspaceManager(
  options: GitWorktreeWorkspaceManagerOptions,
): WorkspaceManager {
  const repositoriesByWorkspaceId = new Map<string, string>();

  return createWorkspaceManager(
    async (request) => {
      const { projectId, attemptId } = request;
      await mkdir(options.workspaceRoot, { recursive: true });
      const workspaceId = `${encodeSegment(projectId)}.${encodeSegment(attemptId)}`;
      const path = join(options.workspaceRoot, workspaceId);
      const repositoryPath = options.resolveRepositoryPath(projectId);
      const baseRef = options.baseRef ?? "HEAD";

      await assertSourceWorktreeReady(
        repositoryPath,
        request.allowedSourceDirtyPaths ?? [],
      );

      try {
        await runGit(repositoryPath, [
          "worktree",
          "add",
          "--detach",
          path,
          baseRef,
        ]);
      } catch (error) {
        await rm(path, { recursive: true, force: true });
        throw error;
      }

      repositoriesByWorkspaceId.set(workspaceId, repositoryPath);

      const handle: WorkspaceHandle = Object.freeze({
        workspaceId,
        projectId,
        attemptId,
        path,
      });

      return handle;
    },
    async (workspace) => {
      const repositoryPath = repositoriesByWorkspaceId.get(
        workspace.workspaceId,
      );
      if (repositoryPath === undefined) {
        return;
      }

      try {
        await runGit(repositoryPath, [
          "worktree",
          "remove",
          "--force",
          workspace.path,
        ]);
      } finally {
        repositoriesByWorkspaceId.delete(workspace.workspaceId);
        await rm(workspace.path, { recursive: true, force: true });
      }
    },
  );
}
