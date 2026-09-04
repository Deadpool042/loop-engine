import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  GITHUB_ACTIONS_CI_CONTRACT,
  inspectGithubActionsCiContract,
} from "../../src/audit/github-actions-ci-contract.js";

test("consolidated GitHub Actions CI contract accepts the repository workflow", () => {
  const source = readFileSync(".github/workflows/ci.yml", "utf8");
  const report = inspectGithubActionsCiContract(source);

  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.violations, []);
});

for (const pattern of GITHUB_ACTIONS_CI_CONTRACT.requiredPatterns) {
  test(`consolidated GitHub Actions CI contract rejects missing ${pattern.source}`, () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const match = source.match(pattern);

    assert.ok(match, `expected workflow fixture to match ${pattern.source}`);

    const mutated = source.split(match[0]).join("removed-ci-contract-token");
    const report = inspectGithubActionsCiContract(mutated);

    assert.ok(report.missing.includes(pattern.source));
  });
}

for (const invariant of GITHUB_ACTIONS_CI_CONTRACT.exactCounts) {
  test(`consolidated GitHub Actions CI contract rejects duplicate ${invariant.label}`, () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const match = source.match(invariant.pattern);

    assert.ok(match, `expected workflow fixture to match ${invariant.pattern.source}`);

    const mutated = `${source}\n${match[0]}\n`;
    const report = inspectGithubActionsCiContract(mutated);

    assert.ok(
      report.violations.some((violation) =>
        violation.startsWith(`${invariant.label}: expected 1, found 2`),
      ),
    );
  });
}

const legacyJobs = ["typecheck", "tests", "audit-strict", "audit-profiles"] as const;

for (const [index, pattern] of GITHUB_ACTIONS_CI_CONTRACT.forbiddenPatterns.entries()) {
  test(`consolidated GitHub Actions CI contract rejects legacy job ${legacyJobs[index]}`, () => {
    const source = readFileSync(".github/workflows/ci.yml", "utf8");
    const job = legacyJobs[index];

    assert.ok(job);

    const mutated = `${source}\n  ${job}:\n    runs-on: ubuntu-latest\n`;
    const report = inspectGithubActionsCiContract(mutated);

    assert.ok(
      report.violations.includes(`forbidden legacy job: ${pattern.source}`),
    );
  });
}
