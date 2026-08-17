import assert from "node:assert/strict";
import { test } from "node:test";

import { findOutOfScopeFiles, parseAllowedPaths } from "../../src/loop/file-scope.js";

test("accepts exact and terminal recursive writable paths", () => {
  const recursive = parseAllowedPaths(["docs/platform/**"]);
  assert.equal(recursive.ok, true);
  if (recursive.ok) {
    assert.deepEqual(
      findOutOfScopeFiles(["docs/platform/README.md"], recursive.allowedPaths),
      [],
    );
  }
  const exact = parseAllowedPaths(["README.md"]);
  assert.equal(exact.ok, true);
  if (exact.ok) {
    assert.deepEqual(findOutOfScopeFiles(["README.md"], exact.allowedPaths), []);
  }
});

test("returns every out-of-scope modified Git path deterministically", () => {
  const scope = parseAllowedPaths(["docs/platform/**"]);
  assert.equal(scope.ok, true);
  if (scope.ok) {
    assert.deepEqual(
      findOutOfScopeFiles(
        ["docs/platform/README.md", "docs/roadmap/projet-lp-infra.md"],
        scope.allowedPaths,
      ),
      ["docs/roadmap/projet-lp-infra.md"],
    );
  }
});

test("rejects unsupported writable path forms", () => {
  for (const paths of [
    [],
    [""],
    ["/docs/platform/**"],
    ["../docs/platform/**"],
    ["docs/../platform/**"],
    ["docs\\platform\\**"],
    ["docs/*/README.md"],
    ["docs/**/README.md"],
    ["docs/platform/**/README.md"],
    ["docs/platform?.md"],
    ["docs/[platform]"],
    ["docs/{platform}"],
  ]) {
    const result = parseAllowedPaths(paths);
    assert.equal(result.ok, false, JSON.stringify(paths));
  }
});
