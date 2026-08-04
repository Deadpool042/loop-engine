// Shared execution path for the fixed, hard-coded Loop CLI JSON commands
// (context, prompt, review, run --mode plan). Each caller supplies its own
// literal args array and parser — this module never builds a command,
// executable, or mode from caller-supplied data beyond repoPath/projectName.
import { join } from "node:path";

import type { ProcessRunner } from "./process-runner.js";

export async function runLoopCliJsonCommand<T>(
  runner: ProcessRunner,
  repoPath: string,
  projectName: string,
  args: readonly string[],
  parse: (raw: string) => T,
  commandLabel: string,
): Promise<T> {
  if (typeof repoPath !== "string" || repoPath.trim().length === 0) {
    throw new TypeError("repoPath must be a non-empty string");
  }

  if (typeof projectName !== "string" || projectName.trim().length === 0) {
    throw new TypeError("projectName must be a non-empty string");
  }

  const executable = join(
    repoPath,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );

  const result = await runner.run({
    executable,
    args,
    cwd: repoPath,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() ||
        `Loop CLI ${commandLabel} failed with exit code ${result.exitCode}`,
    );
  }

  return parse(result.stdout.trim());
}
