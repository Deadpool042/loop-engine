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
    async ({ projectId, attemptId }) => {
      await mkdir(options.workspaceRoot, { recursive: true });
      const workspaceId = `${encodeSegment(projectId)}.${encodeSegment(attemptId)}`;
      const path = join(options.workspaceRoot, workspaceId);
      const repositoryPath = options.resolveRepositoryPath(projectId);
      const baseRef = options.baseRef ?? "HEAD";

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
