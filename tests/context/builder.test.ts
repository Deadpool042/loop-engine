import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { buildMinimalContext } from "../../src/context/builder.js";
import { estimateTokens } from "../../src/context/context-cost-estimator.js";
import type { ProjectSnapshot } from "../../src/intelligence/snapshot.js";
import type { ContextBudget } from "../../src/policy/types.js";

function fixtureBudget(overrides: Partial<ContextBudget> = {}): ContextBudget {
  return {
    maxFiles: 10,
    maxCharacters: 10_000,
    maxEstimatedTokens: 10_000,
    includeFullFiles: false,
    ...overrides,
  };
}

function fixtureSnapshot(
  projectPath: string,
  requiredDocs: readonly string[],
  roadmapPaths: readonly string[],
): ProjectSnapshot {
  return {
    project: { name: "fixture-project", type: "test", path: projectPath },
    git: { branch: "main", clean: true, requiresGit: true, statusText: "", lastCommit: null },
    docs: { required: requiredDocs, missing: [] },
    validation: { commands: [], configured: false },
    roadmap: {
      available: roadmapPaths.length > 0,
      paths: roadmapPaths,
      candidates: [],
      selectedCandidate: null,
      stats: { total: 0, todo: 0, inProgress: 0, done: 0, unknown: 0, safe: 0, warning: 0, blocked: 0 },
      summary: { active: 0, done: 0, selectable: 0, hasBlocked: false },
    },
    health: "good",
  };
}

describe("buildMinimalContext", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "loop-engine-context-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("estimateTokens is a deterministic ceil(length/4) approximation", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("a"), 1);
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens("abcde"), 2);
    assert.equal(estimateTokens("a".repeat(400)), 100);
  });

  it("orders files as required_docs (declared order) then roadmap (declared order)", () => {
    writeFileSync(join(projectDir, "a.md"), "A");
    writeFileSync(join(projectDir, "b.md"), "B");
    writeFileSync(join(projectDir, "r1.md"), "R1");
    writeFileSync(join(projectDir, "r2.md"), "R2");

    const snapshot = fixtureSnapshot(projectDir, ["b.md", "a.md"], ["r2.md", "r1.md"]);
    const pkg = buildMinimalContext(snapshot, fixtureBudget());

    assert.deepEqual(
      pkg.files.map((file) => file.path),
      ["b.md", "a.md", "r2.md", "r1.md"],
    );
  });

  it("deduplicates by normalized path, keeping the first occurrence and omitting the rest", () => {
    writeFileSync(join(projectDir, "shared.md"), "shared content");

    const snapshot = fixtureSnapshot(projectDir, ["shared.md", "./shared.md"], ["sub/../shared.md"]);
    const pkg = buildMinimalContext(snapshot, fixtureBudget());

    assert.deepEqual(pkg.files.map((file) => file.path), ["shared.md"]);
    assert.deepEqual(
      pkg.omitted.map((omission) => omission.reason),
      ["duplicate", "duplicate"],
    );
  });

  it("omits paths that resolve outside the project as outside_project", () => {
    const snapshot = fixtureSnapshot(projectDir, ["../outside.md", "/etc/passwd"], []);
    const pkg = buildMinimalContext(snapshot, fixtureBudget());

    assert.deepEqual(pkg.files, []);
    assert.deepEqual(
      pkg.omitted.map((omission) => omission.reason),
      ["outside_project", "outside_project"],
    );
  });

  it("omits files that do not exist as missing", () => {
    const snapshot = fixtureSnapshot(projectDir, ["does-not-exist.md"], []);
    const pkg = buildMinimalContext(snapshot, fixtureBudget());

    assert.deepEqual(pkg.files, []);
    assert.deepEqual(pkg.omitted, [{ path: "does-not-exist.md", reason: "missing" }]);
  });

  it("enforces maxFiles: excess files are omitted as file_limit", () => {
    writeFileSync(join(projectDir, "a.md"), "A");
    writeFileSync(join(projectDir, "b.md"), "B");
    writeFileSync(join(projectDir, "c.md"), "C");

    const snapshot = fixtureSnapshot(projectDir, ["a.md", "b.md", "c.md"], []);
    const pkg = buildMinimalContext(snapshot, fixtureBudget({ maxFiles: 2 }));

    assert.deepEqual(pkg.files.map((file) => file.path), ["a.md", "b.md"]);
    assert.deepEqual(pkg.omitted, [{ path: "c.md", reason: "file_limit" }]);
    assert.ok(pkg.files.length <= 2);
  });

  it("enforces maxCharacters with includeFullFiles=false via truncation", () => {
    writeFileSync(join(projectDir, "a.md"), "x".repeat(100));

    const snapshot = fixtureSnapshot(projectDir, ["a.md"], []);
    const pkg = buildMinimalContext(
      snapshot,
      fixtureBudget({ maxCharacters: 40, maxEstimatedTokens: 10_000, includeFullFiles: false }),
    );

    assert.equal(pkg.files.length, 1);
    assert.equal(pkg.files[0].includedCharacters, 40);
    assert.equal(pkg.files[0].originalCharacters, 100);
    assert.equal(pkg.files[0].truncated, true);
    assert.equal(pkg.totalCharacters, 40);
    assert.equal(pkg.truncated, true);
  });

  it("enforces maxEstimatedTokens with includeFullFiles=false, truncating at the exact token boundary", () => {
    writeFileSync(join(projectDir, "a.md"), "x".repeat(100));

    // remainingTokens=5 -> maxCharactersFromTokenBudget = 20 exactly:
    // ceil(20/4) === 5, no off-by-one at the boundary.
    const snapshot = fixtureSnapshot(projectDir, ["a.md"], []);
    const pkg = buildMinimalContext(
      snapshot,
      fixtureBudget({ maxCharacters: 10_000, maxEstimatedTokens: 5, includeFullFiles: false }),
    );

    assert.equal(pkg.files.length, 1);
    assert.equal(pkg.files[0].includedCharacters, 20);
    assert.equal(pkg.files[0].estimatedTokens, 5);
    assert.equal(pkg.estimatedTokens, 5);
    assert.equal(pkg.files[0].truncated, true);
  });

  it("includeFullFiles=false never exceeds the character or token budget across multiple files", () => {
    writeFileSync(join(projectDir, "a.md"), "x".repeat(30));
    writeFileSync(join(projectDir, "b.md"), "y".repeat(30));
    writeFileSync(join(projectDir, "c.md"), "z".repeat(30));

    const snapshot = fixtureSnapshot(projectDir, ["a.md", "b.md", "c.md"], []);
    const pkg = buildMinimalContext(
      snapshot,
      fixtureBudget({ maxCharacters: 50, maxEstimatedTokens: 12, includeFullFiles: false }),
    );

    assert.ok(pkg.totalCharacters <= 50);
    assert.ok(pkg.estimatedTokens <= 12);
    assert.equal(pkg.truncated, true);
  });

  it("includeFullFiles=true never includes a file partially: it is omitted whole if it does not fit", () => {
    writeFileSync(join(projectDir, "a.md"), "x".repeat(30));
    writeFileSync(join(projectDir, "b.md"), "y".repeat(30));

    const snapshot = fixtureSnapshot(projectDir, ["a.md", "b.md"], []);
    const pkg = buildMinimalContext(
      snapshot,
      fixtureBudget({ maxCharacters: 40, maxEstimatedTokens: 10_000, includeFullFiles: true }),
    );

    assert.equal(pkg.files.length, 1);
    assert.equal(pkg.files[0].path, "a.md");
    assert.equal(pkg.files[0].includedCharacters, 30);
    assert.equal(pkg.files[0].truncated, false);
    assert.deepEqual(pkg.omitted, [{ path: "b.md", reason: "character_limit" }]);
    assert.ok(pkg.totalCharacters <= 40);
  });

  it("includeFullFiles=true includes every file that fits, with truncated never set", () => {
    writeFileSync(join(projectDir, "a.md"), "x".repeat(10));
    writeFileSync(join(projectDir, "b.md"), "y".repeat(10));

    const snapshot = fixtureSnapshot(projectDir, ["a.md", "b.md"], []);
    const pkg = buildMinimalContext(snapshot, fixtureBudget({ includeFullFiles: true }));

    assert.equal(pkg.files.length, 2);
    assert.ok(pkg.files.every((file) => file.truncated === false));
    assert.equal(pkg.truncated, false);
  });

  it("never exceeds the budget, even by a single character or estimated token", () => {
    writeFileSync(join(projectDir, "a.md"), "x".repeat(1000));
    writeFileSync(join(projectDir, "b.md"), "y".repeat(1000));
    writeFileSync(join(projectDir, "c.md"), "z".repeat(1000));

    const budget = fixtureBudget({
      maxFiles: 2,
      maxCharacters: 137,
      maxEstimatedTokens: 33,
      includeFullFiles: false,
    });
    const snapshot = fixtureSnapshot(projectDir, ["a.md", "b.md", "c.md"], []);
    const pkg = buildMinimalContext(snapshot, budget);

    assert.ok(pkg.files.length <= budget.maxFiles);
    assert.ok(pkg.totalCharacters <= budget.maxCharacters);
    assert.ok(pkg.estimatedTokens <= budget.maxEstimatedTokens);
  });

  it("round-trips through JSON without losing structure", () => {
    writeFileSync(join(projectDir, "a.md"), "hello world");

    const snapshot = fixtureSnapshot(projectDir, ["a.md"], ["missing.md"]);
    const pkg = buildMinimalContext(snapshot, fixtureBudget());

    const roundTripped = JSON.parse(JSON.stringify(pkg)) as typeof pkg;
    assert.deepEqual(roundTripped, pkg);
  });
});
