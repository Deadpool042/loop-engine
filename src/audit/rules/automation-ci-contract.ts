import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { inspectGithubActionsCiContract } from "../github-actions-ci-contract.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const WORKFLOW_PATH = ".github/workflows/ci.yml";

export const AUTOMATION_CI_CONTRACT_RULE: AuditRule = {
  id: "AUDIT-513",
  category: "architecture",
  severity: "error",
  title: "Automation architecture CI contract remains fail-closed",
  description:
    "The canonical CI workflow runs focused Automation tests, validates AUDIT-503 through AUDIT-512 in strict audit and profiles, and aggregates the result through CI gate.",
  metadata: {
    introducedIn: "V18.8",
    tags: ["architecture", "contract", "ci"],
    stability: "stable",
    dependsOn: ["AUDIT-512"],
  },
  check: () => {
    if (!existsSync(WORKFLOW_PATH)) {
      return fail(
        AUTOMATION_CI_CONTRACT_RULE,
        "Automation architecture CI workflow is missing.",
        [WORKFLOW_PATH],
        "Restore the canonical CI workflow and its fail-closed Automation architecture job.",
      );
    }

    const report = inspectGithubActionsCiContract(
      readFileSync(WORKFLOW_PATH, "utf8"),
    );

    return report.missing.length > 0
      ? fail(
          AUTOMATION_CI_CONTRACT_RULE,
          "Automation architecture CI contract is incomplete.",
          report.missing,
          "Restore the exact Automation commands, AUDIT-503 through AUDIT-512 verification, and CI gate dependency.",
        )
      : pass(
          AUTOMATION_CI_CONTRACT_RULE,
          "Automation architecture CI contract remains fail-closed.",
          [WORKFLOW_PATH],
        );
  },
};
