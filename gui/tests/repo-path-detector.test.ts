import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { join } from "node:path";

import {
  boundedParents,
  detectRepoPath,
  REQUIRED_REPO_MARKERS,
  type PathMarkerCheck,
  type RepoPathCandidateSource,
} from "../main/repo-path-detector.js";

function fakeChecker(validCandidates: readonly string[]): PathMarkerCheck & {
  checkedPaths: string[];
} {
  const checkedPaths: string[] = [];
  const validPaths = new Set(
    validCandidates.flatMap((candidate) =>
      REQUIRED_REPO_MARKERS.map((marker) => join(candidate, marker)),
    ),
  );
  return {
    checkedPaths,
    async exists(path: string): Promise<boolean> {
      checkedPaths.push(path);
      return validPaths.has(path);
    },
  };
}

function source(
  overrides: Partial<RepoPathCandidateSource>,
): RepoPathCandidateSource {
  return {
    configuredRepoPath: async () => null,
    cwd: () => "/nowhere",
    appDirParents: () => [],
    extraCandidates: () => [],
    ...overrides,
  };
}

describe("detectRepoPath", () => {
  it("prefers the configured repo path when it still contains the required markers", async () => {
    const checker = fakeChecker(["/repo-a"]);
    const src = source({
      configuredRepoPath: async () => "/repo-a",
      cwd: () => "/repo-b",
    });

    const result = await detectRepoPath(checker, src);

    assert.equal(result, "/repo-a");
  });

  it("falls through to cwd when the configured path is absent or invalid", async () => {
    const checker = fakeChecker(["/repo-b"]);
    const src = source({
      configuredRepoPath: async () => "/repo-a",
      cwd: () => "/repo-b",
    });

    const result = await detectRepoPath(checker, src);

    assert.equal(result, "/repo-b");
  });

  it("falls through to cwd when no repo path is configured at all", async () => {
    const checker = fakeChecker(["/repo-b"]);
    const src = source({
      configuredRepoPath: async () => null,
      cwd: () => "/repo-b",
    });

    assert.equal(await detectRepoPath(checker, src), "/repo-b");
  });

  it("walks a bounded list of app-dir parents when cwd is not a valid candidate", async () => {
    const checker = fakeChecker(["/opt/loop-engine"]);
    const src = source({
      cwd: () => "/somewhere-else",
      appDirParents: () => [
        "/opt/loop-engine/gui/dist/main",
        "/opt/loop-engine/gui/dist",
        "/opt/loop-engine/gui",
        "/opt/loop-engine",
      ],
    });

    const result = await detectRepoPath(checker, src);

    assert.equal(result, "/opt/loop-engine");
  });

  it("falls through to the bounded, explicitly documented extra candidates last", async () => {
    const checker = fakeChecker(["/documented/location"]);
    const src = source({
      extraCandidates: () => ["/documented/location"],
    });

    assert.equal(await detectRepoPath(checker, src), "/documented/location");
  });

  it("rejects a candidate missing any required marker", async () => {
    const checker: PathMarkerCheck = {
      async exists() {
        return false;
      },
    };
    const src = source({ cwd: () => "/no-markers-here" });

    assert.equal(await detectRepoPath(checker, src), null);
  });

  it("returns null when no candidate matches", async () => {
    const checker = fakeChecker([]);
    const src = source({});

    assert.equal(await detectRepoPath(checker, src), null);
  });

  it("checks only the fixed, bounded set of required markers per candidate — never a recursive scan", async () => {
    const checker = fakeChecker(["/repo-a"]);
    const src = source({ cwd: () => "/repo-a" });

    await detectRepoPath(checker, src);

    assert.equal(checker.checkedPaths.length, REQUIRED_REPO_MARKERS.length);
    for (const path of checker.checkedPaths) {
      assert.ok(
        REQUIRED_REPO_MARKERS.some((marker) => path.endsWith(marker)),
        `unexpected checked path outside the fixed marker set: ${path}`,
      );
    }
  });

  it("stops checking markers for a candidate as soon as one is found accepted, without scanning unrelated directories", async () => {
    const checker = fakeChecker(["/repo-a", "/repo-b", "/repo-c"]);
    const src = source({
      configuredRepoPath: async () => null,
      cwd: () => "/repo-a",
      appDirParents: () => ["/repo-b", "/repo-c"],
    });

    const result = await detectRepoPath(checker, src);

    assert.equal(result, "/repo-a");
    // only the cwd candidate's markers were checked — appDirParents never reached
    assert.ok(
      checker.checkedPaths.every((path) => path.startsWith("/repo-a/")),
    );
  });
});

describe("boundedParents", () => {
  it("returns each ancestor directory, bounded by maxLevels", () => {
    const parents = boundedParents("/a/b/c/d/e", 3);

    assert.deepEqual(parents, ["/a/b/c/d", "/a/b/c", "/a/b"]);
  });

  it("stops early when the filesystem root is reached, never looping", () => {
    const parents = boundedParents("/a/b", 10);

    assert.deepEqual(parents, ["/a", "/"]);
  });

  it("returns an empty list for a non-positive bound", () => {
    assert.deepEqual(boundedParents("/a/b/c", 0), []);
  });
});
