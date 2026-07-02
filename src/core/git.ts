import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function runGitCommand(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

export function isGitRepository(path: string): boolean {
  return existsSync(resolve(path, ".git"));
}

export function getGitBranch(path: string): string {
  return runGitCommand("git branch --show-current", path);
}

export function getGitState(path: string): "clean" | "dirty" {
  const status = runGitCommand("git status --short", path);
  return status.length === 0 ? "clean" : "dirty";
}
