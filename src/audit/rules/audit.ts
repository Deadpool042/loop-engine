import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import type { AuditRule } from "../types.js";

export const AUDIT_SCORE_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-001",
  category: "architecture",
  severity: "warning",
  title: "Audit score is exposed in model, runner, and human report",
  description: "The audit score should be typed, computed, and displayed in the human audit report.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "score: number;",
      },
      {
        file: "src/audit/runner.ts",
        token: "const score =",
      },
      {
        file: "src/commands/audit.ts",
        token: "Score:",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_SCORE_EXPOSURE_RULE,
        "Audit score is not fully exposed.",
        missing,
        "Ensure the score is typed in AuditReport, computed in runAudit, and printed by the human audit command.",
      );
    }

    return pass(
      AUDIT_SCORE_EXPOSURE_RULE,
      "Audit score is typed, computed, and displayed.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_PRIORITY_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-002",
  category: "architecture",
  severity: "warning",
  title: "Audit findings expose priority",
  description: "Audit findings should expose a priority field for downstream reporting.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "priority: AuditPriority;",
      },
      {
        file: "src/audit/findings.ts",
        token: "priority: getPriority",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_PRIORITY_EXPOSURE_RULE,
        "Audit priority is not fully exposed.",
        missing,
        "Ensure AuditFinding exposes priority and findings populate it through the finding helpers.",
      );
    }

    return pass(
      AUDIT_PRIORITY_EXPOSURE_RULE,
      "Audit priority is typed and populated.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_RECOMMENDATION_SUPPORT_RULE: AuditRule = {
  id: "AUDIT-003",
  category: "architecture",
  severity: "warning",
  title: "Audit findings support recommendations",
  description: "Audit findings should support structured recommendations for downstream reporting.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "recommendation?: string;",
      },
      {
        file: "src/audit/findings.ts",
        token: "recommendation?: string",
      },
      {
        file: "src/audit/findings.ts",
        token: "...(recommendation ? { recommendation } : {})",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_SUPPORT_RULE,
        "Audit recommendations are not fully supported.",
        missing,
        "Ensure AuditFinding exposes recommendation and failing findings can populate it through fail().",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_SUPPORT_RULE,
      "Audit recommendations are typed and supported by findings.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_CATEGORY_SUMMARY_RULE: AuditRule = {
  id: "AUDIT-004",
  category: "architecture",
  severity: "warning",
  title: "Audit summary exposes category counts",
  description: "The audit summary should expose finding counts grouped by category.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "byCategory: Partial<Record<AuditCategory, number>>;",
      },
      {
        file: "src/audit/runner.ts",
        token: "const byCategory =",
      },
      {
        file: "src/commands/audit.ts",
        token: 'terminal.section("Categories");',
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_CATEGORY_SUMMARY_RULE,
        "Audit category summary is not fully exposed.",
        missing,
        "Ensure byCategory is typed in AuditReport, computed in runAudit, and displayed by the human audit command.",
      );
    }

    return pass(
      AUDIT_CATEGORY_SUMMARY_RULE,
      "Audit category summary is typed, computed, and displayed.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_RECOMMENDATION_REPORT_RULE: AuditRule = {
  id: "AUDIT-005",
  category: "architecture",
  severity: "warning",
  title: "Human audit report prints recommendations",
  description: "The human audit report should expose actionable recommendations when findings provide them.",
  check: () => {
    const expectations = [
      {
        file: "src/commands/audit.ts",
        token: 'terminal.section("Recommendations");',
      },
      {
        file: "src/commands/audit.ts",
        token: "finding.recommendation",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_REPORT_RULE,
        "Human audit report does not fully expose recommendations.",
        missing,
        "Ensure printAuditReport renders a Recommendations section for findings with recommendations.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_REPORT_RULE,
      "Human audit report prints finding recommendations.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_PRIORITY_SUMMARY_RULE: AuditRule = {
  id: "AUDIT-006",
  category: "architecture",
  severity: "warning",
  title: "Audit summary exposes priority counts",
  description: "The audit summary should expose finding counts grouped by priority.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "byPriority: Partial<Record<AuditPriority, number>>;",
      },
      {
        file: "src/audit/runner.ts",
        token: "const byPriority =",
      },
      {
        file: "src/commands/audit.ts",
        token: 'terminal.section("Priorities");',
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_PRIORITY_SUMMARY_RULE,
        "Audit priority summary is not fully exposed.",
        missing,
        "Ensure byPriority is typed in AuditReport, computed in runAudit, and displayed by the human audit command.",
      );
    }

    return pass(
      AUDIT_PRIORITY_SUMMARY_RULE,
      "Audit priority summary is typed, computed, and displayed.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_RECOMMENDATION_SUMMARY_RULE: AuditRule = {
  id: "AUDIT-007",
  category: "architecture",
  severity: "warning",
  title: "Audit report exposes recommendation summary",
  description: "The audit JSON report should expose a top-level recommendation summary for downstream reporting.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "recommendations: readonly AuditRecommendation[];",
      },
      {
        file: "src/audit/runner.ts",
        token: "const recommendations =",
      },
      {
        file: "src/audit/runner.ts",
        token: "recommendations,",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_SUMMARY_RULE,
        "Audit recommendation summary is not fully exposed.",
        missing,
        "Ensure AuditReport exposes recommendations and runAudit derives them from findings with recommendations.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_SUMMARY_RULE,
      "Audit recommendation summary is typed and computed.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_GLOBAL_STATUS_RULE: AuditRule = {
  id: "AUDIT-008",
  category: "architecture",
  severity: "warning",
  title: "Audit summary exposes global status",
  description: "The audit summary should expose a global status for downstream reporting and CI usage.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: 'export type AuditSummaryStatus = "pass" | "warning" | "fail";',
      },
      {
        file: "src/audit/types.ts",
        token: "status: AuditSummaryStatus;",
      },
      {
        file: "src/audit/runner.ts",
        token: "const status =",
      },
      {
        file: "src/commands/audit.ts",
        token: "Status:",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_GLOBAL_STATUS_RULE,
        "Audit global status is not fully exposed.",
        missing,
        "Ensure summary.status is typed, computed in runAudit, and displayed by the human audit command.",
      );
    }

    return pass(
      AUDIT_GLOBAL_STATUS_RULE,
      "Audit global status is typed, computed, and displayed.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_STRICT_MODE_RULE: AuditRule = {
  id: "AUDIT-009",
  category: "architecture",
  severity: "warning",
  title: "Audit command supports strict mode",
  description: "The audit command should support strict mode for CI-oriented non-zero exits.",
  check: () => {
    const expectations = [
      {
        file: "src/cli.ts",
        token: 'const strict = process.argv.includes("--strict");',
      },
      {
        file: "src/cli.ts",
        token: 'if (strict && report.summary.status !== "pass")',
      },
      {
        file: "src/commands/audit.ts",
        token: "export function printAuditReport(): AuditReport",
      },
      {
        file: "src/commands/audit.ts",
        token: "export function printAuditReportJson(): AuditReport",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_STRICT_MODE_RULE,
        "Audit strict mode is not fully wired.",
        missing,
        "Ensure audit --strict derives process.exitCode from summary.status for both human and JSON output.",
      );
    }

    return pass(
      AUDIT_STRICT_MODE_RULE,
      "Audit strict mode is wired for human and JSON output.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_STRICT_SCRIPT_RULE: AuditRule = {
  id: "AUDIT-010",
  category: "architecture",
  severity: "warning",
  title: "Audit strict script is available",
  description: "The project should expose a package script for strict audit usage in CI.",
  check: () => {
    const packagePath = "package.json";

    if (!existsSync(packagePath)) {
      return fail(
        AUDIT_STRICT_SCRIPT_RULE,
        "Package manifest is missing.",
        [packagePath],
        "Restore package.json so the strict audit script can be exposed.",
      );
    }

    const content = readFileSync(packagePath, "utf8");
    const expectedTokens = [
      '"audit:strict"',
      '"tsx src/cli.ts audit --json --strict"',
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_STRICT_SCRIPT_RULE,
        "Strict audit script is missing or incomplete.",
        missing,
        "Expose audit:strict as tsx src/cli.ts audit --json --strict.",
      );
    }

    return pass(
      AUDIT_STRICT_SCRIPT_RULE,
      "Strict audit script is available.",
      expectedTokens,
    );
  },
};
