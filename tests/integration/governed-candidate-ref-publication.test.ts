import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { gitCandidatePublisher } from "../../src/loop/git-candidate-publisher.js";

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
  const root = mkdtempSync(join(tmpdir(), "loop-v33-candidate-"));
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
    root,
    source,
    candidate,
    patchPath,
    baseSha,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function input(
  fixture: ReturnType<typeof setup>,
  overrides: Record<string, unknown> = {},
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
    baseSha: fixture.baseSha,
    patchPath: fixture.patchPath,
    patchSha256: sha256(fixture.patchPath),
    modifiedFiles: ["added.txt", "deleted.txt", "modified.txt"],
    ...overrides,
  } as Parameters<typeof gitCandidatePublisher>[0];
}

describe("V33 governed candidate ref publication", () => {
  it("publishes the exact added, modified and deleted candidate tree without changing source state", async () => {
    const fixture = setup();
    try {
      writeFileSync(join(fixture.source, "dirty.txt"), "user edit\n");
      const before = sourceState(fixture.source);
      const headsBefore = git(fixture.source, [
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        "refs/heads",
      ]);
      const result = await gitCandidatePublisher(input(fixture));
      assert.equal(result.published, true);
      if (!result.published) return;
      assert.equal(
        result.publication.ref,
        "refs/loop-engine/candidates/project-a/run-123",
      );
      assert.equal(
        git(fixture.source, ["rev-parse", result.publication.ref]),
        result.publication.commitSha,
      );
      assert.equal(
        git(fixture.source, ["rev-parse", `${result.publication.commitSha}^`]),
        fixture.baseSha,
      );
      assert.deepEqual(
        git(fixture.source, [
          "diff-tree",
          "--no-commit-id",
          "--name-only",
          "-r",
          fixture.baseSha,
          result.publication.commitSha,
        ])
          .split("\n")
          .sort(),
        ["added.txt", "deleted.txt", "modified.txt"],
      );
      assert.equal(
        git(fixture.source, [
          "rev-parse",
          `${result.publication.commitSha}^{tree}`,
        ]),
        git(fixture.candidate, ["write-tree"]),
      );
      assert.deepEqual(sourceState(fixture.source), before);
      assert.equal(
        git(fixture.source, [
          "for-each-ref",
          "--format=%(refname) %(objectname)",
          "refs/heads",
        ]),
        headsBefore,
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("fails closed before update-ref for invalid patch, hash, stale base and fileset", async () => {
    const fixture = setup();
    try {
      const cases = [
        input(fixture, { patchSha256: "0".repeat(64) }),
        input(fixture, { modifiedFiles: ["modified.txt"] }),
        input(fixture, { patchPath: join(fixture.root, "missing.patch") }),
      ];
      for (const candidate of cases) {
        const before = sourceState(fixture.source);
        const result = await gitCandidatePublisher(candidate);
        assert.equal(result.published, false);
        assert.deepEqual(sourceState(fixture.source), before);
        assert.equal(
          git(fixture.source, [
            "for-each-ref",
            "--format=%(refname)",
            "refs/loop-engine/candidates",
          ]),
          "",
        );
      }
      writeFileSync(join(fixture.source, "advance.txt"), "advance\n");
      git(fixture.source, ["add", "advance.txt"]);
      git(fixture.source, ["commit", "-q", "-m", "test: advance"]);
      const stale = await gitCandidatePublisher(input(fixture));
      assert.deepEqual(stale, {
        published: false,
        code: "base_sha_stale",
        message: "Source HEAD no longer matches the validated base SHA.",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects invalid ref identity and never replaces an existing or racing candidate ref", async () => {
    const fixture = setup();
    try {
      const invalid = await gitCandidatePublisher(
        input(fixture, { runId: "bad/ref" }),
      );
      assert.equal(invalid.published, false);
      const headsBefore = git(fixture.source, [
        "for-each-ref",
        "--format=%(refname) %(objectname)",
        "refs/heads",
      ]);
      const [first, second] = await Promise.all([
        gitCandidatePublisher(input(fixture)),
        gitCandidatePublisher(input(fixture)),
      ]);
      assert.equal(Number(first.published) + Number(second.published), 1);
      const collision = await gitCandidatePublisher(input(fixture));
      assert.deepEqual(collision, {
        published: false,
        code: "candidate_ref_exists",
        message: "Candidate ref already exists.",
      });
      assert.equal(
        git(fixture.source, [
          "for-each-ref",
          "--format=%(refname) %(objectname)",
          "refs/heads",
        ]),
        headsBefore,
      );
    } finally {
      fixture.cleanup();
    }
  });
});
