import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

function git(
  cwd: string,
  args: readonly string[],
  env?: NodeJS.ProcessEnv,
): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", env }).trim();
}

function gitEnvironment(indexPath: string): NodeJS.ProcessEnv {
  return { ...process.env, GIT_INDEX_FILE: indexPath };
}

function status(cwd: string): string {
  return execFileSync("git", ["status", "--porcelain=v1"], {
    cwd,
    encoding: "utf8",
  }).trimEnd();
}

function statusFiles(cwd: string): string[] {
  return status(cwd)
    .split("\n")
    .filter(Boolean)
    .map((entry) => entry.slice(3))
    .sort();
}

function setup(): {
  root: string;
  source: string;
  candidate: string;
  patchPath: string;
  baseSha: string;
  cleanup: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-v32-publication-"));
  const source = join(root, "source");
  const candidate = join(root, "candidate");
  const patchPath = join(root, "validated.patch");

  execFileSync("git", ["init", "-q", source]);
  git(source, ["config", "user.email", "test@example.com"]);
  git(source, ["config", "user.name", "Test"]);
  writeFileSync(join(source, "modified.txt"), "before\n");
  writeFileSync(join(source, "deleted.txt"), "delete me\n");
  writeFileSync(join(source, "unrelated.txt"), "user baseline\n");
  git(source, ["add", "."]);
  git(source, ["commit", "-q", "-m", "test: baseline"]);
  const baseSha = git(source, ["rev-parse", "HEAD"]);

  execFileSync("git", ["clone", "-q", source, candidate]);
  writeFileSync(join(candidate, "modified.txt"), "after\n");
  rmSync(join(candidate, "deleted.txt"));
  writeFileSync(join(candidate, "added.txt"), "added\n");
  git(candidate, ["add", "--intent-to-add", "added.txt"]);
  writeFileSync(patchPath, git(candidate, ["diff", "--binary", "HEAD"]) + "\n");

  return {
    root,
    source,
    candidate,
    patchPath,
    baseSha,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function changedFiles(
  cwd: string,
  baseSha: string,
  treeish?: string,
): string[] {
  return git(
    cwd,
    treeish === undefined
      ? ["diff", "--name-only"]
      : ["diff", "--name-only", baseSha, treeish],
  )
    .split("\n")
    .filter(Boolean)
    .sort();
}

describe("V32 atomic source publication feasibility", () => {
  it("A: git apply --check preflights a three-operation patch, but Git permits unrelated source dirt", () => {
    const fixture = setup();
    try {
      const before = status(fixture.source);
      git(fixture.source, ["apply", "--check", fixture.patchPath]);
      assert.equal(status(fixture.source), before);

      writeFileSync(join(fixture.source, "unrelated.txt"), "user edit\n");
      git(fixture.source, ["apply", "--check", fixture.patchPath]);
      assert.equal(
        readFileSync(join(fixture.source, "unrelated.txt"), "utf8"),
        "user edit\n",
      );
      assert.match(status(fixture.source), /unrelated\.txt/);
    } finally {
      fixture.cleanup();
    }
  });

  it("A: conflict and invalid-patch preflight leave the source byte-for-byte unchanged", () => {
    const fixture = setup();
    try {
      writeFileSync(join(fixture.source, "modified.txt"), "user edit\n");
      const beforeContents = readFileSync(
        join(fixture.source, "modified.txt"),
        "utf8",
      );
      const beforeStatus = status(fixture.source);

      assert.throws(() =>
        git(fixture.source, ["apply", "--check", fixture.patchPath]),
      );
      assert.throws(() => git(fixture.source, ["apply", fixture.patchPath]));
      assert.equal(
        readFileSync(join(fixture.source, "modified.txt"), "utf8"),
        beforeContents,
      );
      assert.equal(status(fixture.source), beforeStatus);

      const invalidPatch = join(fixture.root, "invalid.patch");
      writeFileSync(invalidPatch, "this is not a Git patch\n");
      assert.throws(() =>
        git(fixture.source, ["apply", "--check", invalidPatch]),
      );
      assert.equal(status(fixture.source), beforeStatus);
    } finally {
      fixture.cleanup();
    }
  });

  it("B and D: an alternate index prepares the exact candidate tree without writing the source worktree or history", () => {
    const fixture = setup();
    try {
      const temporaryIndex = join(fixture.root, "candidate.index");
      const env = gitEnvironment(temporaryIndex);
      git(fixture.source, ["read-tree", fixture.baseSha], env);
      git(fixture.source, ["apply", "--cached", fixture.patchPath], env);
      const candidateTree = git(fixture.source, ["write-tree"], env);

      assert.match(candidateTree, /^[0-9a-f]{40}$/);
      assert.deepEqual(
        changedFiles(fixture.source, fixture.baseSha, candidateTree),
        ["added.txt", "deleted.txt", "modified.txt"],
      );
      assert.equal(status(fixture.source), "");
      assert.equal(
        git(fixture.source, ["diff", "--cached", "--name-only"]),
        "",
      );
      assert.equal(git(fixture.source, ["rev-parse", "HEAD"]), fixture.baseSha);

      const actualPatchHash = createHash("sha256")
        .update(readFileSync(fixture.patchPath))
        .digest("hex");
      const alteredPatchHash = createHash("sha256")
        .update(
          Buffer.concat([readFileSync(fixture.patchPath), Buffer.from("x")]),
        )
        .digest("hex");
      assert.notEqual(actualPatchHash, alteredPatchHash);
    } finally {
      fixture.cleanup();
    }
  });

  it("B: failed candidate preparation and a stale source HEAD do not mutate the source", () => {
    const fixture = setup();
    try {
      const temporaryIndex = join(fixture.root, "candidate.index");
      const env = gitEnvironment(temporaryIndex);
      git(fixture.source, ["read-tree", fixture.baseSha], env);
      const invalidPatch = join(fixture.root, "invalid.patch");
      writeFileSync(invalidPatch, "not a patch\n");
      assert.throws(() =>
        git(fixture.source, ["apply", "--cached", invalidPatch], env),
      );
      assert.equal(status(fixture.source), "");

      writeFileSync(
        join(fixture.source, "unrelated.txt"),
        "new committed HEAD\n",
      );
      git(fixture.source, ["add", "unrelated.txt"]);
      git(fixture.source, ["commit", "-q", "-m", "test: advance source"]);
      assert.notEqual(
        git(fixture.source, ["rev-parse", "HEAD"]),
        fixture.baseSha,
      );
      assert.equal(
        readFileSync(join(fixture.source, "modified.txt"), "utf8"),
        "before\n",
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("C: a temporary worktree can validate the delta while preserving source changes, but has no publication step", () => {
    const fixture = setup();
    const workspace = join(fixture.root, "workspace");
    try {
      writeFileSync(join(fixture.source, "unrelated.txt"), "user edit\n");
      const sourceStatus = status(fixture.source);
      git(fixture.source, [
        "worktree",
        "add",
        "--detach",
        workspace,
        fixture.baseSha,
      ]);
      git(workspace, ["apply", fixture.patchPath]);
      assert.deepEqual(statusFiles(workspace), [
        "added.txt",
        "deleted.txt",
        "modified.txt",
      ]);
      assert.equal(status(fixture.source), sourceStatus);
      assert.equal(
        readFileSync(join(fixture.source, "unrelated.txt"), "utf8"),
        "user edit\n",
      );
    } finally {
      try {
        git(fixture.source, ["worktree", "remove", "--force", workspace]);
      } catch {
        // Fixture cleanup removes the whole temporary repository.
      }
      fixture.cleanup();
    }
  });
});
