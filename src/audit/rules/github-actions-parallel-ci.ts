import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { inspectGithubActionsCiContract } from "../github-actions-ci-contract.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const WORKFLOW_PATH = ".github/workflows/ci.yml";

export const AUDIT_GITHUB_ACTIONS_CI_RULE: AuditRule = {
  id: "AUDIT-012",
  category: "architecture",
  severity: "warning",
  title: "GitHub Actions enforces the consolidated CI contract",
  description:
    "The repository should expose one fail-closed reference validation gate with a single Node bootstrap and Corepack-managed pnpm.",
  check: () => {
    if (!existsSync(WORKFLOW_PATH)) {
      return fail(
        AUDIT_GITHUB_ACTIONS_CI_RULE,
        "GitHub Actions CI workflow is missing.",
        [WORKFLOW_PATH],
        "Restore .github/workflows/ci.yml with Quality and one fail-closed CI gate.",
      );
    }

    const report = inspectGithubActionsCiContract(
      readFileSync(WORKFLOW_PATH, "utf8"),
    );

    if (report.missing.length > 0 || report.violations.length > 0) {
      return fail(
        AUDIT_GITHUB_ACTIONS_CI_RULE,
        "GitHub Actions consolidated CI contract is incomplete.",
        [...report.missing, ...report.violations],
        "Restore Quality plus one CI gate with one Node setup, Corepack-managed pnpm, one dependency install, and pnpm run ci.",
      );
    }

    return pass(
      AUDIT_GITHUB_ACTIONS_CI_RULE,
      "GitHub Actions enforces the consolidated CI contract.",
      [WORKFLOW_PATH],
    );
  },
};
