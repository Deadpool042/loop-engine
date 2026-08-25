import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { gitCandidatePublisher } from "../../src/loop/git-candidate-publisher.js";
import { gitCandidateReviewer } from "../../src/loop/git-candidate-reviewer.js";

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sourceState(cwd: string): readonly string[] {
  return [
    git(cwd, ["rev-parse", "HEAD"]),
    git(cwd, ["status", "--porcelain=v1"]),
    git(cwd, ["diff"]),
    git(cwd, ["diff", "--cached"]),
    git(cwd, ["symbolic-ref", "--short", "HEAD"]),
  ];
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "loop-v34-review-"));
  const source = join(root, "source");
  const candidate = join(root, "candidate");
  const patchPath = join(root, "validated.patch");
  execFileSync("git", ["init", "-q", source]);
  git(source, ["config", "user.email", "test@example.com"]);
  git(source, ["config", "user.name", "Test"]);
  writeFileSync(join(source, "modified.txt"), "before\n");
  writeFileSync(join(source, "deleted.txt"), "delete me\n");
  writeFileSync(join(source, "dirty.txt"), "baseline\n");
  git(source, ["add", "."]);
  git(source, ["commit", "-q", "-m", "test: baseline"]);
  const baseSha = git(source, ["rev-parse", "HEAD"]);
  execFileSync("git", ["clone", "-q", source, candidate]);
  writeFileSync(join(candidate, "modified.txt"), "after\n");
  rmSync(join(candidate, "deleted.txt"));
  writeFileSync(join(candidate, "added.txt"), "added\n");
  git(candidate, ["add", "-A"]);
  writeFileSync(
    patchPath,
    `${git(candidate, ["diff", "--cached", "--binary", "HEAD"])}\n`,
  );
  return {
    source,
    patchPath,
    baseSha,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

async function publish(fixture: ReturnType<typeof setup>) {
  const result = await gitCandidatePublisher({
    project: {
      name: "project-a",
      path: fixture.source,
      docs: [],
      roadmap: "ROADMAP.md",
      validation: [],
    },
    runId: "run-123",
    baseSha: fixture.baseSha,
    patchPath: fixture.patchPath,
    patchSha256: sha256(fixture.patchPath),
    modifiedFiles: ["added.txt", "deleted.txt", "modified.txt"],
  });
  assert.equal(result.published, true);
  if (!result.published) throw new Error("candidate publication failed");
  return result.publication;
}

function reviewInput(
  fixture: ReturnType<typeof setup>,
  publication: Awaited<ReturnType<typeof publish>>,
) {
  return {
    project: {
      name: "project-a",
      path: fixture.source,
      docs: [],
      roadmap: "ROADMAP.md",
      validation: [],
    },
    runId: "run-123",
    publication,
  } as const;
}

describe("V34 candidate publication review", () => {
  it("reviews the published Git candidate with added, modified and deleted files without changing source state", async () => {
    const fixture = setup();
    try {
      writeFileSync(join(fixture.source, "dirty.txt"), "user edit\n");
      const publication = await publish(fixture);
      const before = sourceState(fixture.source);
      const result = await gitCandidateReviewer(
        reviewInput(fixture, publication),
      );
      assert.equal(result.reviewed, true);
      if (!result.reviewed) return;
      assert.equal(result.review.candidateRef, publication.ref);
      assert.equal(result.review.candidateCommitSha, publication.commitSha);
      assert.equal(result.review.baseSha, fixture.baseSha);
      assert.equal(result.review.additions, 2);
      assert.equal(result.review.deletions, 2);
      assert.deepEqual(result.review.changedFiles, [
        { path: "added.txt", status: "added", additions: 1, deletions: 0 },
        { path: "deleted.txt", status: "deleted", additions: 0, deletions: 1 },
        {
          path: "modified.txt",
          status: "modified",
          additions: 1,
          deletions: 1,
        },
      ]);
      assert.deepEqual(sourceState(fixture.source), before);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed when the ref is missing, moved, the recorded commit differs, or the candidate parent/base is incoherent", async () => {
    const fixture = setup();
    try {
      const publication = await publish(fixture);
      const before = sourceState(fixture.source);
      git(fixture.source, ["update-ref", "-d", publication.ref]);
      const missing = await gitCandidateReviewer(
        reviewInput(fixture, publication),
      );
      assert.deepEqual(missing, {
        reviewed: false,
        code: "candidate_ref_stale",
        message: "Candidate ref is missing or moved.",
      });

      git(fixture.source, ["update-ref", publication.ref, fixture.baseSha]);
      const moved = await gitCandidateReviewer(
        reviewInput(fixture, publication),
      );
      assert.equal(moved.reviewed, false);
      if (!moved.reviewed) assert.equal(moved.code, "candidate_ref_stale");

      git(fixture.source, [
        "update-ref",
        publication.ref,
        publication.commitSha,
      ]);
      const differentCommit = await gitCandidateReviewer(
        reviewInput(fixture, { ...publication, commitSha: fixture.baseSha }),
      );
      assert.equal(differentCommit.reviewed, false);
      if (!differentCommit.reviewed)
        assert.equal(differentCommit.code, "candidate_ref_stale");

      writeFileSync(join(fixture.source, "advance.txt"), "advance\n");
      git(fixture.source, ["add", "advance.txt"]);
      git(fixture.source, ["commit", "-q", "-m", "test: alternate base"]);
      const otherBase = git(fixture.source, ["rev-parse", "HEAD"]);
      const candidateTree = git(fixture.source, [
        "rev-parse",
        `${publication.commitSha}^{tree}`,
      ]);
      const otherCommit = git(fixture.source, [
        "commit-tree",
        candidateTree,
        "-p",
        otherBase,
        "-m",
        "test: wrong parent",
      ]);
      git(fixture.source, ["update-ref", publication.ref, otherCommit]);
      const wrongParent = await gitCandidateReviewer(
        reviewInput(fixture, { ...publication, commitSha: otherCommit }),
      );
      assert.equal(wrongParent.reviewed, false);
      if (!wrongParent.reviewed)
        assert.equal(wrongParent.code, "candidate_parent_mismatch");

      const mergeCommit = git(fixture.source, [
        "commit-tree",
        candidateTree,
        "-p",
        fixture.baseSha,
        "-p",
        otherBase,
        "-m",
        "test: multiple parents",
      ]);
      git(fixture.source, ["update-ref", publication.ref, mergeCommit]);
      const multipleParents = await gitCandidateReviewer(
        reviewInput(fixture, { ...publication, commitSha: mergeCommit }),
      );
      assert.equal(multipleParents.reviewed, false);
      if (!multipleParents.reviewed)
        assert.equal(multipleParents.code, "candidate_parent_mismatch");

      git(fixture.source, [
        "update-ref",
        publication.ref,
        publication.commitSha,
      ]);
      const afterSetup = sourceState(fixture.source);
      const badBase = await gitCandidateReviewer(
        reviewInput(fixture, { ...publication, baseSha: "0".repeat(40) }),
      );
      assert.equal(badBase.reviewed, false);
      if (!badBase.reviewed)
        assert.equal(badBase.code, "candidate_parent_mismatch");
      assert.deepEqual(sourceState(fixture.source), afterSetup);
      assert.notDeepEqual(afterSetup, before);
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed when the configured Git repository cannot be inspected", async () => {
    const result = await gitCandidateReviewer({
      project: {
        name: "project-a",
        path: join(tmpdir(), "loop-v34-missing-repository"),
        docs: [],
        roadmap: "ROADMAP.md",
        validation: [],
      },
      runId: "run-123",
      publication: {
        kind: "candidate_ref",
        ref: "refs/loop-engine/candidates/project-a/run-123",
        commitSha: "a".repeat(40),
        baseSha: "b".repeat(40),
      },
    });
    assert.deepEqual(result, {
      reviewed: false,
      code: "candidate_git_inspection_failed",
      message: "Candidate Git repository could not be inspected.",
    });
  });
});
