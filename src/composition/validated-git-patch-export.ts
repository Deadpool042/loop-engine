import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type { LoopRunPatchExport } from "../loop/types.js";

export type ValidatedGitPatchExportErrorCode =
  "patch_export_destination_exists" | "patch_export_failed";

export class ValidatedGitPatchExportError extends Error {
  constructor(
    readonly code: ValidatedGitPatchExportErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function runGit(
  worktreePath: string,
  args: readonly string[],
): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", [...args], {
      cwd: worktreePath,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolvePromise(Buffer.concat(chunks));
      else reject(new Error("Git patch generation failed."));
    });
  });
}

function pathsFromNullDelimited(output: Buffer): readonly string[] {
  return Object.freeze(
    output
      .toString("utf8")
      .split("\0")
      .filter((path) => path.length > 0)
      .sort(),
  );
}

function hasSamePaths(
  expected: readonly string[],
  actual: readonly string[],
): boolean {
  return (
    expected.length === actual.length &&
    expected.every((path, index) => path === actual[index])
  );
}

function fullGitSha(output: Buffer): string | null {
  const value = output.toString("utf8").trim();
  return /^[0-9a-f]{40}$/i.test(value) ? value : null;
}

/**
 * Exports the exact validated worktree delta using Git's native binary patch
 * format. Intent-to-add entries are local to the disposable worktree and make
 * untracked files visible to `git diff --binary HEAD` without a commit.
 */
export async function exportValidatedGitPatch(
  input: Readonly<{
    worktreePath: string;
    destinationPath: string;
    modifiedFiles: readonly string[];
  }>,
): Promise<LoopRunPatchExport> {
  const destinationPath = resolve(input.destinationPath);
  const temporaryPath = join(
    dirname(destinationPath),
    `.loop-engine-patch-${randomUUID()}.tmp`,
  );

  try {
    const baseSha = fullGitSha(
      await runGit(input.worktreePath, ["rev-parse", "--verify", "HEAD"]),
    );
    if (baseSha === null) {
      throw new ValidatedGitPatchExportError(
        "patch_export_failed",
        "Unable to determine the isolated worktree base revision.",
      );
    }
    await runGit(input.worktreePath, ["add", "--intent-to-add", "--", "."]);
    const [patch, changedPathsOutput] = await Promise.all([
      runGit(input.worktreePath, ["diff", "--binary", "HEAD"]),
      runGit(input.worktreePath, ["diff", "--name-only", "-z", "HEAD"]),
    ]);
    const changedPaths = pathsFromNullDelimited(changedPathsOutput);
    const modifiedFiles = Object.freeze(
      [...new Set(input.modifiedFiles.map((path) => path.trim()))]
        .filter((path) => path.length > 0)
        .sort(),
    );

    if (!hasSamePaths(modifiedFiles, changedPaths)) {
      throw new ValidatedGitPatchExportError(
        "patch_export_failed",
        "Validated modified files do not match the Git worktree delta.",
      );
    }

    try {
      await writeFile(temporaryPath, patch, { flag: "wx" });
      await link(temporaryPath, destinationPath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "EEXIST"
      ) {
        throw new ValidatedGitPatchExportError(
          "patch_export_destination_exists",
          "Patch export destination already exists.",
        );
      }
      throw new ValidatedGitPatchExportError(
        "patch_export_failed",
        "Unable to export the validated Git patch.",
      );
    }

    return Object.freeze({
      path: destinationPath,
      sha256: createHash("sha256").update(patch).digest("hex"),
      fileCount: changedPaths.length,
      baseSha,
    });
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
