import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export type WorktreeStatus = {
  readonly clean: boolean;
  readonly files: readonly string[];
};

export function evaluateWorktreeStatus(
  porcelainOutput: string,
): WorktreeStatus {
  const files = porcelainOutput
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  return {
    clean: files.length === 0,
    files,
  };
}

function readWorktreeStatus(): string {
  return execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  );
}

function main(): void {
  const output = readWorktreeStatus();
  const status = evaluateWorktreeStatus(output);

  if (!status.clean) {
    console.error(
      "Worktree is not clean. Commit, stash, or ignore the following files before tagging an audit release:",
    );
    for (const file of status.files) {
      console.error(`  ${file}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Worktree is clean. Safe to proceed with the audit release tag.");
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
