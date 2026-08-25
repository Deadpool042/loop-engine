import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import type { ProjectConfig } from "../core/config.js";
import type { LoopRunPublication } from "./types.js";

const SHA = /^[a-f0-9]{40}$/;
const SAFE_REF_COMPONENT = /^[a-z0-9][a-z0-9._-]*$/;
const NULL_OID = "0".repeat(40);

export type CandidatePublicationResult =
  | Readonly<{ published: true; publication: LoopRunPublication }>
  | Readonly<{ published: false; code: string; message: string }>;

export type CandidatePublisher = (
  input: Readonly<{
    project: ProjectConfig;
    runId: string;
    baseSha: string;
    patchPath: string;
    patchSha256: string;
    modifiedFiles: readonly string[];
  }>,
) => Promise<CandidatePublicationResult>;

type GitResult = Readonly<{ code: number; stdout: string }>;

function runGit(
  cwd: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
  stdin?: string,
): Promise<GitResult> {
  return new Promise((resolvePromise) => {
    const child = spawn("git", [...args], {
      cwd,
      env,
      shell: false,
      stdio: [stdin === undefined ? "ignore" : "pipe", "pipe", "ignore"],
    });
    let stdout = "";
    let settled = false;
    const settle = (code: number): void => {
      if (settled) return;
      settled = true;
      resolvePromise(Object.freeze({ code, stdout: stdout.trim() }));
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 16_384) stdout += chunk.toString("utf8");
    });
    if (stdin !== undefined) child.stdin?.end(stdin, "utf8");
    child.once("error", () => settle(127));
    child.once("close", (code) => settle(code ?? 1));
  });
}

function validRefComponent(value: string): boolean {
  return (
    SAFE_REF_COMPONENT.test(value) &&
    !value.includes("..") &&
    !value.endsWith(".") &&
    !value.endsWith(".lock")
  );
}

function candidateRef(project: string, runId: string): string | null {
  if (!validRefComponent(project) || !validRefComponent(runId)) return null;
  return `refs/loop-engine/candidates/${project}/${runId}`;
}

function normalizedFiles(files: readonly string[]): readonly string[] | null {
  const normalized = files.map((file) => file.trim());
  if (
    normalized.length === 0 ||
    normalized.some(
      (file) =>
        file.length === 0 ||
        file.startsWith("/") ||
        file.split(/[\\/]+/).includes(".."),
    )
  )
    return null;
  const unique = [...new Set(normalized)].sort();
  return unique.length === normalized.length ? Object.freeze(unique) : null;
}

function failed(code: string, message: string): CandidatePublicationResult {
  return Object.freeze({ published: false, code, message });
}

/**
 * Creates only a private candidate ref. The source worktree, its index, HEAD
 * and every refs/heads ref remain untouched; Git objects are prepared before
 * one compare-and-create update-ref mutation.
 */
export const gitCandidatePublisher: CandidatePublisher = async (input) => {
  const ref = candidateRef(input.project.name, input.runId);
  const files = normalizedFiles(input.modifiedFiles);
  if (
    !ref ||
    !files ||
    !SHA.test(input.baseSha) ||
    !/^[a-f0-9]{64}$/.test(input.patchSha256)
  ) {
    return failed(
      "invalid_candidate_identity",
      "Candidate publication identity is invalid.",
    );
  }
  const cwd = resolve(input.project.path);
  const refCheck = await runGit(cwd, ["check-ref-format", "--normalize", ref]);
  if (refCheck.code !== 0 || refCheck.stdout !== ref) {
    return failed(
      "invalid_candidate_ref",
      "Candidate publication ref is invalid.",
    );
  }
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  if (head.code !== 0 || head.stdout !== input.baseSha) {
    return failed(
      "base_sha_stale",
      "Source HEAD no longer matches the validated base SHA.",
    );
  }
  const existing = await runGit(cwd, ["show-ref", "--verify", "--quiet", ref]);
  if (existing.code === 0)
    return failed("candidate_ref_exists", "Candidate ref already exists.");
  if (existing.code !== 1)
    return failed(
      "candidate_ref_inspection_failed",
      "Candidate ref state could not be verified.",
    );

  let patch: Buffer;
  try {
    patch = await readFile(input.patchPath);
  } catch {
    return failed("patch_read_failed", "Validated patch could not be read.");
  }
  if (createHash("sha256").update(patch).digest("hex") !== input.patchSha256) {
    return failed(
      "patch_sha_mismatch",
      "Validated patch integrity check failed.",
    );
  }

  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "loop-engine-candidate-"),
  );
  const indexPath = join(temporaryDirectory, "index");
  const frozenPatchPath = join(temporaryDirectory, "validated.patch");
  const environment = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    await writeFile(frozenPatchPath, patch, { flag: "wx", mode: 0o600 });
    if (
      (await runGit(cwd, ["read-tree", input.baseSha], environment)).code !== 0
    )
      return failed(
        "candidate_tree_failed",
        "Candidate tree could not be initialized.",
      );
    if (
      (
        await runGit(
          cwd,
          ["apply", "--check", "--cached", frozenPatchPath],
          environment,
        )
      ).code !== 0
    )
      return failed(
        "invalid_patch",
        "Validated patch could not be applied to the candidate tree.",
      );
    if (
      (await runGit(cwd, ["apply", "--cached", frozenPatchPath], environment))
        .code !== 0
    )
      return failed(
        "candidate_tree_failed",
        "Candidate tree could not be prepared.",
      );
    const changed = await runGit(
      cwd,
      ["diff", "--cached", "--name-only"],
      environment,
    );
    if (
      changed.code !== 0 ||
      JSON.stringify(changed.stdout.split("\n").filter(Boolean).sort()) !==
        JSON.stringify(files)
    )
      return failed(
        "fileset_mismatch",
        "Candidate tree files do not match the validated file set.",
      );
    const tree = await runGit(cwd, ["write-tree"], environment);
    if (tree.code !== 0 || !SHA.test(tree.stdout))
      return failed(
        "candidate_tree_failed",
        "Candidate tree could not be written.",
      );
    const diff = await runGit(cwd, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      input.baseSha,
      tree.stdout,
    ]);
    if (
      diff.code !== 0 ||
      JSON.stringify(diff.stdout.split("\n").filter(Boolean).sort()) !==
        JSON.stringify(files)
    )
      return failed(
        "fileset_mismatch",
        "Candidate tree does not match the validated file set.",
      );
    const commit = await runGit(cwd, [
      "-c",
      "commit.gpgSign=false",
      "commit-tree",
      tree.stdout,
      "-p",
      input.baseSha,
      "-m",
      `loop-engine candidate ${input.project.name}/${input.runId}`,
    ]);
    if (commit.code !== 0 || !SHA.test(commit.stdout))
      return failed(
        "candidate_commit_failed",
        "Candidate commit could not be created with the repository identity.",
      );
    const published = await runGit(
      cwd,
      ["update-ref", "--stdin"],
      undefined,
      [
        `verify HEAD ${input.baseSha}`,
        `update ${ref} ${commit.stdout} ${NULL_OID}`,
        "prepare",
        "commit",
        "",
      ].join("\n"),
    );
    if (published.code !== 0)
      return failed(
        "candidate_publication_rejected",
        "Candidate ref already exists or source HEAD changed concurrently.",
      );
    return Object.freeze({
      published: true,
      publication: Object.freeze({
        kind: "candidate_ref",
        ref,
        commitSha: commit.stdout,
        baseSha: input.baseSha,
      }),
    });
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
};
