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

export const README_SEE_ALSO_UNIQUE_RULE: AuditRule = {
  id: "DOCS-003",
  category: "docs",
  severity: "warning",
  title: "README see also links are unique",
  description: "The README should not list duplicate documentation links in the See also section.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_SEE_ALSO_UNIQUE_RULE,
        "README is missing.",
        [readmePath],
        "Restore README.md so documentation links can be verified.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const marker = "Voir aussi :";
    const markerIndex = content.indexOf(marker);

    if (markerIndex < 0) {
      return fail(
        README_SEE_ALSO_UNIQUE_RULE,
        "README does not expose a See also section.",
        [marker],
        "Keep a Voir aussi section in README.md for documentation discoverability.",
      );
    }

    const section = content.slice(markerIndex);
    const links = section
      .split("\\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- `") && line.endsWith("`"));

    const seen = new Set<string>();
    const duplicates = links.filter((link) => {
      if (seen.has(link)) {
        return true;
      }

      seen.add(link);
      return false;
    });

    if (duplicates.length > 0) {
      return fail(
        README_SEE_ALSO_UNIQUE_RULE,
        "README See also section contains duplicate links.",
        duplicates,
        "Remove duplicate documentation links from README.md.",
      );
    }

    return pass(
      README_SEE_ALSO_UNIQUE_RULE,
      "README See also links are unique.",
      links,
    );
  },
};

export const AUDIT_FINAL_REPORT_README_CHECKS_RULE: AuditRule = {
  id: "DOCS-004",
  category: "docs",
  severity: "warning",
  title: "Final audit report documents README checks",
  description: "The final audit report should mention the README audit rules and current rule count.",
  check: () => {
    const reportPath = "docs/audits/audit-engine-v1-final.md";

    if (!existsSync(reportPath)) {
      return fail(
        AUDIT_FINAL_REPORT_README_CHECKS_RULE,
        "Final audit report is missing.",
        [reportPath],
        "Restore docs/audits/audit-engine-v1-final.md and document the current audit rules.",
      );
    }

    const content = readFileSync(reportPath, "utf8");
    const expectedTokens = [
      "24 règles",
      "`DOCS-002`",
      "`DOCS-003`",
      "Couverture README",
      "pnpm loop audit",
      "pnpm run ci",
      "Voir aussi",
      "README utilisateur aligné",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_FINAL_REPORT_README_CHECKS_RULE,
        "Final audit report does not document all README audit checks.",
        missing,
        "Document DOCS-002, DOCS-003, the README audit commands, and the current rule count in the final audit report.",
      );
    }

    return pass(
      AUDIT_FINAL_REPORT_README_CHECKS_RULE,
      "Final audit report documents README checks.",
      expectedTokens,
    );
  },
};
