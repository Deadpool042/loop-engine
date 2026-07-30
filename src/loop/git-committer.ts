import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { ProjectConfig } from "../core/config.js";

export type LoopCommitResult =
  | Readonly<{ committed: true; sha: string; message: string }>
  | Readonly<{ committed: false; code: string; message: string }>;

export type LoopCommitter = (input: Readonly<{
  project: ProjectConfig;
  modifiedFiles: readonly string[];
  message: string;
}>) => Promise<LoopCommitResult>;

function runGit(cwd: string, args: readonly string[]): Promise<Readonly<{ code: number; stdout: string }>> {
  return new Promise((resolvePromise) => {
    const child = spawn("git", [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let settled = false;
    const settle = (code: number): void => {
      if (settled) return;
      settled = true;
      resolvePromise(Object.freeze({ code, stdout: stdout.trim() }));
    };
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length < 16_384) stdout += chunk.toString("utf8");
    });
    child.once("error", () => settle(127));
    child.once("close", (code) => settle(code ?? 1));
  });
}

function isSafeRelativePath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.split(/[\\/]+/).includes("..");
}

export const gitLoopCommitter: LoopCommitter = async (input) => {
  const message = input.message.trim();
  if (message.length === 0) {
    return Object.freeze({ committed: false as const, code: "invalid_commit_message", message: "Commit message must be non-empty." });
  }
  const files = [...new Set(input.modifiedFiles.map((file) => file.trim()))]
    .filter(isSafeRelativePath)
    .sort();
  if (files.length === 0 || files.length !== input.modifiedFiles.length) {
    return Object.freeze({ committed: false as const, code: "invalid_modified_files", message: "Controlled commit requires an exact non-empty safe file list." });
  }

  const cwd = resolve(input.project.path);
  const add = await runGit(cwd, ["add", "--", ...files]);
  if (add.code !== 0) {
    return Object.freeze({ committed: false as const, code: "git_add_failed", message: "Unable to stage the validated files." });
  }
  const commit = await runGit(cwd, ["commit", "--no-verify", "-m", message, "--", ...files]);
  if (commit.code !== 0) {
    return Object.freeze({ committed: false as const, code: "git_commit_failed", message: "Unable to create the controlled commit." });
  }
  const rev = await runGit(cwd, ["rev-parse", "HEAD"]);
  if (rev.code !== 0 || !/^[a-f0-9]{40}$/.test(rev.stdout)) {
    return Object.freeze({ committed: false as const, code: "git_revision_failed", message: "Commit was created but its revision could not be verified." });
  }
  return Object.freeze({ committed: true as const, sha: rev.stdout, message });
};
