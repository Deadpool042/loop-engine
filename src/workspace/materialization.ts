import { execFileSync } from "node:child_process";
import { existsSync, statfsSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import type { Config, ProjectConfig } from "../core/config.js";

const DEFAULT_MIN_FREE_DISK_GIB = 20;
const GIB = 1024 ** 3;
const GITHUB_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export type WorkspaceMaterializationResult = Readonly<{
  schemaVersion: 1;
  project: string;
  mode: "permanent" | "source_only" | "on_demand" | "none";
  dependencies: "none" | "on_demand" | "production";
  path: string;
  repository: string | null;
  status:
    | "materialized"
    | "synchronized"
    | "already_present"
    | "skipped"
    | "failed";
  reason?:
    | "mode_none"
    | "repository_not_configured"
    | "invalid_repository"
    | "path_outside_workspace"
    | "low_disk_space"
    | "existing_path_not_git"
    | "dirty_worktree"
    | "branch_not_main"
    | "origin_mismatch"
    | "git_operation_failed";
  freeDiskGiB?: number;
  minFreeDiskGiB?: number;
}>;

function command(args: readonly string[], cwd?: string): string {
  return execFileSync("git", args, {
    ...(cwd === undefined ? {} : { cwd }),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

function expectedOrigins(repository: string): readonly string[] {
  return [
    `git@github.com:${repository}.git`,
    `https://github.com/${repository}.git`,
  ];
}

function diskFreeGiB(path: string): number {
  const stats = statfsSync(path);
  return (Number(stats.bavail) * Number(stats.bsize)) / GIB;
}

function isDirectWorkspaceChild(workspaceRoot: string, target: string): boolean {
  const rel = relative(workspaceRoot, target);
  return (
    rel.length > 0 &&
    !rel.startsWith(`..${sep}`) &&
    rel !== ".." &&
    dirname(target) === workspaceRoot
  );
}

export function materializeWorkspaceProject(
  config: Config,
  project: ProjectConfig,
): WorkspaceMaterializationResult {
  const mode = project.workspace?.mode ?? "permanent";
  const dependencies = project.workspace?.dependencies ?? "none";
  const target = resolve(project.path);
  const workspaceRoot = resolve(process.cwd(), "..");
  const repository = project.repository ?? null;
  const base = {
    schemaVersion: 1 as const,
    project: project.name,
    mode,
    dependencies,
    path: target,
    repository,
  };

  if (mode === "none") {
    return { ...base, status: "skipped", reason: "mode_none" };
  }
  if (repository === null) {
    return { ...base, status: "failed", reason: "repository_not_configured" };
  }
  if (!GITHUB_REPOSITORY.test(repository)) {
    return { ...base, status: "failed", reason: "invalid_repository" };
  }
  if (!isDirectWorkspaceChild(workspaceRoot, target)) {
    return { ...base, status: "failed", reason: "path_outside_workspace" };
  }

  if (existsSync(target)) {
    if (!existsSync(resolve(target, ".git"))) {
      return { ...base, status: "failed", reason: "existing_path_not_git" };
    }
    try {
      if (command(["status", "--porcelain"], target).length > 0) {
        return { ...base, status: "failed", reason: "dirty_worktree" };
      }
      if (command(["branch", "--show-current"], target) !== "main") {
        return { ...base, status: "failed", reason: "branch_not_main" };
      }
      const origin = command(["remote", "get-url", "origin"], target);
      if (!expectedOrigins(repository).includes(origin)) {
        return { ...base, status: "failed", reason: "origin_mismatch" };
      }
      command(
        ["fetch", "--no-tags", "--no-recurse-submodules", "origin", "main"],
        target,
      );
      const before = command(["rev-parse", "HEAD"], target);
      command(["merge", "--ff-only", "refs/remotes/origin/main"], target);
      const after = command(["rev-parse", "HEAD"], target);
      return {
        ...base,
        status: before === after ? "already_present" : "synchronized",
      };
    } catch {
      return { ...base, status: "failed", reason: "git_operation_failed" };
    }
  }

  const minFreeDiskGiB =
    config.workspace_policy?.min_free_disk_gib ?? DEFAULT_MIN_FREE_DISK_GIB;
  const freeDiskGiB = diskFreeGiB(workspaceRoot);
  if (freeDiskGiB < minFreeDiskGiB) {
    return {
      ...base,
      status: "failed",
      reason: "low_disk_space",
      freeDiskGiB,
      minFreeDiskGiB,
    };
  }

  try {
    command(
      [
        "clone",
        "--branch",
        "main",
        "--single-branch",
        "--no-tags",
        `git@github.com:${repository}.git`,
        target,
      ],
      workspaceRoot,
    );
    return {
      ...base,
      status: "materialized",
      freeDiskGiB,
      minFreeDiskGiB,
    };
  } catch {
    return { ...base, status: "failed", reason: "git_operation_failed" };
  }
}
