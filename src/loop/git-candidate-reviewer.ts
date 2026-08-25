import { spawn } from "node:child_process";
import { resolve } from "node:path";

import type { ProjectConfig } from "../core/config.js";
import type { LoopRunPublication } from "./types.js";

const SHA = /^[a-f0-9]{40}$/;
const SAFE_REF_COMPONENT = /^[a-z0-9][a-z0-9._-]*$/;

export type CandidateReviewFileStatus = "added" | "modified" | "deleted";
export type CandidateReview = Readonly<{
  schemaVersion: 1;
  project: string;
  runId: string;
  candidateRef: string;
  candidateCommitSha: string;
  baseSha: string;
  commit: Readonly<{ subject: string; authorName: string; authoredAt: string }>;
  changedFiles: readonly Readonly<{
    path: string;
    status: CandidateReviewFileStatus;
    additions: number | null;
    deletions: number | null;
  }>[];
  additions: number;
  deletions: number;
}>;

export type CandidateReviewResult =
  | Readonly<{ reviewed: true; review: CandidateReview }>
  | Readonly<{ reviewed: false; code: string; message: string }>;

export type CandidateReviewer = (
  input: Readonly<{
    project: ProjectConfig;
    runId: string;
    publication: LoopRunPublication;
  }>,
) => Promise<CandidateReviewResult>;

type GitResult = Readonly<{ code: number; stdout: string }>;

function runGit(cwd: string, args: readonly string[]): Promise<GitResult> {
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
      resolvePromise(Object.freeze({ code, stdout }));
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 1_048_576) stdout += chunk.toString("utf8");
    });
    child.once("error", () => settle(127));
    child.once("close", (code) => settle(code ?? 1));
  });
}

function failed(code: string, message: string): CandidateReviewResult {
  return Object.freeze({ reviewed: false, code, message });
}

function expectedRef(project: string, runId: string): string | null {
  if (!validRefComponent(project) || !validRefComponent(runId)) return null;
  return `refs/loop-engine/candidates/${project}/${runId}`;
}

function validRefComponent(value: string): boolean {
  return (
    SAFE_REF_COMPONENT.test(value) &&
    !value.includes("..") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock")
  );
}

function parseNameStatus(value: string):
  | readonly Readonly<{
      path: string;
      status: CandidateReviewFileStatus;
    }>[]
  | null {
  const tokens = value.split("\0").filter(Boolean);
  if (tokens.length % 2 !== 0) return null;
  const files: { path: string; status: CandidateReviewFileStatus }[] = [];
  for (let index = 0; index < tokens.length; index += 2) {
    const rawStatus = tokens[index] ?? "";
    const path = tokens[index + 1] ?? "";
    const status =
      rawStatus === "A"
        ? "added"
        : rawStatus === "M"
          ? "modified"
          : rawStatus === "D"
            ? "deleted"
            : null;
    if (!status || path.length === 0) return null;
    files.push({ path, status });
  }
  return Object.freeze(files);
}

function parseNumstat(
  value: string,
): ReadonlyMap<
  string,
  Readonly<{ additions: number | null; deletions: number | null }>
> | null {
  const entries = new Map<
    string,
    Readonly<{ additions: number | null; deletions: number | null }>
  >();
  for (const token of value.split("\0").filter(Boolean)) {
    const first = token.indexOf("\t");
    const second = token.indexOf("\t", first + 1);
    if (first < 1 || second < first + 2) return null;
    const additions = token.slice(0, first);
    const deletions = token.slice(first + 1, second);
    const path = token.slice(second + 1);
    if (path.length === 0 || entries.has(path)) return null;
    const parse = (value: string): number | null =>
      value === "-" ? null : /^\d+$/.test(value) ? Number(value) : NaN;
    const parsedAdditions = parse(additions);
    const parsedDeletions = parse(deletions);
    if (Number.isNaN(parsedAdditions) || Number.isNaN(parsedDeletions))
      return null;
    entries.set(
      path,
      Object.freeze({ additions: parsedAdditions, deletions: parsedDeletions }),
    );
  }
  return entries;
}

/**
 * Reads the Git objects published by V33. It only accepts the ref and SHAs
 * already recorded for one completed publish run, and never changes refs,
 * worktree files, index, or HEAD.
 */
export const gitCandidateReviewer: CandidateReviewer = async (input) => {
  const ref = expectedRef(input.project.name, input.runId);
  const publication = input.publication;
  if (
    !ref ||
    publication.kind !== "candidate_ref" ||
    publication.ref !== ref ||
    !SHA.test(publication.commitSha) ||
    !SHA.test(publication.baseSha)
  )
    return failed(
      "candidate_identity_incoherent",
      "Candidate publication identity is incoherent.",
    );

  const cwd = resolve(input.project.path);
  const repository = await runGit(cwd, ["rev-parse", "--git-dir"]);
  if (repository.code !== 0 || repository.stdout.trim().length === 0)
    return failed(
      "candidate_git_inspection_failed",
      "Candidate Git repository could not be inspected.",
    );
  const resolvedRef = await runGit(cwd, ["rev-parse", "--verify", ref]);
  if (
    resolvedRef.code !== 0 ||
    resolvedRef.stdout.trim() !== publication.commitSha
  )
    return failed("candidate_ref_stale", "Candidate ref is missing or moved.");

  const parents = await runGit(cwd, [
    "rev-list",
    "--parents",
    "-n",
    "1",
    publication.commitSha,
  ]);
  const parentParts = parents.stdout.trim().split(" ");
  if (
    parents.code !== 0 ||
    parentParts.length !== 2 ||
    parentParts[0] !== publication.commitSha ||
    parentParts[1] !== publication.baseSha
  )
    return failed(
      "candidate_parent_mismatch",
      "Candidate commit is not parented by the expected base SHA.",
    );

  const [nameStatus, numstat, metadata] = await Promise.all([
    runGit(cwd, [
      "diff-tree",
      "--no-commit-id",
      "--no-renames",
      "--name-status",
      "-r",
      "-z",
      publication.baseSha,
      publication.commitSha,
    ]),
    runGit(cwd, [
      "diff",
      "--no-renames",
      "--numstat",
      "-z",
      publication.baseSha,
      publication.commitSha,
    ]),
    runGit(cwd, [
      "show",
      "-s",
      "--format=%s%x00%an%x00%aI",
      publication.commitSha,
    ]),
  ]);
  const files =
    nameStatus.code === 0 ? parseNameStatus(nameStatus.stdout) : null;
  const stats = numstat.code === 0 ? parseNumstat(numstat.stdout) : null;
  const commit = metadata.stdout.trimEnd().split("\0");
  if (
    !files ||
    !stats ||
    files.length === 0 ||
    files.length !== stats.size ||
    files.some((file) => !stats.has(file.path)) ||
    metadata.code !== 0 ||
    commit.length !== 3 ||
    commit.some((value) => value.length === 0)
  )
    return failed(
      "candidate_review_failed",
      "Candidate Git diff could not be inspected coherently.",
    );

  const changedFiles = files.map((file) => {
    const stat = stats.get(file.path)!;
    return Object.freeze({ ...file, ...stat });
  });
  const additions = changedFiles.reduce(
    (total, file) => total + (file.additions ?? 0),
    0,
  );
  const deletions = changedFiles.reduce(
    (total, file) => total + (file.deletions ?? 0),
    0,
  );
  return Object.freeze({
    reviewed: true,
    review: Object.freeze({
      schemaVersion: 1,
      project: input.project.name,
      runId: input.runId,
      candidateRef: ref,
      candidateCommitSha: publication.commitSha,
      baseSha: publication.baseSha,
      commit: Object.freeze({
        subject: commit[0]!,
        authorName: commit[1]!,
        authoredAt: commit[2]!,
      }),
      changedFiles: Object.freeze(changedFiles),
      additions,
      deletions,
    }),
  });
};
