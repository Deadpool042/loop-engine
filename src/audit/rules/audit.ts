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

export const AUDIT_CI_SCRIPT_RULE: AuditRule = {
  id: "AUDIT-011",
  category: "architecture",
  severity: "warning",
  title: "CI script runs validation and strict audit",
  description: "The project should expose a CI script that runs validation and strict audit checks.",
  check: () => {
    const packagePath = "package.json";

    if (!existsSync(packagePath)) {
      return fail(
        AUDIT_CI_SCRIPT_RULE,
        "Package manifest is missing.",
        [packagePath],
        "Restore package.json so the CI script can be exposed.",
      );
    }

    const content = readFileSync(packagePath, "utf8");
    const expectedTokens = [
      '"ci"',
      '"pnpm run validate && pnpm run audit:strict && pnpm run audit:profiles"',
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_CI_SCRIPT_RULE,
        "CI validation script is missing or incomplete.",
        missing,
        "Expose ci as pnpm run validate && pnpm run audit:strict && pnpm run audit:profiles.",
      );
    }

    return pass(
      AUDIT_CI_SCRIPT_RULE,
      "CI validation script runs validate and strict audit.",
      expectedTokens,
    );
  },
};

export const AUDIT_GITHUB_ACTIONS_CI_RULE: AuditRule = {
  id: "AUDIT-012",
  category: "architecture",
  severity: "warning",
  title: "GitHub Actions runs CI script",
  description: "The repository should expose a GitHub Actions workflow that runs the CI script.",
  check: () => {
    const workflowPath = ".github/workflows/ci.yml";

    if (!existsSync(workflowPath)) {
      return fail(
        AUDIT_GITHUB_ACTIONS_CI_RULE,
        "GitHub Actions CI workflow is missing.",
        [workflowPath],
        "Add .github/workflows/ci.yml and run pnpm run ci from the workflow.",
      );
    }

    const content = readFileSync(workflowPath, "utf8");
    const expectedTokens = [
      "uses: actions/checkout@v4",
      "uses: pnpm/action-setup@v4",
      "uses: actions/setup-node@v4",
      "run: pnpm install --frozen-lockfile",
      "run: pnpm run ci",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_GITHUB_ACTIONS_CI_RULE,
        "GitHub Actions CI workflow is incomplete.",
        missing,
        "Ensure the workflow installs dependencies and runs pnpm run ci.",
      );
    }

    return pass(
      AUDIT_GITHUB_ACTIONS_CI_RULE,
      "GitHub Actions CI workflow runs pnpm run ci.",
      expectedTokens,
    );
  },
};

export const AUDIT_RULE_ORDER_RULE: AuditRule = {
  id: "AUDIT-013",
  category: "architecture",
  severity: "warning",
  title: "Audit rules are ordered logically",
  description: "Critical audit rules should stay in logical order for stable human and JSON reporting.",
  check: () => {
    const rulesPath = "src/audit/rules.ts";

    if (!existsSync(rulesPath)) {
      return fail(
        AUDIT_RULE_ORDER_RULE,
        "Audit rule registry is missing.",
        [rulesPath],
        "Restore src/audit/rules.ts so rule ordering can be verified.",
      );
    }

    const content = readFileSync(rulesPath, "utf8");
    const registryStart = content.indexOf("export const AUDIT_RULES");
    const registryEnd = content.indexOf("];", registryStart);
    const registry = content.slice(registryStart, registryEnd);

    const expectedOrder = [
      "AUDIT_GLOBAL_STATUS_RULE",
      "AUDIT_STRICT_MODE_RULE",
      "AUDIT_STRICT_SCRIPT_RULE",
      "AUDIT_CI_SCRIPT_RULE",
      "AUDIT_GITHUB_ACTIONS_CI_RULE",
    ];

    const positions = expectedOrder.map((token) => ({
      token,
      index: registry.indexOf(token),
    }));

    const missing = positions
      .filter(({ index }) => index < 0)
      .map(({ token }) => token);

    if (missing.length > 0) {
      return fail(
        AUDIT_RULE_ORDER_RULE,
        "Audit rule ordering cannot be verified because rules are missing.",
        missing,
        "Keep the critical audit rules registered in src/audit/rules.ts.",
      );
    }

    const outOfOrder = positions
      .slice(1)
      .filter(({ index }, offset) => {
        const previous = positions[offset];

        return previous !== undefined && index <= previous.index;
      })
      .map(({ token }) => token);

    if (outOfOrder.length > 0) {
      return fail(
        AUDIT_RULE_ORDER_RULE,
        "Critical audit rules are not ordered logically.",
        outOfOrder,
        "Order critical rules as global status, strict mode, strict script, CI script, then GitHub Actions CI.",
      );
    }

    return pass(
      AUDIT_RULE_ORDER_RULE,
      "Critical audit rules are ordered logically.",
      expectedOrder,
    );
  },
};

export const AUDIT_CLI_STRICT_ROUTING_RULE: AuditRule = {
  id: "AUDIT-014",
  category: "architecture",
  severity: "warning",
  title: "Audit strict mode is routed by the CLI",
  description: "The CLI audit branch should parse --strict and set a non-zero exit code when the audit status is not pass.",
  check: () => {
    const cliPath = "src/cli.ts";

    if (!existsSync(cliPath)) {
      return fail(
        AUDIT_CLI_STRICT_ROUTING_RULE,
        "CLI router is missing.",
        [cliPath],
        "Restore src/cli.ts so audit strict routing can be verified.",
      );
    }

    const content = readFileSync(cliPath, "utf8");
    const auditBranchIndex = content.indexOf('command === "audit"');

    if (auditBranchIndex < 0) {
      return fail(
        AUDIT_CLI_STRICT_ROUTING_RULE,
        "CLI router does not expose the audit command branch.",
        ['command === "audit"'],
        "Route the audit command from src/cli.ts.",
      );
    }

    const auditBranch = content.slice(auditBranchIndex);
    const expectedTokens = [
      'process.argv.includes("--strict")',
      "report.summary.status",
      '"pass"',
      "process.exitCode = 1",
    ];

    const missing = expectedTokens.filter((token) => !auditBranch.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_CLI_STRICT_ROUTING_RULE,
        "CLI audit branch does not fully route strict mode.",
        missing,
        "Parse --strict in the audit branch and set process.exitCode = 1 when report.summary.status is not pass.",
      );
    }

    return pass(
      AUDIT_CLI_STRICT_ROUTING_RULE,
      "CLI audit branch routes strict mode.",
      expectedTokens,
    );
  },
};

export const AUDIT_RULE_ID_UNIQUENESS_RULE: AuditRule = {
  id: "AUDIT-015",
  category: "architecture",
  severity: "warning",
  title: "Audit rule ids are unique",
  description: "The audit registry should not expose duplicate rule ids.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_ID_UNIQUENESS_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule id uniqueness can be verified.",
      );
    }

    const ruleIds = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return Array.from(content.matchAll(/\bid:\s*"([^"]+)"/g))
        .map((match) => match[1])
        .filter((ruleId): ruleId is string => Boolean(ruleId));
    });

    const seen = new Set<string>();
    const duplicateIds = ruleIds.filter((ruleId) => {
      if (seen.has(ruleId)) {
        return true;
      }

      seen.add(ruleId);
      return false;
    });

    if (duplicateIds.length > 0) {
      return fail(
        AUDIT_RULE_ID_UNIQUENESS_RULE,
        "Audit rule ids are duplicated.",
        duplicateIds,
        "Ensure every audit rule declares a unique id.",
      );
    }

    return pass(
      AUDIT_RULE_ID_UNIQUENESS_RULE,
      "Audit rule ids are unique.",
      ruleIds,
    );
  },
};

export const AUDIT_RULE_REGISTRY_COMPLETENESS_RULE: AuditRule = {
  id: "AUDIT-016",
  category: "architecture",
  severity: "warning",
  title: "Audit rule registry is complete",
  description: "The audit rule registry should include every exported audit rule exactly once.",
  check: () => {
    const registryPath = "src/audit/rules.ts";
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];

    const missingFiles = [registryPath, ...ruleFiles].filter(
      (file) => !existsSync(file),
    );

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_REGISTRY_COMPLETENESS_RULE,
        "Some audit registry files are missing.",
        missingFiles,
        "Restore missing audit registry files so registry completeness can be verified.",
      );
    }

    const declaredRules = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return Array.from(
        content.matchAll(/export const ([A-Z0-9_]+_RULE): AuditRule/g),
      )
        .map((match) => match[1])
        .filter((ruleName): ruleName is string => Boolean(ruleName));
    });

    const registryContent = readFileSync(registryPath, "utf8");
    const registryStart = registryContent.indexOf("export const AUDIT_RULES");
    const registryEnd = registryContent.indexOf("];", registryStart);

    if (registryStart < 0 || registryEnd < 0) {
      return fail(
        AUDIT_RULE_REGISTRY_COMPLETENESS_RULE,
        "Audit rule registry cannot be parsed.",
        ["export const AUDIT_RULES"],
        "Keep AUDIT_RULES declared as a static array in src/audit/rules.ts.",
      );
    }

    const registry = registryContent.slice(registryStart, registryEnd);
    const registeredRules = Array.from(
      registry.matchAll(/\b([A-Z0-9_]+_RULE)\b/g),
    )
      .map((match) => match[1])
      .filter((ruleName): ruleName is string => Boolean(ruleName));

    const missingFromRegistry = declaredRules.filter(
      (ruleName) => !registeredRules.includes(ruleName),
    );
    const orphanRegistryEntries = registeredRules.filter(
      (ruleName) => !declaredRules.includes(ruleName),
    );

    if (missingFromRegistry.length > 0 || orphanRegistryEntries.length > 0) {
      return fail(
        AUDIT_RULE_REGISTRY_COMPLETENESS_RULE,
        "Audit rule registry is not complete.",
        [
          ...missingFromRegistry.map((ruleName) => `missing: ${ruleName}`),
          ...orphanRegistryEntries.map((ruleName) => `orphan: ${ruleName}`),
        ],
        "Ensure every exported audit rule appears exactly once in AUDIT_RULES.",
      );
    }

    return pass(
      AUDIT_RULE_REGISTRY_COMPLETENESS_RULE,
      "Audit rule registry includes every exported audit rule.",
      registeredRules,
    );
  },
};

export const AUDIT_RULE_METADATA_COMPLETENESS_RULE: AuditRule = {
  id: "AUDIT-017",
  category: "architecture",
  severity: "warning",
  title: "Audit rule metadata is complete",
  description: "Every audit rule should expose a title and description for human reports.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_METADATA_COMPLETENESS_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule metadata can be verified.",
      );
    }

    const incompleteRules = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      const exports = Array.from(
        content.matchAll(/export const ([A-Z0-9_]+_RULE): AuditRule/g),
      );

      return exports
        .map((match, index) => {
          const ruleName = match[1];
          const start = match.index ?? 0;
          const nextStart = exports[index + 1]?.index ?? content.length;
          const ruleSource = content.slice(start, nextStart);
          const missing = [
            ruleSource.includes("title:") ? "" : "title",
            ruleSource.includes("description:") ? "" : "description",
          ].filter(Boolean);

          return missing.length > 0 && ruleName
            ? `${ruleName}: missing ${missing.join(", ")}`
            : "";
        })
        .filter((detail): detail is string => Boolean(detail));
    });

    if (incompleteRules.length > 0) {
      return fail(
        AUDIT_RULE_METADATA_COMPLETENESS_RULE,
        "Some audit rules have incomplete metadata.",
        incompleteRules,
        "Add title and description fields to every audit rule.",
      );
    }

    return pass(
      AUDIT_RULE_METADATA_COMPLETENESS_RULE,
      "Audit rule metadata is complete.",
      ruleFiles,
    );
  },
};

export const AUDIT_RULE_CATEGORY_VALIDITY_RULE: AuditRule = {
  id: "AUDIT-018",
  category: "architecture",
  severity: "warning",
  title: "Audit rule categories are valid",
  description: "Every audit rule should use one of the supported audit categories.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];
    const validCategories = ["json", "cli", "docs", "architecture"];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_CATEGORY_VALIDITY_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule categories can be verified.",
      );
    }

    const invalidCategories = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return Array.from(
        content.matchAll(
          /export const ([A-Z0-9_]+_RULE): AuditRule[\s\S]*?category:\s*"([^"]+)"/g,
        ),
      )
        .map((match) => {
          const ruleName = match[1];
          const category = match[2];

          return ruleName && category && !validCategories.includes(category)
            ? `${ruleName}: invalid category ${category}`
            : "";
        })
        .filter((detail): detail is string => Boolean(detail));
    });

    if (invalidCategories.length > 0) {
      return fail(
        AUDIT_RULE_CATEGORY_VALIDITY_RULE,
        "Some audit rule categories are invalid.",
        invalidCategories,
        "Use only supported audit categories: json, cli, docs, architecture.",
      );
    }

    return pass(
      AUDIT_RULE_CATEGORY_VALIDITY_RULE,
      "Audit rule categories are valid.",
      validCategories,
    );
  },
};

export const AUDIT_RULE_SEVERITY_VALIDITY_RULE: AuditRule = {
  id: "AUDIT-019",
  category: "architecture",
  severity: "warning",
  title: "Audit rule severities are valid",
  description: "Every audit rule should use one of the supported audit severities.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];
    const validSeverities = ["error", "warning"];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_SEVERITY_VALIDITY_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule severities can be verified.",
      );
    }

    const invalidSeverities = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return Array.from(
        content.matchAll(
          /export const ([A-Z0-9_]+_RULE): AuditRule[\s\S]*?severity:\s*"([^"]+)"/g,
        ),
      )
        .map((match) => {
          const ruleName = match[1];
          const severity = match[2];

          return ruleName && severity && !validSeverities.includes(severity)
            ? `${ruleName}: invalid severity ${severity}`
            : "";
        })
        .filter((detail): detail is string => Boolean(detail));
    });

    if (invalidSeverities.length > 0) {
      return fail(
        AUDIT_RULE_SEVERITY_VALIDITY_RULE,
        "Some audit rule severities are invalid.",
        invalidSeverities,
        "Use only supported audit severities: error, warning.",
      );
    }

    return pass(
      AUDIT_RULE_SEVERITY_VALIDITY_RULE,
      "Audit rule severities are valid.",
      validSeverities,
    );
  },
};

export const AUDIT_RULE_PRIORITY_VALIDITY_RULE: AuditRule = {
  id: "AUDIT-020",
  category: "architecture",
  severity: "warning",
  title: "Audit rule priorities are valid",
  description: "Every audit finding helper should use one of the supported audit priorities.",
  check: () => {
    const findingFile = "src/audit/findings.ts";
    const validPriorities = ["low", "medium", "high"];

    if (!existsSync(findingFile)) {
      return fail(
        AUDIT_RULE_PRIORITY_VALIDITY_RULE,
        "Audit finding helpers are missing.",
        [findingFile],
        "Restore src/audit/findings.ts so audit priorities can be verified.",
      );
    }

    const content = readFileSync(findingFile, "utf8");
    const priorityMatches = Array.from(
      content.matchAll(/priority:\s*"([^"]+)"/g),
    );
    const invalidPriorities = priorityMatches
      .map((match) => match[1])
      .filter((priority): priority is string => Boolean(priority))
      .filter((priority) => !validPriorities.includes(priority));

    if (invalidPriorities.length > 0) {
      return fail(
        AUDIT_RULE_PRIORITY_VALIDITY_RULE,
        "Some audit priorities are invalid.",
        invalidPriorities,
        "Use only supported audit priorities: low, medium, high.",
      );
    }

    return pass(
      AUDIT_RULE_PRIORITY_VALIDITY_RULE,
      "Audit priorities are valid.",
      validPriorities,
    );
  },
};

export const AUDIT_FINDING_STATUS_VALIDITY_RULE: AuditRule = {
  id: "AUDIT-021",
  category: "architecture",
  severity: "warning",
  title: "Audit finding statuses are valid",
  description: "Every audit finding helper should use one of the supported audit statuses.",
  check: () => {
    const findingFile = "src/audit/findings.ts";
    const validStatuses = ["pass", "fail", "skipped"];

    if (!existsSync(findingFile)) {
      return fail(
        AUDIT_FINDING_STATUS_VALIDITY_RULE,
        "Audit finding helpers are missing.",
        [findingFile],
        "Restore src/audit/findings.ts so audit finding statuses can be verified.",
      );
    }

    const content = readFileSync(findingFile, "utf8");
    const statusMatches = Array.from(
      content.matchAll(/status:\s*"([^"]+)"/g),
    );

    const invalidStatuses = statusMatches
      .map((match) => match[1])
      .filter((status): status is string => Boolean(status))
      .filter((status) => !validStatuses.includes(status));

    if (invalidStatuses.length > 0) {
      return fail(
        AUDIT_FINDING_STATUS_VALIDITY_RULE,
        "Some audit finding statuses are invalid.",
        invalidStatuses,
        "Use only supported audit statuses: pass, fail, skipped.",
      );
    }

    return pass(
      AUDIT_FINDING_STATUS_VALIDITY_RULE,
      "Audit finding statuses are valid.",
      validStatuses,
    );
  },
};

export const AUDIT_FINDING_IDENTITY_FIELDS_RULE: AuditRule = {
  id: "AUDIT-022",
  category: "architecture",
  severity: "warning",
  title: "Audit finding identity fields are preserved",
  description: "Audit finding helpers should preserve rule id, category, and severity.",
  check: () => {
    const findingFile = "src/audit/findings.ts";
    const expectedTokens = [
      "ruleId: rule.id",
      "category: rule.category",
      "severity: rule.severity",
    ];

    if (!existsSync(findingFile)) {
      return fail(
        AUDIT_FINDING_IDENTITY_FIELDS_RULE,
        "Audit finding helpers are missing.",
        [findingFile],
        "Restore src/audit/findings.ts so audit finding identity fields can be verified.",
      );
    }

    const content = readFileSync(findingFile, "utf8");
    const missingTokens = expectedTokens.filter((token) => !content.includes(token));

    if (missingTokens.length > 0) {
      return fail(
        AUDIT_FINDING_IDENTITY_FIELDS_RULE,
        "Audit finding helpers do not preserve all rule identity fields.",
        missingTokens,
        "Ensure audit finding helpers set ruleId, category, and severity from the source rule.",
      );
    }

    return pass(
      AUDIT_FINDING_IDENTITY_FIELDS_RULE,
      "Audit finding identity fields are preserved.",
      expectedTokens,
    );
  },
};

export const AUDIT_FINDING_DIAGNOSTIC_FIELDS_RULE: AuditRule = {
  id: "AUDIT-023",
  category: "architecture",
  severity: "warning",
  title: "Audit finding diagnostic fields are preserved",
  description: "Audit finding helpers should preserve diagnostic message, details, and recommendations.",
  check: () => {
    const findingFile = "src/audit/findings.ts";
    const expectedTokens = [
      "message",
      "details",
      "recommendation",
    ];

    if (!existsSync(findingFile)) {
      return fail(
        AUDIT_FINDING_DIAGNOSTIC_FIELDS_RULE,
        "Audit finding helpers are missing.",
        [findingFile],
        "Restore src/audit/findings.ts so audit finding diagnostic fields can be verified.",
      );
    }

    const content = readFileSync(findingFile, "utf8");
    const missingTokens = expectedTokens.filter(
      (token) => !new RegExp(`\\b${token}\\b`).test(content),
    );

    if (missingTokens.length > 0) {
      return fail(
        AUDIT_FINDING_DIAGNOSTIC_FIELDS_RULE,
        "Audit finding helpers do not preserve all diagnostic fields.",
        missingTokens,
        "Ensure audit finding helpers expose message, details, and recommendation fields.",
      );
    }

    return pass(
      AUDIT_FINDING_DIAGNOSTIC_FIELDS_RULE,
      "Audit finding diagnostic fields are preserved.",
      expectedTokens,
    );
  },
};

export const AUDIT_RULE_ID_PREFIX_RULE: AuditRule = {
  id: "AUDIT-024",
  category: "architecture",
  severity: "warning",
  title: "Audit rule ids match their categories",
  description: "Every audit rule id should use the prefix associated with its declared category.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];
    const expectedPrefixes: Record<string, string> = {
      json: "JSON-",
      cli: "CLI-",
      docs: "DOCS-",
      architecture: "AUDIT-",
    };

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_ID_PREFIX_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule id prefixes can be verified.",
      );
    }

    const invalidPrefixes = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      const exports = Array.from(
        content.matchAll(/export const ([A-Z0-9_]+_RULE): AuditRule/g),
      );

      return exports
        .map((match, index) => {
          const ruleName = match[1];
          const start = match.index ?? 0;
          const nextStart = exports[index + 1]?.index ?? content.length;
          const ruleSource = content.slice(start, nextStart);
          const id = ruleSource.match(/\bid:\s*"([^"]+)"/)?.[1];
          const category = ruleSource.match(/\bcategory:\s*"([^"]+)"/)?.[1];
          const expectedPrefix = category ? expectedPrefixes[category] : undefined;

          if (!ruleName || !id || !category || !expectedPrefix || id.startsWith(expectedPrefix)) {
            return "";
          }

          return `${ruleName}: ${id} should use prefix ${expectedPrefix} for category ${category}`;
        })
        .filter((detail): detail is string => Boolean(detail));
    });

    if (invalidPrefixes.length > 0) {
      return fail(
        AUDIT_RULE_ID_PREFIX_RULE,
        "Some audit rule ids do not match their categories.",
        invalidPrefixes,
        "Use the expected rule id prefixes: JSON-, CLI-, DOCS-, AUDIT-.",
      );
    }

    return pass(
      AUDIT_RULE_ID_PREFIX_RULE,
      "Audit rule ids match their categories.",
      Object.entries(expectedPrefixes).map(([category, prefix]) => `${category}: ${prefix}`),
    );
  },
};

export const AUDIT_RULE_TITLE_UNIQUENESS_RULE: AuditRule = {
  id: "AUDIT-025",
  category: "architecture",
  severity: "warning",
  title: "Audit rule titles are unique",
  description: "Every audit rule title should be unique for clear human audit reports.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_TITLE_UNIQUENESS_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule titles can be verified.",
      );
    }

    const titleEntries = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      const exports = Array.from(
        content.matchAll(/export const ([A-Z0-9_]+_RULE): AuditRule/g),
      );

      return exports
        .map((match, index) => {
          const ruleName = match[1];
          const start = match.index ?? 0;
          const nextStart = exports[index + 1]?.index ?? content.length;
          const ruleSource = content.slice(start, nextStart);
          const title = ruleSource.match(/\btitle:\s*"([^"]+)"/)?.[1];

          return ruleName && title ? { ruleName, title } : undefined;
        })
        .filter(
          (entry): entry is { ruleName: string; title: string } =>
            Boolean(entry),
        );
    });

    const titlesByRule = new Map<string, string[]>();

    for (const { ruleName, title } of titleEntries) {
      titlesByRule.set(title, [...(titlesByRule.get(title) ?? []), ruleName]);
    }

    const duplicateTitles = Array.from(titlesByRule.entries())
      .filter(([, rules]) => rules.length > 1)
      .map(([title, rules]) => `${title}: ${rules.join(", ")}`);

    if (duplicateTitles.length > 0) {
      return fail(
        AUDIT_RULE_TITLE_UNIQUENESS_RULE,
        "Some audit rule titles are duplicated.",
        duplicateTitles,
        "Use a unique title for every audit rule.",
      );
    }

    return pass(
      AUDIT_RULE_TITLE_UNIQUENESS_RULE,
      "Audit rule titles are unique.",
      titleEntries.map(({ title }) => title),
    );
  },
};

export const AUDIT_RULE_DESCRIPTION_UNIQUENESS_RULE: AuditRule = {
  id: "AUDIT-026",
  category: "architecture",
  severity: "warning",
  title: "Audit rule descriptions are unique",
  description: "Every audit rule description should be unique for clear audit rule documentation.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_DESCRIPTION_UNIQUENESS_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so rule descriptions can be verified.",
      );
    }

    const descriptionEntries = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");
      const exports = Array.from(
        content.matchAll(/export const ([A-Z0-9_]+_RULE): AuditRule/g),
      );

      return exports
        .map((match, index) => {
          const ruleName = match[1];
          const start = match.index ?? 0;
          const nextStart = exports[index + 1]?.index ?? content.length;
          const ruleSource = content.slice(start, nextStart);
          const description = ruleSource.match(/\bdescription:\s*"([^"]+)"/)?.[1];

          return ruleName && description ? { ruleName, description } : undefined;
        })
        .filter(
          (entry): entry is { ruleName: string; description: string } =>
            Boolean(entry),
        );
    });

    const descriptionsByRule = new Map<string, string[]>();

    for (const { ruleName, description } of descriptionEntries) {
      descriptionsByRule.set(description, [
        ...(descriptionsByRule.get(description) ?? []),
        ruleName,
      ]);
    }

    const duplicateDescriptions = Array.from(descriptionsByRule.entries())
      .filter(([, rules]) => rules.length > 1)
      .map(([description, rules]) => `${description}: ${rules.join(", ")}`);

    if (duplicateDescriptions.length > 0) {
      return fail(
        AUDIT_RULE_DESCRIPTION_UNIQUENESS_RULE,
        "Some audit rule descriptions are duplicated.",
        duplicateDescriptions,
        "Use a unique description for every audit rule.",
      );
    }

    return pass(
      AUDIT_RULE_DESCRIPTION_UNIQUENESS_RULE,
      "Audit rule descriptions are unique.",
      descriptionEntries.map(({ description }) => description),
    );
  },
};

export const AUDIT_RULE_EXPORT_NAME_CONVENTION_RULE: AuditRule = {
  id: "AUDIT-027",
  category: "architecture",
  severity: "warning",
  title: "Audit rule export names follow convention",
  description: "Every exported audit rule should use an uppercase _RULE export name for registry consistency.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];
    const exportNamePattern = /^[A-Z0-9_]+_RULE$/;

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_EXPORT_NAME_CONVENTION_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so export name conventions can be verified.",
      );
    }

    const exportNames = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return Array.from(
        content.matchAll(/export const ([A-Za-z0-9_]+): AuditRule/g),
      )
        .map((match) => match[1])
        .filter((ruleName): ruleName is string => Boolean(ruleName));
    });

    const invalidExportNames = exportNames.filter(
      (ruleName) => !exportNamePattern.test(ruleName),
    );

    if (invalidExportNames.length > 0) {
      return fail(
        AUDIT_RULE_EXPORT_NAME_CONVENTION_RULE,
        "Some audit rule export names do not follow convention.",
        invalidExportNames,
        "Use UPPER_SNAKE_CASE names ending with _RULE for every exported audit rule.",
      );
    }

    return pass(
      AUDIT_RULE_EXPORT_NAME_CONVENTION_RULE,
      "Audit rule export names follow convention.",
      exportNames,
    );
  },
};

export const AUDIT_RULE_EXPORT_NAME_UNIQUENESS_RULE: AuditRule = {
  id: "AUDIT-028",
  category: "architecture",
  severity: "warning",
  title: "Audit rule export names are unique",
  description: "Every exported audit rule should use a unique export name across rule files.",
  check: () => {
    const ruleFiles = [
      "src/audit/rules/json.ts",
      "src/audit/rules/cli.ts",
      "src/audit/rules/docs.ts",
      "src/audit/rules/audit.ts",
    ];

    const missingFiles = ruleFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_RULE_EXPORT_NAME_UNIQUENESS_RULE,
        "Some audit rule files are missing.",
        missingFiles,
        "Restore missing audit rule files so export name uniqueness can be verified.",
      );
    }

    const exportEntries = ruleFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return Array.from(
        content.matchAll(/export const ([A-Za-z0-9_]+): AuditRule/g),
      )
        .map((match) => match[1])
        .filter((ruleName): ruleName is string => Boolean(ruleName))
        .map((ruleName) => ({ file, ruleName }));
    });

    const exportsByName = new Map<string, string[]>();

    for (const { file, ruleName } of exportEntries) {
      exportsByName.set(ruleName, [...(exportsByName.get(ruleName) ?? []), file]);
    }

    const duplicateExports = Array.from(exportsByName.entries())
      .filter(([, files]) => files.length > 1)
      .map(([ruleName, files]) => `${ruleName}: ${files.join(", ")}`);

    if (duplicateExports.length > 0) {
      return fail(
        AUDIT_RULE_EXPORT_NAME_UNIQUENESS_RULE,
        "Some audit rule export names are duplicated.",
        duplicateExports,
        "Use a unique export name for every audit rule.",
      );
    }

    return pass(
      AUDIT_RULE_EXPORT_NAME_UNIQUENESS_RULE,
      "Audit rule export names are unique.",
      exportEntries.map(({ ruleName }) => ruleName),
    );
  },
};

export const AUDIT_RULE_ID_SEQUENCE_RULE: AuditRule = {
  id: "AUDIT-029",
  category: "architecture",
  severity: "warning",
  title: "Audit rule ids are contiguous within the AUDIT prefix",
  description: "AUDIT-prefixed rule ids should form a contiguous sequence without gaps.",
  check: () => {
    const ruleFile = "src/audit/rules/audit.ts";

    if (!existsSync(ruleFile)) {
      return fail(
        AUDIT_RULE_ID_SEQUENCE_RULE,
        "Audit rule file is missing.",
        [ruleFile],
        "Restore src/audit/rules/audit.ts so AUDIT rule id sequencing can be verified.",
      );
    }

    const content = readFileSync(ruleFile, "utf8");
    const auditIds = Array.from(content.matchAll(/\bid:\s*"AUDIT-(\d{3})"/g))
      .map((match) => Number(match[1]))
      .filter((id) => Number.isInteger(id))
      .sort((left, right) => left - right);

    const expectedIds = Array.from(
      { length: Math.max(...auditIds) },
      (_, index) => index + 1,
    );

    const missingIds = expectedIds
      .filter((id) => !auditIds.includes(id))
      .map((id) => `AUDIT-${String(id).padStart(3, "0")}`);

    if (missingIds.length > 0) {
      return fail(
        AUDIT_RULE_ID_SEQUENCE_RULE,
        "AUDIT rule ids are not contiguous.",
        missingIds,
        "Keep AUDIT-prefixed rule ids contiguous when adding, removing, or renumbering audit architecture rules.",
      );
    }

    return pass(
      AUDIT_RULE_ID_SEQUENCE_RULE,
      "AUDIT rule ids are contiguous within the AUDIT prefix.",
      auditIds.map((id) => `AUDIT-${String(id).padStart(3, "0")}`),
    );
  },
};

export const AUDIT_PROFILE_TYPE_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-030",
  category: "architecture",
  severity: "warning",
  title: "Audit profiles are typed",
  description: "The audit engine should expose typed audit profiles for profile-based execution.",
  check: () => {
    const typesPath = "src/audit/types.ts";

    if (!existsSync(typesPath)) {
      return fail(
        AUDIT_PROFILE_TYPE_EXPOSURE_RULE,
        "Audit types file is missing.",
        [typesPath],
        "Restore src/audit/types.ts so audit profiles can be typed.",
      );
    }

    const content = readFileSync(typesPath, "utf8");
    const expectedTokens = [
      "export const AUDIT_PROFILES",
      "export type AuditProfile",
      "\"quick\"",
      "\"strict\"",
      "\"release\"",
      "\"docs\"",
      "\"json\"",
      "\"architecture\"",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_TYPE_EXPOSURE_RULE,
        "Audit profiles are not fully typed.",
        missing,
        "Expose AUDIT_PROFILES and AuditProfile in src/audit/types.ts.",
      );
    }

    return pass(
      AUDIT_PROFILE_TYPE_EXPOSURE_RULE,
      "Audit profiles are typed.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_DEFINITION_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-031",
  category: "architecture",
  severity: "warning",
  title: "Audit profile definitions are exposed",
  description: "The audit engine should expose profile definitions that map audit profiles to audit categories.",
  check: () => {
    const profilesPath = "src/audit/profiles.ts";

    if (!existsSync(profilesPath)) {
      return fail(
        AUDIT_PROFILE_DEFINITION_EXPOSURE_RULE,
        "Audit profile definitions file is missing.",
        [profilesPath],
        "Create src/audit/profiles.ts with AUDIT_PROFILE_DEFINITIONS.",
      );
    }

    const content = readFileSync(profilesPath, "utf8");
    const expectedTokens = [
      "export type AuditProfileDefinition",
      "export const AUDIT_PROFILE_DEFINITIONS",
      "Record<AuditProfile, AuditProfileDefinition>",
      "quick",
      "strict",
      "release",
      "docs",
      "json",
      "architecture",
      "categories",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_DEFINITION_EXPOSURE_RULE,
        "Audit profile definitions are incomplete.",
        missing,
        "Expose every supported audit profile in AUDIT_PROFILE_DEFINITIONS.",
      );
    }

    return pass(
      AUDIT_PROFILE_DEFINITION_EXPOSURE_RULE,
      "Audit profile definitions are exposed.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_HELPERS_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-032",
  category: "architecture",
  severity: "warning",
  title: "Audit profile helpers are exposed",
  description: "The audit engine should expose helpers for validating and resolving audit profiles.",
  check: () => {
    const profilesPath = "src/audit/profiles.ts";

    if (!existsSync(profilesPath)) {
      return fail(
        AUDIT_PROFILE_HELPERS_EXPOSURE_RULE,
        "Audit profile helpers file is missing.",
        [profilesPath],
        "Create src/audit/profiles.ts with profile helper functions.",
      );
    }

    const content = readFileSync(profilesPath, "utf8");
    const expectedTokens = [
      "export function isAuditProfile",
      "value is AuditProfile",
      "export function getAuditProfileDefinition",
      "AUDIT_PROFILE_DEFINITIONS[profile]",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_HELPERS_EXPOSURE_RULE,
        "Audit profile helpers are incomplete.",
        missing,
        "Expose isAuditProfile and getAuditProfileDefinition in src/audit/profiles.ts.",
      );
    }

    return pass(
      AUDIT_PROFILE_HELPERS_EXPOSURE_RULE,
      "Audit profile helpers are exposed.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_RULE_SELECTION_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-033",
  category: "architecture",
  severity: "warning",
  title: "Audit rules are selectable by profile",
  description: "The audit engine should expose a pure helper for selecting audit rules by audit profile.",
  check: () => {
    const profilesPath = "src/audit/profiles.ts";

    if (!existsSync(profilesPath)) {
      return fail(
        AUDIT_PROFILE_RULE_SELECTION_EXPOSURE_RULE,
        "Audit profile selection file is missing.",
        [profilesPath],
        "Create src/audit/profiles.ts with selectAuditRulesForProfile.",
      );
    }

    const content = readFileSync(profilesPath, "utf8");
    const expectedTokens = [
      "export function selectAuditRulesForProfile",
      "profile: AuditProfile",
      "rules: readonly AuditRule[]",
      "getAuditProfileDefinition(profile)",
      "definition.categories.includes(rule.category)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_RULE_SELECTION_EXPOSURE_RULE,
        "Audit profile rule selection helper is incomplete.",
        missing,
        "Expose selectAuditRulesForProfile in src/audit/profiles.ts.",
      );
    }

    return pass(
      AUDIT_PROFILE_RULE_SELECTION_EXPOSURE_RULE,
      "Audit rules are selectable by profile.",
      expectedTokens,
    );
  },
};

export const AUDIT_RUNNER_PROFILE_OPTION_RULE: AuditRule = {
  id: "AUDIT-034",
  category: "architecture",
  severity: "warning",
  title: "Audit runner accepts profile options",
  description: "The audit runner should accept internal profile options before CLI profile routing is exposed.",
  check: () => {
    const runnerPath = "src/audit/runner.ts";

    if (!existsSync(runnerPath)) {
      return fail(
        AUDIT_RUNNER_PROFILE_OPTION_RULE,
        "Audit runner file is missing.",
        [runnerPath],
        "Create src/audit/runner.ts with AuditRunOptions.",
      );
    }

    const content = readFileSync(runnerPath, "utf8");
    const expectedTokens = [
      "export type AuditRunOptions",
      "readonly profile?: AuditProfile",
      "selectAuditRulesForProfile",
      "options: AuditRunOptions = {}",
      "options.profile === undefined",
      "rules.map",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RUNNER_PROFILE_OPTION_RULE,
        "Audit runner profile option support is incomplete.",
        missing,
        "Wire AuditRunOptions into runAudit without changing CLI behavior.",
      );
    }

    return pass(
      AUDIT_RUNNER_PROFILE_OPTION_RULE,
      "Audit runner accepts profile options.",
      expectedTokens,
    );
  },
};

export const AUDIT_CLI_PROFILE_PARSING_RULE: AuditRule = {
  id: "AUDIT-035",
  category: "architecture",
  severity: "warning",
  title: "Audit command parses profile option",
  description: "The audit command should parse and validate an optional profile before passing it to the audit runner.",
  check: () => {
    const commandPath = "src/commands/audit.ts";

    if (!existsSync(commandPath)) {
      return fail(
        AUDIT_CLI_PROFILE_PARSING_RULE,
        "Audit command file is missing.",
        [commandPath],
        "Create src/commands/audit.ts with profile option parsing.",
      );
    }

    const content = readFileSync(commandPath, "utf8");
    const expectedTokens = [
      "parseAuditProfileOption",
      "args.indexOf(\"--profile\")",
      "isAuditProfile(value)",
      "Invalid audit profile",
      "const profile = parseAuditProfileOption(process.argv)",
      "runAudit({ profile })",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_CLI_PROFILE_PARSING_RULE,
        "Audit CLI profile parsing is incomplete.",
        missing,
        "Parse --profile in the audit command and pass the validated profile to runAudit.",
      );
    }

    return pass(
      AUDIT_CLI_PROFILE_PARSING_RULE,
      "Audit command parses profile option.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_CHECK_SCRIPT_RULE: AuditRule = {
  id: "AUDIT-036",
  category: "architecture",
  severity: "warning",
  title: "Audit profiles are checked by CI",
  description: "The project should explicitly check JSON, docs, and architecture audit profiles in CI.",
  check: () => {
    const scriptPath = "scripts/audit-profile-check.ts";
    const packagePath = "package.json";

    if (!existsSync(scriptPath) || !existsSync(packagePath)) {
      return fail(
        AUDIT_PROFILE_CHECK_SCRIPT_RULE,
        "Audit profile check script or package manifest is missing.",
        [scriptPath, packagePath],
        "Create scripts/audit-profile-check.ts and wire pnpm run audit:profiles into CI.",
      );
    }

    const scriptContent = readFileSync(scriptPath, "utf8");
    const packageContent = readFileSync(packagePath, "utf8");

    const expectedTokens = [
      "PROFILE_EXPECTATIONS",
      "profile: \"json\"",
      "profile: \"docs\"",
      "profile: \"architecture\"",
      "\"--profile\"",
      "summary.byCategory",
      "finding.category",
      "\"audit:profiles\"",
      "pnpm run audit:profiles",
    ];

    const haystack = `${scriptContent}\n${packageContent}`;
    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_CHECK_SCRIPT_RULE,
        "Audit profile CI checks are incomplete.",
        missing,
        "Check json, docs, and architecture profiles and run the check from CI.",
      );
    }

    return pass(
      AUDIT_PROFILE_CHECK_SCRIPT_RULE,
      "Audit profiles are checked by CI.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_CHECK_ALL_PUBLIC_PROFILES_RULE: AuditRule = {
  id: "AUDIT-037",
  category: "architecture",
  severity: "warning",
  title: "All public audit profiles are checked by CI",
  description: "The audit profile CI check should cover every public audit profile.",
  check: () => {
    const scriptPath = "scripts/audit-profile-check.ts";

    if (!existsSync(scriptPath)) {
      return fail(
        AUDIT_PROFILE_CHECK_ALL_PUBLIC_PROFILES_RULE,
        "Audit profile check script is missing.",
        [scriptPath],
        "Create scripts/audit-profile-check.ts and cover every public audit profile.",
      );
    }

    const scriptContent = readFileSync(scriptPath, "utf8");

    const expectedTokens = [
      "PROFILE_EXPECTATIONS",
      "profile: \"quick\"",
      "profile: \"strict\"",
      "profile: \"release\"",
      "profile: \"json\"",
      "profile: \"docs\"",
      "profile: \"architecture\"",
      "categories: [\"architecture\", \"cli\"]",
      "categories: [\"json\", \"cli\", \"docs\", \"architecture\"]",
      "\"--profile\"",
      "finding.category",
    ];

    const missing = expectedTokens.filter((token) => !scriptContent.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_CHECK_ALL_PUBLIC_PROFILES_RULE,
        "Audit profile CI check does not cover every public profile.",
        missing,
        "Check quick, strict, release, json, docs, and architecture profiles.",
      );
    }

    return pass(
      AUDIT_PROFILE_CHECK_ALL_PUBLIC_PROFILES_RULE,
      "All public audit profiles are checked by CI.",
      expectedTokens,
    );
  },
};

