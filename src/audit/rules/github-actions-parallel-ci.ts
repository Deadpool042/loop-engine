import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { inspectGithubActionsCiContract } from "../github-actions-ci-contract.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const WORKFLOW_PATH = ".github/workflows/ci.yml";

export const AUDIT_GITHUB_ACTIONS_PARALLEL_CI_RULE: AuditRule = {
  id: "AUDIT-012",
  category: "architecture",
  severity: "warning",
  title: "GitHub Actions enforces the parallel CI contract",
  description:
    "The repository should expose a fail-closed parallel GitHub Actions workflow with one aggregate CI gate.",
  check: () => {
    if (!existsSync(WORKFLOW_PATH)) {
      return fail(
        AUDIT_GITHUB_ACTIONS_PARALLEL_CI_RULE,
        "GitHub Actions CI workflow is missing.",
        [WORKFLOW_PATH],
        "Restore .github/workflows/ci.yml with the required parallel jobs and fail-closed CI gate.",
      );
    }

    const report = inspectGithubActionsCiContract(
      readFileSync(WORKFLOW_PATH, "utf8"),
    );

    if (report.missing.length > 0) {
      return fail(
        AUDIT_GITHUB_ACTIONS_PARALLEL_CI_RULE,
        "GitHub Actions parallel CI contract is incomplete.",
        report.missing,
        "Restore every required parallel job, CI gate dependency, result binding, and fail-closed gate invariant.",
      );
    }

    return pass(
      AUDIT_GITHUB_ACTIONS_PARALLEL_CI_RULE,
      "GitHub Actions enforces the parallel CI contract.",
      [WORKFLOW_PATH],
    );
  },
};
