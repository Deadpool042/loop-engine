import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  GITHUB_ACTIONS_PARALLEL_CI_CONTRACT,
  inspectGithubActionsCiContract,
} from "../../src/audit/github-actions-ci-contract.js";

test("parallel GitHub Actions CI contract accepts the repository workflow", () => {
  const source = readFileSync(".github/workflows/ci.yml", "utf8");

  assert.deepEqual(inspectGithubActionsCiContract(source).missing, []);
});

for (const pattern of GITHUB_ACTIONS_PARALLEL_CI_CONTRACT.requiredPatterns) {
  test(`parallel GitHub Actions CI contract rejects missing ${pattern.source}`, () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const match = source.match(pattern);

    assert.ok(match, `expected workflow fixture to match ${pattern.source}`);

    const mutated = source.replaceAll(match[0], "removed-ci-contract-token");
    const report = inspectGithubActionsCiContract(mutated);

    assert.ok(report.missing.includes(pattern.source));
  });
}
