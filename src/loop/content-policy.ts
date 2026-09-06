import { spawn } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { LoopExecutionPlan } from "./execution-plan.js";

export type ContentPolicyInspection =
  | Readonly<{ outcome: "compliant" }>
  | Readonly<{ outcome: "violation" }>
  | Readonly<{ outcome: "uninspectable" }>;

const GIT_TIMEOUT_MS = 10_000;
const MAX_GIT_OUTPUT_BYTES = 4 * 1024 * 1024;

function isInsideWorktree(cwd: string, path: string): boolean {
  return path.startsWith(`${cwd}${sep}`);
}

type GitResult = Readonly<{
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
  truncated: boolean;
}>;

function runGit(
  cwd: string,
  args: readonly string[],
  maxOutputBytes = MAX_GIT_OUTPUT_BYTES,
): Promise<GitResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("git", [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    let observedBytes = 0;
    let timedOut = false;
    let truncated = false;
    let settled = false;

    const settle = (exitCode: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(
        Object.freeze({ exitCode, stdout, timedOut, truncated }),
      );
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, GIT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      if (observedBytes >= maxOutputBytes) {
        truncated = true;
        child.kill("SIGTERM");
        return;
      }
      const remaining = maxOutputBytes - observedBytes;
      const bounded = chunk.subarray(0, remaining);
      stdout += bounded.toString("utf8");
      observedBytes += bounded.byteLength;
      if (bounded.byteLength < chunk.byteLength) {
        truncated = true;
        child.kill("SIGTERM");
      }
    });

    child.once("error", () => settle(null));
    child.once("close", (code) => settle(code));
  });
}

type HeadContent =
  | Readonly<{ outcome: "found"; content: string }>
  | Readonly<{ outcome: "absent" }>
  | Readonly<{ outcome: "error" }>;

async function readHeadContent(cwd: string, file: string): Promise<HeadContent> {
  const head = await runGit(cwd, ["rev-parse", "--verify", "HEAD"], 1024);
  if (head.timedOut || head.truncated || head.exitCode === null) {
    return Object.freeze({ outcome: "error" as const });
  }
  if (head.exitCode !== 0) {
    return Object.freeze({ outcome: "absent" as const });
  }

  const tree = await runGit(cwd, ["ls-tree", "-z", "HEAD", "--", file], 8192);
  if (
    tree.timedOut ||
    tree.truncated ||
    tree.exitCode === null ||
    tree.exitCode !== 0
  ) {
    return Object.freeze({ outcome: "error" as const });
  }
  if (tree.stdout.length === 0) {
    return Object.freeze({ outcome: "absent" as const });
  }

  const match = /^[0-7]{6} blob ([0-9a-f]{40,64})\t/.exec(tree.stdout);
  const objectId = match?.[1];
  if (!objectId) {
    return Object.freeze({ outcome: "error" as const });
  }

  const blob = await runGit(cwd, ["cat-file", "blob", objectId]);
  if (
    blob.timedOut ||
    blob.truncated ||
    blob.exitCode === null ||
    blob.exitCode !== 0
  ) {
    return Object.freeze({ outcome: "error" as const });
  }
  return Object.freeze({
    outcome: "found" as const,
    content: blob.stdout,
  });
}

function countOccurrences(content: string, term: string): number {
  if (term.length === 0) return Number.POSITIVE_INFINITY;
  let count = 0;
  let offset = 0;
  while (offset <= content.length - term.length) {
    const index = content.indexOf(term, offset);
    if (index < 0) break;
    count += 1;
    offset = index + term.length;
  }
  return count;
}

/**
 * Deterministically inspects every current, regular modified file against the
 * project-owned literal content policy.
 *
 * Pre-existing occurrences in the immutable HEAD version are tolerated, but
 * the provider may not increase their count. New files therefore start with a
 * zero-occurrence baseline. This keeps the guard focused on generated content
 * instead of rejecting unrelated legacy documentation that already mentions a
 * forbidden literal. Deleted files have no generated content to inspect.
 *
 * Public execution diagnostics never expose the matched terms. Any unreadable,
 * non-regular or ambiguously versioned modified entry fails closed while a
 * content policy is active.
 */
export async function inspectWorktreeContentPolicy(
  plan: LoopExecutionPlan,
  cwd: string,
  modifiedFiles: readonly string[],
): Promise<ContentPolicyInspection> {
  const terms = plan.brief?.forbiddenContentTerms;
  if (terms === undefined || terms.length === 0) {
    return Object.freeze({ outcome: "compliant" });
  }

  const normalizedTerms = terms.map((term) =>
    term.toLocaleLowerCase("en-US"),
  );
  for (const file of modifiedFiles) {
    const path = resolve(cwd, file);
    if (!isInsideWorktree(cwd, path)) {
      return Object.freeze({ outcome: "uninspectable" });
    }

    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        return Object.freeze({ outcome: "uninspectable" });
      }

      const head = await readHeadContent(cwd, file);
      if (head.outcome === "error") {
        return Object.freeze({ outcome: "uninspectable" });
      }

      const currentContent = (await readFile(path, "utf8")).toLocaleLowerCase(
        "en-US",
      );
      const baselineContent =
        head.outcome === "found"
          ? head.content.toLocaleLowerCase("en-US")
          : "";

      if (
        normalizedTerms.some(
          (term) =>
            countOccurrences(currentContent, term) >
            countOccurrences(baselineContent, term),
        )
      ) {
        return Object.freeze({ outcome: "violation" });
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      return Object.freeze({ outcome: "uninspectable" });
    }
  }

  return Object.freeze({ outcome: "compliant" });
}
