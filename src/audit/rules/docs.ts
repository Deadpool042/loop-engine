import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import type { AuditRule } from "../types.js";

export const AUDIT_DOCUMENTATION_COVERAGE_RULE: AuditRule = {
  id: "DOCS-001",
  category: "docs",
  severity: "warning",
  title: "Audit engine documentation covers human and JSON reports",
  description: "The audit documentation should describe both human-readable and JSON report outputs.",
  check: () => {
    const docsPath = "docs/audits/audit-engine-v1-final.md";

    if (!existsSync(docsPath)) {
      return fail(
        AUDIT_DOCUMENTATION_COVERAGE_RULE,
        "Audit engine documentation is missing.",
        [docsPath],
        "Create docs/audits/audit-engine-v1-final.md and document the audit command outputs.",
      );
    }

    const content = readFileSync(docsPath, "utf8").toLowerCase();

    const expectedTerms = [
      "audit",
      "--json",
      "rapport humain",
      "rapport json",
    ];

    const missing = expectedTerms.filter(
      (term) => !content.includes(term.toLowerCase()),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_DOCUMENTATION_COVERAGE_RULE,
        "Audit engine documentation does not cover all expected report outputs.",
        missing,
        "Document the human audit report and the audit --json report contract.",
      );
    }

    return pass(
      AUDIT_DOCUMENTATION_COVERAGE_RULE,
      "Audit engine documentation covers human and JSON report outputs.",
      expectedTerms,
    );
  },
};

export const README_AUDIT_CI_DOCUMENTATION_RULE: AuditRule = {
  id: "DOCS-002",
  category: "docs",
  severity: "warning",
  title: "README documents audit and CI commands",
  description: "The README should document the public audit and CI commands.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_AUDIT_CI_DOCUMENTATION_RULE,
        "README is missing.",
        [readmePath],
        "Restore README.md and document audit and CI commands.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const expectedTokens = [
      "## Audit et CI",
      "pnpm loop audit",
      "pnpm loop audit --json",
      "pnpm loop audit --strict",
      "pnpm loop audit --json --strict",
      "pnpm run audit:strict",
      "pnpm run ci",
      "summary.status",
      "summary.score",
      "recommendations",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        README_AUDIT_CI_DOCUMENTATION_RULE,
        "README audit and CI documentation is incomplete.",
        missing,
        "Document the audit command, strict audit mode, CI script, and JSON report fields in README.md.",
      );
    }

    return pass(
      README_AUDIT_CI_DOCUMENTATION_RULE,
      "README documents audit and CI commands.",
      expectedTokens,
    );
  },
};
