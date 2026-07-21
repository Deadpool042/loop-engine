import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

function verifyRegistryContract(
  rule: AuditRule,
  expectedTokens: readonly string[],
  messages: {
    readonly pass: string;
    readonly fail: string;
    readonly recommendation: string;
  },
): ReturnType<typeof pass> {
  const registryPath = "src/audit/registry.ts";
  const content = existsSync(registryPath)
    ? readFileSync(registryPath, "utf8")
    : "";
  const missing = expectedTokens.filter((token) => !content.includes(token));

  return missing.length === 0
    ? pass(rule, messages.pass, expectedTokens)
    : fail(
        rule,
        messages.fail,
        missing.length > 0 ? missing : [registryPath],
      messages.recommendation,
    );
}

function isAuditRuleId(value: string): boolean {
  if (!value.startsWith("AUDIT-")) {
    return false;
  }

  const digits = value.slice("AUDIT-".length);
  return digits.length === 3 && [...digits].every((digit) => digit >= "0" && digit <= "9");
}

function parseAuditRuleId(value: string): number | null {
  return isAuditRuleId(value) ? Number(value.slice("AUDIT-".length)) : null;
}

function formatAuditRuleId(value: number): string {
  return `AUDIT-${String(value).padStart(3, "0")}`;
}

export type AuditRuleIdIntegrityReport = Readonly<{
  ids: readonly string[];
  duplicateIds: readonly string[];
  invalidIds: readonly string[];
  outOfOrderIds: readonly string[];
  missingIds: readonly string[];
  hasAudit420: boolean;
}>;

export function inspectAuditRuleIdIntegrity(
  rules: readonly { readonly id: string }[],
  minimumId = 1,
): AuditRuleIdIntegrityReport {
  const auditIds = rules
    .map((rule) => rule.id)
    .filter((id) => id.startsWith("AUDIT-"));
  const invalidIds = Array.from(
    new Set(auditIds.filter((id) => !isAuditRuleId(id))),
  );
  const duplicateIds = Array.from(
    new Set(auditIds.filter((id, index) => auditIds.indexOf(id) !== index)),
  );

  const numericIds = auditIds
    .map((id) => ({ id, value: parseAuditRuleId(id) }))
    .filter(
      (entry): entry is Readonly<{ id: string; value: number }> =>
        entry.value !== null,
    );

  const outOfOrderIds: string[] = [];
  for (let index = 1; index < numericIds.length; index += 1) {
    const current = numericIds[index];
    const previous = numericIds[index - 1];

    if (current !== undefined && previous !== undefined && current.value < previous.value) {
      outOfOrderIds.push(current.id);
    }
  }

  const uniqueNumericIds = Array.from(
    new Set(numericIds.map((entry) => entry.value)),
  ).sort((left, right) => left - right);
  const missingIds: string[] = [];

  if (uniqueNumericIds.length > 0) {
    const highestId = uniqueNumericIds[uniqueNumericIds.length - 1]!;
    const presentIds = new Set(uniqueNumericIds);

    for (let value = minimumId; value <= highestId; value += 1) {
      if (!presentIds.has(value)) {
        missingIds.push(formatAuditRuleId(value));
      }
    }
  }

  return Object.freeze({
    ids: Object.freeze([...auditIds]),
    duplicateIds: Object.freeze([...duplicateIds]),
    invalidIds: Object.freeze([...invalidIds]),
    outOfOrderIds: Object.freeze([...outOfOrderIds]),
    missingIds: Object.freeze([...missingIds]),
    hasAudit420: auditIds.includes("AUDIT-420"),
  });
}

let registeredAuditRulesForIntegrityCheck: readonly { readonly id: string }[] | null =
  null;

export function registerAuditRulesForIntegrityCheck(
  rules: readonly { readonly id: string }[],
): void {
  registeredAuditRulesForIntegrityCheck = rules;
}

export const AUDIT_SCORE_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-001",
  category: "architecture",
  severity: "warning",
  title: "Audit score is exposed in model, runner, and human report",
  description:
    "The audit score should be typed, computed, and displayed in the human audit report.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "Audit findings should expose a priority field for downstream reporting.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "Audit findings should support structured recommendations for downstream reporting.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The audit summary should expose finding counts grouped by category.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The human audit report should expose actionable recommendations when findings provide them.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The audit summary should expose finding counts grouped by priority.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The audit JSON report should expose a top-level recommendation summary for downstream reporting.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The audit summary should expose a global status for downstream reporting and CI usage.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The audit command should support strict mode for CI-oriented non-zero exits.",
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
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
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
  description:
    "The project should expose a package script for strict audit usage in CI.",
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
  description:
    "The project should expose a CI script that runs validation and strict audit checks.",
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
  description:
    "The repository should expose a GitHub Actions workflow that runs the CI script.",
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
    const expectedPatterns = [
      /uses:\s*actions\/checkout@v\d+/,
      /uses:\s*pnpm\/action-setup@v\d+/,
      /uses:\s*actions\/setup-node@v\d+/,
      /run:\s*pnpm install --frozen-lockfile/,
      /run:\s*pnpm run ci/,
    ];

    const missing = expectedPatterns
      .filter((pattern) => !pattern.test(content))
      .map((pattern) => pattern.source);

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
      expectedPatterns.map((pattern) => pattern.source),
    );
  },
};

export const AUDIT_RULE_ORDER_RULE: AuditRule = {
  id: "AUDIT-013",
  category: "architecture",
  severity: "warning",
  title: "Audit rules are ordered logically",
  description:
    "Critical audit rules should stay in logical order for stable human and JSON reporting.",
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
    const registryStart = content.indexOf("createAuditRuleRegistry([");
    const registryEnd = content.indexOf("])", registryStart);
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
  description:
    "The CLI audit branch should parse --strict and set a non-zero exit code when the audit status is not pass.",
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

    const missing = expectedTokens.filter(
      (token) => !auditBranch.includes(token),
    );

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
  description:
    "The audit rule registry should include every exported audit rule exactly once.",
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
    const registryStart = registryContent.indexOf("createAuditRuleRegistry([");
    const registryEnd = registryContent.indexOf("])", registryStart);

    if (registryStart < 0 || registryEnd < 0) {
      return fail(
        AUDIT_RULE_REGISTRY_COMPLETENESS_RULE,
        "Audit rule registry cannot be parsed.",
        ["createAuditRuleRegistry(["],
        "Keep AUDIT_RULES declared through createAuditRuleRegistry in src/audit/rules.ts.",
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
  description:
    "Every audit rule should expose a title and description for human reports.",
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
          const isFactoryRule =
            ruleSource.includes("openClawProtocolRule(") ||
            ruleSource.includes("noOpenClawProtocolIoRule(") ||
            ruleSource.includes("executableMappingRule(") ||
            ruleSource.includes("noExecutableMappingIoRule(") ||
            ruleSource.includes("transportIntentRule(") ||
            ruleSource.includes("noTransportIntentSurfaceRule(") ||
            ruleSource.includes("capabilityPolicyRule(") ||
            ruleSource.includes("noCapabilityPolicySurfaceRule(") ||
            ruleSource.includes("authorizationConfigurationRule(") ||
            ruleSource.includes("noAuthorizationConfigurationSurfaceRule(") ||
            ruleSource.includes("transportRequestRule(") ||
            ruleSource.includes("noTransportRequestSurfaceRule(") ||
            ruleSource.includes("transportRequestBuilderRule(") ||
            ruleSource.includes("noTransportRequestBuilderSurfaceRule(") ||
            ruleSource.includes("executionReviewRule(") ||
            ruleSource.includes("noExecutionReviewSurfaceRule(") ||
            ruleSource.includes("approvalProvenanceRule(") ||
            ruleSource.includes("noApprovalProvenanceSurfaceRule(") ||
            ruleSource.includes("handoffEligibilityRule(") ||
            ruleSource.includes("noHandoffEligibilitySurfaceRule(") ||
            ruleSource.includes("v11ConsolidationRule(") ||
            ruleSource.includes("dispatchDescriptorRule(") ||
            ruleSource.includes("noDispatchDescriptorSurfaceRule(") ||
            ruleSource.includes("boundaryHandoffRule(") ||
            ruleSource.includes("noBoundaryHandoffSurfaceRule(") ||
            ruleSource.includes("executionBoundaryRfcRule(") ||
            ruleSource.includes("noExecutionBoundaryRfcSurfaceRule(") ||
            ruleSource.includes("executionArchitectureRfcRule(") ||
            ruleSource.includes("operatorApprovalRfcRule(") ||
            ruleSource.includes("operatorApprovalRfcDocumentRule(") ||
            ruleSource.includes("noOperatorApprovalRfcSurfaceRule(") ||
            ruleSource.includes("authorityVerificationRfcRule(") ||
            ruleSource.includes("authorityVerificationRfcDocumentRule(") ||
            ruleSource.includes("noAuthorityVerificationRfcSurfaceRule(") ||
            ruleSource.includes("authorityLifecycleRule(") ||
            ruleSource.includes("bridgeContractRule(") ||
            ruleSource.includes("bridgeRequestRule(") ||
            ruleSource.includes("executionBridgeRule(") ||
            ruleSource.includes("runtimeRequestRule(") ||
            ruleSource.includes("runtimeResolutionRule(") ||
            ruleSource.includes("runtimeDescriptorRule(") ||
            ruleSource.includes("runtimeRegistryRule(") ||
            ruleSource.includes("runtimeCapabilityRule(") ||
            ruleSource.includes("runtimeCapabilityReconciliationRule(") ||
            ruleSource.includes("standardTestDiscoveryRule(") ||
            ruleSource.includes("declarativeRuntimeExecutionBridgeRule(") ||
            ruleSource.includes("runtimeExecutionPolicyAdmissionRule(") ||
            ruleSource.includes("runtimeExecutionPlanRule(") ||
            ruleSource.includes("simulatedRuntimeAdapterRule(") ||
            ruleSource.includes("runtimeExecutionReceiptRule(") ||
            ruleSource.includes("policyBoundLocalProcessBridgeRule(");
          if (isFactoryRule) return "";
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
  description:
    "Every audit rule should use one of the supported audit categories.",
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
  description:
    "Every audit rule should use one of the supported audit severities.",
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
  description:
    "Every audit finding helper should use one of the supported audit priorities.",
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
  description:
    "Every audit finding helper should use one of the supported audit statuses.",
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
    const statusMatches = Array.from(content.matchAll(/status:\s*"([^"]+)"/g));

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
  description:
    "Audit finding helpers should preserve rule id, category, and severity.",
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
    const missingTokens = expectedTokens.filter(
      (token) => !content.includes(token),
    );

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
  description:
    "Audit finding helpers should preserve diagnostic message, details, and recommendations.",
  check: () => {
    const findingFile = "src/audit/findings.ts";
    const expectedTokens = ["message", "details", "recommendation"];

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
  description:
    "Every audit rule id should use the prefix associated with its declared category.",
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
          const expectedPrefix = category
            ? expectedPrefixes[category]
            : undefined;

          if (
            !ruleName ||
            !id ||
            !category ||
            !expectedPrefix ||
            id.startsWith(expectedPrefix)
          ) {
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
      Object.entries(expectedPrefixes).map(
        ([category, prefix]) => `${category}: ${prefix}`,
      ),
    );
  },
};

export const AUDIT_RULE_TITLE_UNIQUENESS_RULE: AuditRule = {
  id: "AUDIT-025",
  category: "architecture",
  severity: "warning",
  title: "Audit rule titles are unique",
  description:
    "Every audit rule title should be unique for clear human audit reports.",
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
        .filter((entry): entry is { ruleName: string; title: string } =>
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
  description:
    "Every audit rule description should be unique for clear audit rule documentation.",
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
          const description = ruleSource.match(
            /\bdescription:\s*"([^"]+)"/,
          )?.[1];

          return ruleName && description
            ? { ruleName, description }
            : undefined;
        })
        .filter((entry): entry is { ruleName: string; description: string } =>
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
  description:
    "Every exported audit rule should use an uppercase _RULE export name for registry consistency.",
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
  description:
    "Every exported audit rule should use a unique export name across rule files.",
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
      exportsByName.set(ruleName, [
        ...(exportsByName.get(ruleName) ?? []),
        file,
      ]);
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
  description:
    "AUDIT-prefixed rule ids should form a contiguous sequence without gaps, in the registered audit rule inventory.",
  check: () => {
    const registry = registeredAuditRulesForIntegrityCheck;

    if (registry === null) {
      return fail(
        AUDIT_RULE_ID_SEQUENCE_RULE,
        "Audit rule registry is unavailable.",
        ["registered audit inventory"],
        "Register the audit rule inventory before evaluating AUDIT rule id continuity.",
      );
    }

    const report = inspectAuditRuleIdIntegrity(registry);
    const issues = [
      ...report.invalidIds.map((id) => `invalid: ${id}`),
      ...report.duplicateIds.map((id) => `duplicate: ${id}`),
      ...report.missingIds.map((id) => `missing: ${id}`),
      ...(report.hasAudit420 ? [] : ["missing: AUDIT-420"]),
    ];

    if (issues.length > 0) {
      return fail(
        AUDIT_RULE_ID_SEQUENCE_RULE,
        "AUDIT rule ids are not valid, ordered, or contiguous in the registered inventory.",
        issues,
        "Keep AUDIT-prefixed rule ids unique, valid, ordered, contiguous, and inclusive of AUDIT-420 in the registered audit inventory.",
      );
    }

    return pass(
      AUDIT_RULE_ID_SEQUENCE_RULE,
      "AUDIT rule ids are unique, valid, ordered, contiguous, and include AUDIT-420 in the registered inventory.",
      report.ids,
    );
  },
};

export const AUDIT_PROFILE_TYPE_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-030",
  category: "architecture",
  severity: "warning",
  title: "Audit profiles are typed",
  description:
    "The audit engine should expose typed audit profiles for profile-based execution.",
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
      '"quick"',
      '"strict"',
      '"release"',
      '"docs"',
      '"json"',
      '"architecture"',
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
  description:
    "The audit engine should expose profile definitions that map audit profiles to audit categories.",
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

    const missing = expectedTokens.filter(
      (token) => !sourceIncludesToken(content, token),
    );

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
  description:
    "The audit engine should expose helpers for validating and resolving audit profiles.",
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
  description:
    "The audit engine should expose a pure helper for selecting audit rules by audit profile.",
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
  description:
    "The audit runner should accept internal profile options before CLI profile routing is exposed.",
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
  description:
    "The audit command should parse and validate an optional profile before passing it to the audit runner.",
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
      'args.indexOf("--profile")',
      "isAuditProfile(value)",
      "Invalid audit profile",
      "const profile = parseAuditProfileOption(args)",
      "const options = parseAuditCommandOptions(process.argv)",
      "generateAuditReport(options)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_CLI_PROFILE_PARSING_RULE,
        "Audit CLI profile parsing is incomplete.",
        missing,
        "Parse --profile in the audit command and pass the validated profile to the Core audit report generator.",
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
  description:
    "The project should explicitly check JSON, docs, and architecture audit profiles in CI.",
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
      'profile: "json"',
      'profile: "docs"',
      'profile: "architecture"',
      '"--profile"',
      "summary.byCategory",
      "finding.category",
      '"audit:profiles"',
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
  description:
    "The audit profile CI check should cover every public audit profile.",
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
      'profile: "quick"',
      'profile: "strict"',
      'profile: "release"',
      'profile: "json"',
      'profile: "docs"',
      'profile: "architecture"',
      'categories: ["architecture", "cli"]',
      'categories: ["json", "cli", "docs", "architecture"]',
      '"--profile"',
      "finding.category",
    ];

    const missing = expectedTokens.filter(
      (token) => !scriptContent.includes(token),
    );

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

export const AUDIT_INVALID_PROFILE_CHECK_RULE: AuditRule = {
  id: "AUDIT-038",
  category: "architecture",
  severity: "warning",
  title: "Invalid audit profiles are checked by CI",
  description:
    "The audit profile CI check should verify that invalid profile names fail explicitly.",
  check: () => {
    const scriptPath = "scripts/audit-profile-check.ts";

    if (!existsSync(scriptPath)) {
      return fail(
        AUDIT_INVALID_PROFILE_CHECK_RULE,
        "Audit profile check script is missing.",
        [scriptPath],
        "Create scripts/audit-profile-check.ts and verify invalid profile handling.",
      );
    }

    const scriptContent = readFileSync(scriptPath, "utf8");

    const expectedTokens = [
      "spawnSync",
      "assertInvalidProfileFails",
      '"--profile"',
      '"unknown"',
      "result.status !== 0",
      "Invalid audit profile",
    ];

    const missing = expectedTokens.filter(
      (token) => !scriptContent.includes(token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_INVALID_PROFILE_CHECK_RULE,
        "Invalid audit profile handling is not checked by CI.",
        missing,
        "Check that an unknown audit profile exits non-zero and prints Invalid audit profile.",
      );
    }

    return pass(
      AUDIT_INVALID_PROFILE_CHECK_RULE,
      "Invalid audit profiles are checked by CI.",
      expectedTokens,
    );
  },
};

export const AUDIT_MISSING_PROFILE_VALUE_CHECK_RULE: AuditRule = {
  id: "AUDIT-039",
  category: "architecture",
  severity: "warning",
  title: "Missing audit profile values are checked by CI",
  description:
    "The audit profile CI check should verify that --profile without a value fails explicitly.",
  check: () => {
    const scriptPath = "scripts/audit-profile-check.ts";

    if (!existsSync(scriptPath)) {
      return fail(
        AUDIT_MISSING_PROFILE_VALUE_CHECK_RULE,
        "Audit profile check script is missing.",
        [scriptPath],
        "Create scripts/audit-profile-check.ts and verify missing profile value handling.",
      );
    }

    const scriptContent = readFileSync(scriptPath, "utf8");

    const expectedTokens = [
      "assertMissingProfileValueFails",
      '"--profile"',
      "Invalid audit profile: <missing>",
      "result.status !== 0",
    ];

    const missing = expectedTokens.filter(
      (token) => !scriptContent.includes(token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_MISSING_PROFILE_VALUE_CHECK_RULE,
        "Missing audit profile value handling is not checked by CI.",
        missing,
        "Check that --profile without a value exits non-zero and prints Invalid audit profile: <missing>.",
      );
    }

    return pass(
      AUDIT_MISSING_PROFILE_VALUE_CHECK_RULE,
      "Missing audit profile values are checked by CI.",
      expectedTokens,
    );
  },
};

export const AUDIT_PROFILE_CHECK_SCRIPT_FACTORING_RULE: AuditRule = {
  id: "AUDIT-040",
  category: "architecture",
  severity: "warning",
  title: "Audit profile check script is factored",
  description:
    "The audit profile CI check script should use focused helpers for profile execution, category assertions, and failure assertions.",
  check: () => {
    const scriptPath = "scripts/audit-profile-check.ts";

    if (!existsSync(scriptPath)) {
      return fail(
        AUDIT_PROFILE_CHECK_SCRIPT_FACTORING_RULE,
        "Audit profile check script is missing.",
        [scriptPath],
        "Create scripts/audit-profile-check.ts and factor reusable checks into helpers.",
      );
    }

    const scriptContent = readFileSync(scriptPath, "utf8");

    const expectedTokens = [
      "runAuditProfileCommand",
      "getActualCategories",
      "assertExpectedCategories",
      "assertCommandFails",
      "FAILURE_EXPECTATIONS",
      "CommandFailureExpectation",
      "PROFILE_EXPECTATIONS",
      "assertInvalidProfileFails",
      "assertMissingProfileValueFails",
    ];

    const missing = expectedTokens.filter(
      (token) => !scriptContent.includes(token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_PROFILE_CHECK_SCRIPT_FACTORING_RULE,
        "Audit profile check script is not sufficiently factored.",
        missing,
        "Factor profile execution, category assertions, and failure assertions into reusable helpers.",
      );
    }

    return pass(
      AUDIT_PROFILE_CHECK_SCRIPT_FACTORING_RULE,
      "Audit profile check script is factored.",
      expectedTokens,
    );
  },
};

export const AUDIT_RECOMMENDATION_BUILDER_RULE: AuditRule = {
  id: "AUDIT-041",
  category: "architecture",
  severity: "warning",
  title: "Audit recommendations are built by a dedicated helper",
  description:
    "Audit recommendation extraction should be isolated from the runner in a dedicated recommendation builder.",
  check: () => {
    const recommendationPath = "src/audit/recommendations.ts";
    const runnerPath = "src/audit/runner.ts";

    if (!existsSync(recommendationPath) || !existsSync(runnerPath)) {
      return fail(
        AUDIT_RECOMMENDATION_BUILDER_RULE,
        "Audit recommendation builder or runner is missing.",
        [recommendationPath, runnerPath],
        "Create src/audit/recommendations.ts and use it from src/audit/runner.ts.",
      );
    }

    const recommendationContent = readFileSync(recommendationPath, "utf8");
    const runnerContent = readFileSync(runnerPath, "utf8");
    const haystack = `${recommendationContent}\n${runnerContent}`;

    const expectedTokens = [
      "export function buildAuditRecommendations",
      "readonly AuditFinding[]",
      "readonly AuditRecommendation[]",
      "finding.recommendation",
      "ruleId: finding.ruleId",
      "priority: finding.priority",
      "message: finding.recommendation!",
      "buildAuditRecommendations(findings)",
      "./recommendations.js",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_BUILDER_RULE,
        "Audit recommendation extraction is not isolated in a dedicated builder.",
        missing,
        "Move recommendation extraction into src/audit/recommendations.ts and call it from the runner.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_BUILDER_RULE,
      "Audit recommendations are built by a dedicated helper.",
      expectedTokens,
    );
  },
};

export const AUDIT_RECOMMENDATION_BUILDER_TEST_RULE: AuditRule = {
  id: "AUDIT-042",
  category: "architecture",
  severity: "warning",
  title: "Audit recommendation builder is covered by tests",
  description:
    "The dedicated audit recommendation builder should be covered by unit tests.",
  check: () => {
    const testPath = "tests/recommendations.test.ts";

    if (!existsSync(testPath)) {
      return fail(
        AUDIT_RECOMMENDATION_BUILDER_TEST_RULE,
        "Audit recommendation builder test is missing.",
        [testPath],
        "Add tests/recommendations.test.ts to cover buildAuditRecommendations.",
      );
    }

    const testContent = readFileSync(testPath, "utf8");

    const expectedTokens = [
      "buildAuditRecommendations",
      "extracts actionable finding recommendations",
      "returns an empty list when no findings are actionable",
      "assert.deepEqual",
      'recommendation: "Fix the failing audit rule."',
      'priority: "medium"',
      'message: "Fix the failing audit rule."',
      "[]",
    ];

    const missing = expectedTokens.filter(
      (token) => !testContent.includes(token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_BUILDER_TEST_RULE,
        "Audit recommendation builder test coverage is incomplete.",
        missing,
        "Cover recommendation extraction and empty recommendation output.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_BUILDER_TEST_RULE,
      "Audit recommendation builder is covered by tests.",
      expectedTokens,
    );
  },
};

export const AUDIT_RECOMMENDATION_PRIORITY_SORT_RULE: AuditRule = {
  id: "AUDIT-043",
  category: "architecture",
  severity: "warning",
  title: "Audit recommendations are sorted by priority",
  description:
    "Audit recommendations should be sorted deterministically by priority while preserving original order within equal priority.",
  check: () => {
    const recommendationPath = "src/audit/recommendations.ts";
    const testPath = "tests/recommendations.test.ts";

    if (!existsSync(recommendationPath) || !existsSync(testPath)) {
      return fail(
        AUDIT_RECOMMENDATION_PRIORITY_SORT_RULE,
        "Audit recommendation priority sorting implementation or test is missing.",
        [recommendationPath, testPath],
        "Add priority sorting to buildAuditRecommendations and cover it with tests.",
      );
    }

    const recommendationContent = readFileSync(recommendationPath, "utf8");
    const testContent = readFileSync(testPath, "utf8");
    const haystack = `${recommendationContent}\n${testContent}`;

    const expectedTokens = [
      "AUDIT_RECOMMENDATION_PRIORITY_ORDER",
      "Record<AuditPriority, number>",
      "high: 0",
      "medium: 1",
      "low: 2",
      ".map((finding, index) => ({ finding, index }))",
      "priorityDelta === 0 ? left.index - right.index : priorityDelta",
      "sorts recommendations by priority while keeping original order within equal priority",
      '["AUDIT-994", "AUDIT-993", "AUDIT-992", "AUDIT-995"]',
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_PRIORITY_SORT_RULE,
        "Audit recommendation priority sorting is incomplete.",
        missing,
        "Sort recommendations by high, medium, low priority and preserve original order within equal priority.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_PRIORITY_SORT_RULE,
      "Audit recommendations are sorted by priority.",
      expectedTokens,
    );
  },
};

export const AUDIT_RECOMMENDATION_PRIORITY_COUNT_RULE: AuditRule = {
  id: "AUDIT-044",
  category: "architecture",
  severity: "warning",
  title: "Audit recommendations can be counted by priority",
  description:
    "Audit recommendation reporting should expose a pure helper for counting recommendations by priority.",
  check: () => {
    const recommendationPath = "src/audit/recommendations.ts";
    const testPath = "tests/recommendations.test.ts";

    if (!existsSync(recommendationPath) || !existsSync(testPath)) {
      return fail(
        AUDIT_RECOMMENDATION_PRIORITY_COUNT_RULE,
        "Audit recommendation priority count implementation or test is missing.",
        [recommendationPath, testPath],
        "Add countAuditRecommendationsByPriority and cover it with tests.",
      );
    }

    const recommendationContent = readFileSync(recommendationPath, "utf8");
    const testContent = readFileSync(testPath, "utf8");
    const haystack = `${recommendationContent}\n${testContent}`;

    const expectedTokens = [
      "export function countAuditRecommendationsByPriority",
      "recommendations: readonly AuditRecommendation[]",
      "Partial<Record<AuditPriority, number>>",
      "recommendations.reduce<Partial<Record<AuditPriority, number>>>",
      "counts[recommendation.priority] = (counts[recommendation.priority] ?? 0) + 1",
      "countAuditRecommendationsByPriority counts recommendations by priority",
      "countAuditRecommendationsByPriority returns an empty object without recommendations",
      "high: 1",
      "medium: 2",
      "low: 1",
    ];

    const missing = expectedTokens.filter(
      (token) => !sourceIncludesToken(haystack, token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_PRIORITY_COUNT_RULE,
        "Audit recommendation priority count helper is incomplete.",
        missing,
        "Expose and test countAuditRecommendationsByPriority.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_PRIORITY_COUNT_RULE,
      "Audit recommendations can be counted by priority.",
      expectedTokens,
    );
  },
};

export const AUDIT_RECOMMENDATION_PRIORITY_SUMMARY_RULE: AuditRule = {
  id: "AUDIT-045",
  category: "architecture",
  severity: "warning",
  title: "Audit summary exposes recommendation counts by priority",
  description:
    "Audit JSON summary should expose recommendation counts grouped by priority.",
  check: () => {
    const typePath = "src/audit/types.ts";
    const runnerPath = "src/audit/runner.ts";
    const jsonCheckPath = "src/commands/json-check.ts";

    if (
      !existsSync(typePath) ||
      !existsSync(runnerPath) ||
      !existsSync(jsonCheckPath)
    ) {
      return fail(
        AUDIT_RECOMMENDATION_PRIORITY_SUMMARY_RULE,
        "Audit recommendation priority summary implementation is missing.",
        [typePath, runnerPath, jsonCheckPath],
        "Expose summary.recommendationsByPriority and validate it in json-check.",
      );
    }

    const haystack = [
      readFileSync(typePath, "utf8"),
      readFileSync(runnerPath, "utf8"),
      readFileSync(jsonCheckPath, "utf8"),
    ].join("\n");

    const expectedTokens = [
      "recommendationsByPriority: Partial<Record<AuditPriority, number>>;",
      "countAuditRecommendationsByPriority(recommendations)",
      "recommendationsByPriority,",
      'assertField(summary, "recommendationsByPriority")',
      "const recommendationsByPriority = summary.recommendationsByPriority",
      "assertRecord(recommendationsByPriority)",
      "summary.recommendationsByPriority.${priority} must match recommendation priority count",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_PRIORITY_SUMMARY_RULE,
        "Audit recommendation priority summary is incomplete.",
        missing,
        "Expose recommendationsByPriority in the audit summary and validate it against recommendations.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_PRIORITY_SUMMARY_RULE,
      "Audit summary exposes recommendation counts by priority.",
      expectedTokens,
    );
  },
};

export const AUDIT_SUMMARY_CONTRACT_FORMAT_RULE: AuditRule = {
  id: "AUDIT-046",
  category: "architecture",
  severity: "warning",
  title: "Audit summary contract fields are consistently formatted",
  description:
    "Audit summary contract fields should stay aligned for readable generated reports and type reviews.",
  check: () => {
    const typePath = "src/audit/types.ts";

    if (!existsSync(typePath)) {
      return fail(
        AUDIT_SUMMARY_CONTRACT_FORMAT_RULE,
        "Audit summary contract file is missing.",
        [typePath],
        "Restore src/audit/types.ts.",
      );
    }

    const content = readFileSync(typePath, "utf8");

    const expectedBlock = [
      "    score: number;",
      "    byCategory: Partial<Record<AuditCategory, number>>;",
      "    byPriority: Partial<Record<AuditPriority, number>>;",
      "    /**",
      "     * @deprecated Use recommendations.byPriority.",
      "     */",
      "    recommendationsByPriority: Partial<Record<AuditPriority, number>>;",
      "    recommendations: {",
      "      total: number;",
      "      byPriority: Partial<Record<AuditPriority, number>>;",
      "    };",
    ].join("\n");

    if (!content.includes(expectedBlock)) {
      return fail(
        AUDIT_SUMMARY_CONTRACT_FORMAT_RULE,
        "Audit summary contract fields are not consistently formatted.",
        [expectedBlock],
        "Align summary fields in src/audit/types.ts.",
      );
    }

    return pass(
      AUDIT_SUMMARY_CONTRACT_FORMAT_RULE,
      "Audit summary contract fields are consistently formatted.",
      [expectedBlock],
    );
  },
};

export const AUDIT_RECOMMENDATION_TOTAL_SUMMARY_RULE: AuditRule = {
  id: "AUDIT-047",
  category: "architecture",
  severity: "warning",
  title: "Audit summary exposes recommendation totals",
  description:
    "Audit JSON summary should expose the total number of actionable recommendations.",
  check: () => {
    const typePath = "src/audit/types.ts";
    const runnerPath = "src/audit/runner.ts";
    const jsonCheckPath = "src/commands/json-check.ts";

    if (
      !existsSync(typePath) ||
      !existsSync(runnerPath) ||
      !existsSync(jsonCheckPath)
    ) {
      return fail(
        AUDIT_RECOMMENDATION_TOTAL_SUMMARY_RULE,
        "Audit recommendation total summary implementation is missing.",
        [typePath, runnerPath, jsonCheckPath],
        "Expose summary.recommendations.total and validate it against the recommendations array.",
      );
    }

    const haystack = [
      readFileSync(typePath, "utf8"),
      readFileSync(runnerPath, "utf8"),
      readFileSync(jsonCheckPath, "utf8"),
    ].join("\n");

    const expectedTokens = [
      "recommendations: {",
      "total: number;",
      "byPriority: Partial<Record<AuditPriority, number>>;",
      "const recommendationsSummary = {",
      "total: recommendations.length",
      "recommendations: recommendationsSummary,",
      "const summaryRecommendations = summary.recommendations",
      'assertField(summaryRecommendations, "total")',
      'assertNumber(summaryRecommendations.total, "summary.recommendations.total")',
      "summary.recommendations.total must match recommendations length",
      "summary.recommendations.byPriority.${priority} must match recommendation priority count",
    ];

    const missing = expectedTokens.filter((token) => !haystack.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_TOTAL_SUMMARY_RULE,
        "Audit recommendation total summary is incomplete.",
        missing,
        "Expose and validate summary.recommendations.total.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_TOTAL_SUMMARY_RULE,
      "Audit summary exposes recommendation totals.",
      expectedTokens,
    );
  },
};

export const AUDIT_RECOMMENDATION_TOTAL_HUMAN_REPORT_RULE: AuditRule = {
  id: "AUDIT-048",
  category: "architecture",
  severity: "warning",
  title: "Human audit report prints recommendation totals",
  description:
    "The human audit report should expose the total number of actionable recommendations.",
  check: () => {
    const commandPath = "src/commands/audit.ts";

    if (!existsSync(commandPath)) {
      return fail(
        AUDIT_RECOMMENDATION_TOTAL_HUMAN_REPORT_RULE,
        "Audit command file is missing.",
        [commandPath],
        "Restore src/commands/audit.ts.",
      );
    }

    const content = readFileSync(commandPath, "utf8");

    const expectedTokens = [
      "Recommendations: ${report.summary.recommendations.total}",
      "report.summary.recommendations.total",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_TOTAL_HUMAN_REPORT_RULE,
        "Human audit report does not print recommendation totals.",
        missing,
        "Print report.summary.recommendations.total in the human audit summary.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_TOTAL_HUMAN_REPORT_RULE,
      "Human audit report prints recommendation totals.",
      expectedTokens,
    );
  },
};

export const AUDIT_LEGACY_RECOMMENDATIONS_BY_PRIORITY_DOCUMENTATION_RULE: AuditRule =
  {
    id: "AUDIT-049",
    category: "architecture",
    severity: "warning",
    title: "Legacy recommendation priority summary is documented",
    description:
      "The legacy summary.recommendationsByPriority field should stay documented while the canonical nested recommendations summary exists.",
    check: () => {
      const typePath = "src/audit/types.ts";
      const finalReportPath = "docs/audits/audit-engine-v1-final.md";

      if (!existsSync(typePath) || !existsSync(finalReportPath)) {
        return fail(
          AUDIT_LEGACY_RECOMMENDATIONS_BY_PRIORITY_DOCUMENTATION_RULE,
          "Legacy recommendation priority summary documentation files are missing.",
          [typePath, finalReportPath],
          "Document summary.recommendationsByPriority as legacy and keep summary.recommendations.byPriority canonical.",
        );
      }

      const haystack = [
        readFileSync(typePath, "utf8"),
        readFileSync(finalReportPath, "utf8"),
      ].join("\n");

      const expectedTokens = [
        "@deprecated Use recommendations.byPriority.",
        "summary.recommendations.byPriority",
        "summary.recommendationsByPriority",
        "champ canonique",
        "Champ legacy `summary.recommendationsByPriority`",
        "compatibilité",
        "cycle explicite de dépréciation",
      ];

      const missing = expectedTokens.filter(
        (token) => !haystack.includes(token),
      );

      if (missing.length > 0) {
        return fail(
          AUDIT_LEGACY_RECOMMENDATIONS_BY_PRIORITY_DOCUMENTATION_RULE,
          "Legacy recommendation priority summary documentation is incomplete.",
          missing,
          "Document the legacy field and the canonical nested replacement.",
        );
      }

      return pass(
        AUDIT_LEGACY_RECOMMENDATIONS_BY_PRIORITY_DOCUMENTATION_RULE,
        "Legacy recommendation priority summary is documented.",
        expectedTokens,
      );
    },
  };

export const AUDIT_RECOMMENDATION_SUMMARY_SYNC_ASSERTION_RULE: AuditRule = {
  id: "AUDIT-050",
  category: "architecture",
  severity: "warning",
  title: "Recommendation summary sync is asserted at runtime",
  description:
    "The JSON check should assert that the legacy summary.recommendationsByPriority and canonical summary.recommendations.byPriority fields remain synchronized.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        AUDIT_RECOMMENDATION_SUMMARY_SYNC_ASSERTION_RULE,
        "JSON check file is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");

    const expectedTokens = [
      "const actualRecommendationPriorityCount",
      "priority in recommendationsByPriority ? recommendationsByPriority[priority] : 0",
      "const actualSummaryRecommendationPriorityCount",
      "priority in summaryRecommendationsByPriority ? summaryRecommendationsByPriority[priority] : 0",
      "const expectedRecommendationPriorityCount = recommendationPriorityCounts[priority] ?? 0",
      "if (actualRecommendationPriorityCount !== expectedRecommendationPriorityCount)",
      "if (actualSummaryRecommendationPriorityCount !== expectedRecommendationPriorityCount)",
      "summary.recommendationsByPriority.${priority} must match recommendation priority count",
      "summary.recommendations.byPriority.${priority} must match recommendation priority count",
    ];

    const missing = expectedTokens.filter(
      (token) => !sourceIncludesToken(content, token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_RECOMMENDATION_SUMMARY_SYNC_ASSERTION_RULE,
        "Recommendation summary sync assertion is incomplete.",
        missing,
        "Add runtime validation in json-check.ts to assert both fields stay synchronized with the recommendations array.",
      );
    }

    return pass(
      AUDIT_RECOMMENDATION_SUMMARY_SYNC_ASSERTION_RULE,
      "Recommendation summary sync is asserted at runtime.",
      expectedTokens,
    );
  },
};

export const AUDIT_POLICY_ENGINE_MODULE_PRESENCE_RULE: AuditRule = {
  id: "AUDIT-056",
  category: "architecture",
  severity: "warning",
  title: "Agent Policy Engine module is present",
  description:
    "The Agent Policy Engine (V7.4) should expose types, defaults, and a resolver as a dedicated src/policy/ module.",
  check: () => {
    const expectations = [
      {
        file: "src/policy/types.ts",
        token: "export type LoopTaskRequirements",
      },
      { file: "src/policy/types.ts", token: "export type AgentPolicy " },
      {
        file: "src/policy/types.ts",
        token: "export type AgentPolicyResolution",
      },
      {
        file: "src/policy/defaults.ts",
        token: "export function getAllowedPermissionsForMode",
      },
      {
        file: "src/policy/defaults.ts",
        token: "export const DEFAULT_AGENT_POLICY",
      },
      {
        file: "src/policy/resolver.ts",
        token: "export function resolvePolicy",
      },
      {
        file: "src/policy/resolver.ts",
        token: "export function classifyLoopTaskCategory",
      },
    ];

    const missing = expectations
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_POLICY_ENGINE_MODULE_PRESENCE_RULE,
        "Agent Policy Engine module is missing or incomplete.",
        missing,
        "Restore src/policy/types.ts, src/policy/defaults.ts, and src/policy/resolver.ts with LoopTaskRequirements, AgentPolicy, AgentPolicyResolution, getAllowedPermissionsForMode, DEFAULT_AGENT_POLICY, resolvePolicy, and classifyLoopTaskCategory.",
      );
    }

    return pass(
      AUDIT_POLICY_ENGINE_MODULE_PRESENCE_RULE,
      "Agent Policy Engine module is present.",
      expectations.map(({ file, token }) => `${file} -> ${token}`),
    );
  },
};

export const AUDIT_POLICY_CAPABILITY_PERMISSION_SEPARATION_RULE: AuditRule = {
  id: "AUDIT-057",
  category: "architecture",
  severity: "warning",
  title: "Policy requirements separate capabilities from permissions",
  description:
    "LoopTaskRequirements should expose requiredCapabilities and requiredPermissions as two distinct fields, never merged into one.",
  check: () => {
    const typesPath = "src/policy/types.ts";

    if (!existsSync(typesPath)) {
      return fail(
        AUDIT_POLICY_CAPABILITY_PERMISSION_SEPARATION_RULE,
        "Policy types file is missing.",
        [typesPath],
        "Restore src/policy/types.ts so capability/permission separation can be verified.",
      );
    }

    const content = readFileSync(typesPath, "utf8");
    const expectedTokens = [
      "requiredCapabilities: readonly AgentCapability[];",
      "requiredPermissions: readonly AgentPermission[];",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_POLICY_CAPABILITY_PERMISSION_SEPARATION_RULE,
        "Policy requirements do not clearly separate capabilities from permissions.",
        missing,
        "Keep requiredCapabilities and requiredPermissions as two distinct readonly fields on LoopTaskRequirements.",
      );
    }

    return pass(
      AUDIT_POLICY_CAPABILITY_PERMISSION_SEPARATION_RULE,
      "Policy requirements separate capabilities from permissions.",
      expectedTokens,
    );
  },
};

export const AUDIT_POLICY_MODE_PERMISSION_CEILING_RULE: AuditRule = {
  id: "AUDIT-058",
  category: "architecture",
  severity: "warning",
  title: "Permission ceilings are enforced per mode",
  description:
    "The policy engine should expose a per-mode permission ceiling where plan/execute/commit/publish each include exactly the previous mode's permissions plus one new one, and git_tag is never implicit.",
  check: () => {
    const defaultsPath = "src/policy/defaults.ts";

    if (!existsSync(defaultsPath)) {
      return fail(
        AUDIT_POLICY_MODE_PERMISSION_CEILING_RULE,
        "Policy defaults file is missing.",
        [defaultsPath],
        "Restore src/policy/defaults.ts so per-mode permission ceilings can be verified.",
      );
    }

    const content = readFileSync(defaultsPath, "utf8");
    const expectedTokens = [
      'plan: ["read_only"]',
      'execute: ["read_only", "write_worktree", "shell_exec"]',
      'commit: ["read_only", "write_worktree", "shell_exec", "git_commit"]',
      'publish: ["read_only", "write_worktree", "shell_exec", "git_commit", "git_push"]',
      "export function getAllowedPermissionsForMode",
    ];

    const missing = expectedTokens.filter(
      (token) => !sourceIncludesToken(content, token),
    );

    const ceilingsStart = content.indexOf("const MODE_PERMISSION_CEILINGS");
    const ceilingsEnd = content.indexOf("};", ceilingsStart);
    const ceilingsBlock =
      ceilingsStart >= 0 && ceilingsEnd >= 0
        ? content.slice(ceilingsStart, ceilingsEnd)
        : "";
    const grantsGitTag = ceilingsBlock.includes("git_tag");

    if (missing.length > 0 || grantsGitTag || !ceilingsBlock) {
      return fail(
        AUDIT_POLICY_MODE_PERMISSION_CEILING_RULE,
        "Per-mode permission ceilings are incomplete or grant git_tag implicitly.",
        [
          ...missing,
          ...(grantsGitTag
            ? ["git_tag must never be part of a mode ceiling"]
            : []),
          ...(ceilingsBlock
            ? []
            : ["MODE_PERMISSION_CEILINGS block not found"]),
        ],
        "Keep getAllowedPermissionsForMode returning exactly plan/execute/commit/publish's cumulative ceilings, and never include git_tag.",
      );
    }

    return pass(
      AUDIT_POLICY_MODE_PERMISSION_CEILING_RULE,
      "Permission ceilings are enforced per mode and git_tag is never implicit.",
      expectedTokens,
    );
  },
};

export const AUDIT_POLICY_RESTRICTIVE_MERGE_RULE: AuditRule = {
  id: "AUDIT-059",
  category: "architecture",
  severity: "warning",
  title: "Budgets, providers, and runtimes are merged restrictively",
  description:
    "The policy engine should expose restrictive-merge helpers for budgets, providers, runtimes, and maximum effort so a caller (e.g. n8n) can only narrow a policy, never widen it.",
  check: () => {
    const defaultsPath = "src/policy/defaults.ts";

    if (!existsSync(defaultsPath)) {
      return fail(
        AUDIT_POLICY_RESTRICTIVE_MERGE_RULE,
        "Policy defaults file is missing.",
        [defaultsPath],
        "Restore src/policy/defaults.ts so restrictive-merge helpers can be verified.",
      );
    }

    const content = readFileSync(defaultsPath, "utf8");
    const expectedTokens = [
      "export function mergeBudgetsRestrictively",
      "export function mergeAllowedProviders",
      "export function mergeAllowedRuntimes",
      "export function restrictMaximumEffort",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        AUDIT_POLICY_RESTRICTIVE_MERGE_RULE,
        "Restrictive-merge helpers are incomplete.",
        missing,
        "Expose mergeBudgetsRestrictively, mergeAllowedProviders, mergeAllowedRuntimes, and restrictMaximumEffort from src/policy/defaults.ts.",
      );
    }

    return pass(
      AUDIT_POLICY_RESTRICTIVE_MERGE_RULE,
      "Budgets, providers, and runtimes are merged restrictively.",
      expectedTokens,
    );
  },
};

export const AUDIT_POLICY_FORECAST_INTEGRATION_RULE: AuditRule = {
  id: "AUDIT-060",
  category: "architecture",
  severity: "warning",
  title: "LoopRunner computes a forecast-only agent policy in mode plan",
  description:
    "runLoopPlan should resolve an agent policy for the selected candidate in mode plan and expose it as an additive LoopRunResult field, without ever invoking an agent.",
  check: () => {
    const expectations = [
      {
        file: "src/loop/types.ts",
        token: "agentPolicy: AgentPolicyResolution | null;",
      },
      {
        file: "src/loop/runner.ts",
        token: 'import { resolvePolicy } from "../policy/resolver.js";',
      },
      { file: "src/loop/runner.ts", token: 'mode: "plan",' },
      { file: "src/core/loop.ts", token: "agentPolicy: result.agentPolicy" },
    ];

    const missing = expectations
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        AUDIT_POLICY_FORECAST_INTEGRATION_RULE,
        "The forecast-only agent policy integration is incomplete.",
        missing,
        "Ensure LoopRunResult exposes agentPolicy, runLoopPlan resolves it in mode plan via resolvePolicy, and the Core execution report exposes it in JSON output.",
      );
    }

    return pass(
      AUDIT_POLICY_FORECAST_INTEGRATION_RULE,
      "LoopRunner computes a forecast-only agent policy in mode plan.",
      expectations.map(({ file, token }) => `${file} -> ${token}`),
    );
  },
};

export const AUDIT_POLICY_NO_REAL_EXECUTION_RULE: AuditRule = {
  id: "AUDIT-061",
  category: "architecture",
  severity: "warning",
  title: "Policy engine performs no real execution or network I/O",
  description:
    "src/policy/ should never perform network I/O, spawn a process, or introduce a real execute mode — resolvePolicy stays a pure, local, deterministic lookup.",
  check: () => {
    const policyFiles = [
      "src/policy/types.ts",
      "src/policy/defaults.ts",
      "src/policy/resolver.ts",
    ];
    const missingFiles = policyFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_POLICY_NO_REAL_EXECUTION_RULE,
        "Some policy engine files are missing.",
        missingFiles,
        "Restore the missing src/policy/ files so the no-real-execution invariant can be verified.",
      );
    }

    const forbiddenPatterns = [
      /\bfetch\(/,
      /require\(["']https?["']\)/,
      /child_process/,
      /--force\b/,
    ];

    const violations = policyFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return forbiddenPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${file}: matches ${pattern.source}`);
    });

    if (violations.length > 0) {
      return fail(
        AUDIT_POLICY_NO_REAL_EXECUTION_RULE,
        "The policy engine contains a forbidden execution or network pattern.",
        violations,
        "Keep src/policy/ free of fetch, child_process, dynamic https requires, and force-push patterns.",
      );
    }

    return pass(
      AUDIT_POLICY_NO_REAL_EXECUTION_RULE,
      "Policy engine performs no real execution or network I/O.",
      policyFiles,
    );
  },
};

export const AUDIT_POLICY_DEPENDENCY_DIRECTION_RULE: AuditRule = {
  id: "AUDIT-062",
  category: "architecture",
  severity: "warning",
  title: "Policy engine dependencies stay unidirectional",
  description:
    "src/policy/ should never depend on src/loop/, src/commands/, or src/cli.ts, and src/agents/ should never depend on src/policy/.",
  check: () => {
    const policyFiles = [
      "src/policy/types.ts",
      "src/policy/defaults.ts",
      "src/policy/resolver.ts",
    ];
    const agentFiles = [
      "src/agents/types.ts",
      "src/agents/registry.ts",
      "src/agents/selector.ts",
      "src/agents/escalation.ts",
    ];
    const allFiles = [...policyFiles, ...agentFiles];

    const missingFiles = allFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        AUDIT_POLICY_DEPENDENCY_DIRECTION_RULE,
        "Some policy or agent engine files are missing.",
        missingFiles,
        "Restore the missing src/policy/ and src/agents/ files so dependency direction can be verified.",
      );
    }

    const forbiddenInPolicy = /from\s+["'].*\/(loop|commands)\//;
    const forbiddenCliInPolicy = /from\s+["'].*cli\.js["']/;
    const forbiddenInAgents = /from\s+["'].*\/policy\//;

    const violations = [
      ...policyFiles
        .filter(
          (file) =>
            forbiddenInPolicy.test(readFileSync(file, "utf8")) ||
            forbiddenCliInPolicy.test(readFileSync(file, "utf8")),
        )
        .map((file) => `${file}: imports loop/, commands/, or cli.js`),
      ...agentFiles
        .filter((file) => forbiddenInAgents.test(readFileSync(file, "utf8")))
        .map((file) => `${file}: imports policy/`),
    ];

    if (violations.length > 0) {
      return fail(
        AUDIT_POLICY_DEPENDENCY_DIRECTION_RULE,
        "Policy engine dependency direction is violated.",
        violations,
        "Keep src/policy/ independent of src/loop/, src/commands/, and src/cli.ts, and keep src/agents/ independent of src/policy/.",
      );
    }

    return pass(
      AUDIT_POLICY_DEPENDENCY_DIRECTION_RULE,
      "Policy engine dependencies stay unidirectional.",
      allFiles,
    );
  },
};

export const CONTEXT_BUILDER_MODULE_PRESENCE_RULE: AuditRule = {
  id: "AUDIT-063",
  category: "architecture",
  severity: "warning",
  title: "Minimal Context Builder module is present",
  description:
    "The Minimal Context Builder (V7.5) should expose types, path confinement, source collection, token estimation, and a builder as a dedicated src/context/ module.",
  check: () => {
    const expectations = [
      {
        file: "src/context/types.ts",
        token: "export type MinimalContextPackage",
      },
      {
        file: "src/context/types.ts",
        token: "export type ContextOmissionReason",
      },
      {
        file: "src/context/path.ts",
        token: "export function resolveContextPath",
      },
      {
        file: "src/context/sources.ts",
        token: "export function collectContextSources",
      },
      {
        file: "src/context/context-cost-estimator.ts",
        token: "export function estimateTokens",
      },
      {
        file: "src/context/builder.ts",
        token: "export function buildMinimalContext",
      },
    ];

    const missing = expectations
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        CONTEXT_BUILDER_MODULE_PRESENCE_RULE,
        "Minimal Context Builder module is missing or incomplete.",
        missing,
        "Restore src/context/types.ts, path.ts, sources.ts, context-cost-estimator.ts, and builder.ts with MinimalContextPackage, ContextOmissionReason, resolveContextPath, collectContextSources, estimateTokens, and buildMinimalContext.",
      );
    }

    return pass(
      CONTEXT_BUILDER_MODULE_PRESENCE_RULE,
      "Minimal Context Builder module is present.",
      expectations.map(({ file, token }) => `${file} -> ${token}`),
    );
  },
};

export const CONTEXT_BUILDER_BUDGET_ENFORCEMENT_RULE: AuditRule = {
  id: "AUDIT-064",
  category: "architecture",
  severity: "warning",
  title: "Context builder enforces every ContextBudget dimension",
  description:
    "buildMinimalContext should enforce maxFiles, maxCharacters, maxEstimatedTokens, and includeFullFiles — never exceeding any of them.",
  check: () => {
    const builderPath = "src/context/builder.ts";

    if (!existsSync(builderPath)) {
      return fail(
        CONTEXT_BUILDER_BUDGET_ENFORCEMENT_RULE,
        "Context builder file is missing.",
        [builderPath],
        "Restore src/context/builder.ts so budget enforcement can be verified.",
      );
    }

    const content = readFileSync(builderPath, "utf8");
    const expectedTokens = [
      "budget.maxFiles",
      "budget.maxCharacters",
      "budget.maxEstimatedTokens",
      "budget.includeFullFiles",
      '"file_limit"',
      '"character_limit"',
      '"token_limit"',
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        CONTEXT_BUILDER_BUDGET_ENFORCEMENT_RULE,
        "Context builder does not enforce every ContextBudget dimension.",
        missing,
        "Ensure buildMinimalContext checks maxFiles, maxCharacters, maxEstimatedTokens, and includeFullFiles, and reports file_limit/character_limit/token_limit omissions.",
      );
    }

    return pass(
      CONTEXT_BUILDER_BUDGET_ENFORCEMENT_RULE,
      "Context builder enforces every ContextBudget dimension.",
      expectedTokens,
    );
  },
};

export const CONTEXT_BUILDER_PATH_CONFINEMENT_RULE: AuditRule = {
  id: "AUDIT-065",
  category: "architecture",
  severity: "error",
  title: "Context builder confines every read under the project path",
  description:
    "buildMinimalContext should reject absolute external paths and ../ traversals outside snapshot.project.path, reporting them as outside_project, before ever reading a file.",
  check: () => {
    const pathFile = "src/context/path.ts";
    const builderFile = "src/context/builder.ts";

    if (!existsSync(pathFile) || !existsSync(builderFile)) {
      return fail(
        CONTEXT_BUILDER_PATH_CONFINEMENT_RULE,
        "Context builder path confinement files are missing.",
        [pathFile, builderFile],
        "Restore src/context/path.ts and src/context/builder.ts so path confinement can be verified.",
      );
    }

    const content = `${readFileSync(pathFile, "utf8")}\n${readFileSync(builderFile, "utf8")}`;
    const expectedTokens = [
      "insideProject",
      '"outside_project"',
      "resolveContextPath",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        CONTEXT_BUILDER_PATH_CONFINEMENT_RULE,
        "Context builder does not confine reads under the project path.",
        missing,
        "Ensure resolveContextPath computes insideProject and buildMinimalContext omits out-of-project sources with reason outside_project before reading them.",
      );
    }

    return pass(
      CONTEXT_BUILDER_PATH_CONFINEMENT_RULE,
      "Context builder confines every read under the project path.",
      expectedTokens,
    );
  },
};

export const CONTEXT_BUILDER_NO_NETWORK_RULE: AuditRule = {
  id: "AUDIT-066",
  category: "architecture",
  severity: "warning",
  title: "Context builder performs no network I/O or process spawn",
  description:
    "src/context/ should never perform network I/O, spawn a process, or introduce an execute mode — buildMinimalContext stays a pure, local, deterministic file read.",
  check: () => {
    const contextFiles = [
      "src/context/types.ts",
      "src/context/path.ts",
      "src/context/sources.ts",
      "src/context/context-cost-estimator.ts",
      "src/context/builder.ts",
    ];
    const missingFiles = contextFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        CONTEXT_BUILDER_NO_NETWORK_RULE,
        "Some context builder files are missing.",
        missingFiles,
        "Restore the missing src/context/ files so the no-network invariant can be verified.",
      );
    }

    const forbiddenPatterns = [
      /\bfetch\(/,
      /require\(["']https?["']\)/,
      /child_process/,
    ];

    const violations = contextFiles.flatMap((file) => {
      const content = readFileSync(file, "utf8");

      return forbiddenPatterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `${file}: matches ${pattern.source}`);
    });

    if (violations.length > 0) {
      return fail(
        CONTEXT_BUILDER_NO_NETWORK_RULE,
        "The context builder contains a forbidden network or process pattern.",
        violations,
        "Keep src/context/ free of fetch, child_process, and dynamic https requires.",
      );
    }

    return pass(
      CONTEXT_BUILDER_NO_NETWORK_RULE,
      "Context builder performs no network I/O or process spawn.",
      contextFiles,
    );
  },
};

export const CONTEXT_BUILDER_LOOP_INTEGRATION_RULE: AuditRule = {
  id: "AUDIT-067",
  category: "architecture",
  severity: "warning",
  title: "LoopRunner builds a Minimal Context Package in mode plan",
  description:
    "runLoopPlan should build a MinimalContextPackage for a completed plan cycle using agentPolicy.requirements.contextBudget, and expose it as an additive LoopRunResult field.",
  check: () => {
    const expectations = [
      {
        file: "src/loop/types.ts",
        token: "contextPackage: MinimalContextPackage | null;",
      },
      { file: "src/loop/planner.ts", token: "snapshot: ProjectSnapshot;" },
      {
        file: "src/loop/runner.ts",
        token: 'import { buildMinimalContext } from "../context/builder.js";',
      },
      {
        file: "src/loop/runner.ts",
        token: "agentPolicy.requirements.contextBudget",
      },
      {
        file: "src/core/loop.ts",
        token: "contextPackage: result.contextPackage",
      },
    ];

    const missing = expectations
      .filter(
        ({ file, token }) =>
          !existsSync(file) || !readFileSync(file, "utf8").includes(token),
      )
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        CONTEXT_BUILDER_LOOP_INTEGRATION_RULE,
        "The Minimal Context Package integration is incomplete.",
        missing,
        "Ensure LoopRunResult exposes contextPackage, LoopPlan's ready outcome carries a snapshot, runLoopPlan builds the package via buildMinimalContext(snapshot, agentPolicy.requirements.contextBudget), and the Core execution report exposes it in JSON output.",
      );
    }

    return pass(
      CONTEXT_BUILDER_LOOP_INTEGRATION_RULE,
      "LoopRunner builds a Minimal Context Package in mode plan.",
      expectations.map(({ file, token }) => `${file} -> ${token}`),
    );
  },
};

export const EXECUTION_REPORTING_ARCHITECTURE_DOCUMENTATION_RULE: AuditRule = {
  id: "AUDIT-069",
  category: "architecture",
  severity: "warning",
  title: "Execution reporting architecture contract is documented",
  description:
    "The repository should document the JSON and Markdown execution report contracts, schema evolution, compatibility, and golden fixtures.",
  check: () => {
    const documentationPath = "docs/architecture/execution-reporting.md";

    if (!existsSync(documentationPath)) {
      return fail(
        EXECUTION_REPORTING_ARCHITECTURE_DOCUMENTATION_RULE,
        "Execution reporting architecture documentation is missing.",
        [documentationPath],
        "Create docs/architecture/execution-reporting.md and document the execution report contract.",
      );
    }

    const content = readFileSync(documentationPath, "utf8");
    const expectedTerms = [
      "report.json",
      "report.md",
      "schemaVersion",
      "Golden fixtures",
      "breaking change",
      "extensions additives",
    ];

    const missing = expectedTerms
      .filter((term) => !content.includes(term))
      .map((term) => `${documentationPath}: missing "${term}"`);

    if (missing.length > 0) {
      return fail(
        EXECUTION_REPORTING_ARCHITECTURE_DOCUMENTATION_RULE,
        "Execution reporting architecture documentation is incomplete.",
        missing,
        "Document report.json, report.md, schemaVersion, golden fixtures, additive extensions, and breaking changes.",
      );
    }

    return pass(
      EXECUTION_REPORTING_ARCHITECTURE_DOCUMENTATION_RULE,
      "Execution reporting architecture contract is documented.",
      [documentationPath, ...expectedTerms],
    );
  },
};

export const README_EXECUTION_REPORTING_DOCUMENTATION_RULE: AuditRule = {
  id: "AUDIT-070",
  category: "architecture",
  severity: "warning",
  title: "README documents execution reporting",
  description:
    "README.md should expose the JSON and Markdown execution reports, their golden fixtures, the regeneration command, and the architecture documentation.",
  check: () => {
    const readmePath = "README.md";

    if (!existsSync(readmePath)) {
      return fail(
        README_EXECUTION_REPORTING_DOCUMENTATION_RULE,
        "README.md is missing.",
        [readmePath],
        "Restore README.md and document execution reporting.",
      );
    }

    const content = readFileSync(readmePath, "utf8");
    const expectedTerms = [
      "Rapports d’exécution",
      "report.json",
      "report.md",
      "tests/fixtures/reports/report.json",
      "tests/fixtures/reports/report.md",
      "pnpm run reports:fixtures",
      "docs/architecture/execution-reporting.md",
    ];

    const missing = expectedTerms
      .filter((term) => !content.includes(term))
      .map((term) => `${readmePath}: missing "${term}"`);

    if (missing.length > 0) {
      return fail(
        README_EXECUTION_REPORTING_DOCUMENTATION_RULE,
        "README execution reporting documentation is incomplete.",
        missing,
        "Document the execution report formats, fixtures, regeneration command, and architecture contract in README.md.",
      );
    }

    return pass(
      README_EXECUTION_REPORTING_DOCUMENTATION_RULE,
      "README documents execution reporting.",
      [readmePath, ...expectedTerms],
    );
  },
};

export const EXECUTION_REPORT_GOLDEN_FIXTURES_RULE: AuditRule = {
  id: "AUDIT-071",
  category: "architecture",
  severity: "warning",
  title: "Execution report golden fixtures are present and structured",
  description:
    "The repository should retain valid JSON and Markdown golden fixtures for deterministic execution report regression checks.",
  check: () => {
    const jsonFixturePath = "tests/fixtures/reports/report.json";
    const markdownFixturePath = "tests/fixtures/reports/report.md";
    const fixturePaths = [jsonFixturePath, markdownFixturePath];

    const missingFiles = fixturePaths.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        EXECUTION_REPORT_GOLDEN_FIXTURES_RULE,
        "Execution report golden fixtures are missing.",
        missingFiles,
        "Create the JSON and Markdown golden fixtures under tests/fixtures/reports/.",
      );
    }

    const violations: string[] = [];

    try {
      const report = JSON.parse(readFileSync(jsonFixturePath, "utf8")) as {
        schemaVersion?: unknown;
        summary?: unknown;
        steps?: unknown;
      };

      if (report.schemaVersion !== 1) {
        violations.push(`${jsonFixturePath}: schemaVersion must equal 1`);
      }

      if (typeof report.summary !== "object" || report.summary === null) {
        violations.push(`${jsonFixturePath}: summary must be an object`);
      }

      if (!Array.isArray(report.steps)) {
        violations.push(`${jsonFixturePath}: steps must be an array`);
      }
    } catch {
      violations.push(`${jsonFixturePath}: invalid JSON`);
    }

    const markdown = readFileSync(markdownFixturePath, "utf8").trim();

    if (markdown.length === 0) {
      violations.push(`${markdownFixturePath}: fixture must not be empty`);
    }

    if (violations.length > 0) {
      return fail(
        EXECUTION_REPORT_GOLDEN_FIXTURES_RULE,
        "Execution report golden fixtures are invalid.",
        violations,
        "Regenerate valid report.json and report.md fixtures with pnpm run reports:fixtures.",
      );
    }

    return pass(
      EXECUTION_REPORT_GOLDEN_FIXTURES_RULE,
      "Execution report golden fixtures are present and structured.",
      fixturePaths,
    );
  },
};

export const EXECUTION_REPORT_DETERMINISM_DOCUMENTATION_RULE: AuditRule = {
  id: "AUDIT-072",
  category: "architecture",
  severity: "warning",
  title: "Execution report determinism is documented",
  description:
    "The execution reporting contract should state that both formats derive from one model with stable step and detail ordering and controlled volatile data.",
  check: () => {
    const documentationPath = "docs/architecture/execution-reporting.md";

    if (!existsSync(documentationPath)) {
      return fail(
        EXECUTION_REPORT_DETERMINISM_DOCUMENTATION_RULE,
        "Execution reporting architecture documentation is missing.",
        [documentationPath],
        "Create the execution reporting architecture documentation and define deterministic output guarantees.",
      );
    }

    const content = readFileSync(documentationPath, "utf8");
    const expectedTerms = [
      "même modèle de rapport",
      "l’ordre des étapes doit être stable",
      "l’ordre des détails doit être stable",
      "donnée volatile",
      "entrée déterministe",
    ];

    const missing = expectedTerms
      .filter((term) => !content.includes(term))
      .map((term) => `${documentationPath}: missing "${term}"`);

    if (missing.length > 0) {
      return fail(
        EXECUTION_REPORT_DETERMINISM_DOCUMENTATION_RULE,
        "Execution report determinism documentation is incomplete.",
        missing,
        "Document the shared report model, deterministic inputs, stable ordering, and control of volatile data.",
      );
    }

    return pass(
      EXECUTION_REPORT_DETERMINISM_DOCUMENTATION_RULE,
      "Execution report determinism is documented.",
      [documentationPath, ...expectedTerms],
    );
  },
};

export const CONTEXT_BUILDER_DEPENDENCY_DIRECTION_RULE: AuditRule = {
  id: "AUDIT-068",
  category: "architecture",
  severity: "warning",
  title: "Context builder dependencies stay unidirectional",
  description:
    "src/context/ should never depend on src/commands/, src/loop/, or src/cli.ts, and src/policy/ and src/agents/ should never depend on src/context/.",
  check: () => {
    const contextFiles = [
      "src/context/types.ts",
      "src/context/path.ts",
      "src/context/sources.ts",
      "src/context/context-cost-estimator.ts",
      "src/context/builder.ts",
    ];
    const policyFiles = [
      "src/policy/types.ts",
      "src/policy/defaults.ts",
      "src/policy/resolver.ts",
    ];
    const agentFiles = [
      "src/agents/types.ts",
      "src/agents/registry.ts",
      "src/agents/selector.ts",
      "src/agents/escalation.ts",
    ];
    const allFiles = [...contextFiles, ...policyFiles, ...agentFiles];

    const missingFiles = allFiles.filter((file) => !existsSync(file));

    if (missingFiles.length > 0) {
      return fail(
        CONTEXT_BUILDER_DEPENDENCY_DIRECTION_RULE,
        "Some context, policy, or agent engine files are missing.",
        missingFiles,
        "Restore the missing src/context/, src/policy/, and src/agents/ files so dependency direction can be verified.",
      );
    }

    const forbiddenInContext = /from\s+["'].*\/(commands|loop)\//;
    const forbiddenCliInContext = /from\s+["'].*cli\.js["']/;
    const forbiddenContextInOthers = /from\s+["'].*\/context\//;

    const violations = [
      ...contextFiles
        .filter(
          (file) =>
            forbiddenInContext.test(readFileSync(file, "utf8")) ||
            forbiddenCliInContext.test(readFileSync(file, "utf8")),
        )
        .map((file) => `${file}: imports commands/, loop/, or cli.js`),
      ...[...policyFiles, ...agentFiles]
        .filter((file) =>
          forbiddenContextInOthers.test(readFileSync(file, "utf8")),
        )
        .map((file) => `${file}: imports context/`),
    ];

    if (violations.length > 0) {
      return fail(
        CONTEXT_BUILDER_DEPENDENCY_DIRECTION_RULE,
        "Context builder dependency direction is violated.",
        violations,
        "Keep src/context/ independent of src/commands/, src/loop/, and src/cli.ts, and keep src/policy/ and src/agents/ independent of src/context/.",
      );
    }

    return pass(
      CONTEXT_BUILDER_DEPENDENCY_DIRECTION_RULE,
      "Context builder dependencies stay unidirectional.",
      allFiles,
    );
  },
};

export const AUDIT_RULE_METADATA_COMPLETENESS_V8_RULE: AuditRule = {
  id: "AUDIT-073",
  category: "architecture",
  severity: "warning",
  title: "Audit rule metadata is normalized completely",
  description:
    "The registry should supply introducedIn, tags, stability, and dependsOn metadata for every rule.",
  metadata: {
    introducedIn: "V8.0",
    tags: ["self-audit", "architecture"],
    stability: "stable",
    dependsOn: [],
  },
  check: () =>
    verifyRegistryContract(
      AUDIT_RULE_METADATA_COMPLETENESS_V8_RULE,
      [
        "function normalizeMetadata",
        "introducedIn:",
        "tags:",
        "stability:",
        "dependsOn:",
      ],
      {
        pass: "Audit rule metadata is complete and normalized.",
        fail: "Audit rule metadata normalization is incomplete.",
        recommendation:
          "Restore normalization for introducedIn, tags, stability, and dependsOn metadata.",
      },
    ),
};

export const AUDIT_RULE_TAG_VALIDITY_V8_RULE: AuditRule = {
  id: "AUDIT-074",
  category: "architecture",
  severity: "warning",
  title: "Audit rule tags are validated against the typed registry",
  description:
    "The registry should reject tags that are outside AUDIT_RULE_TAGS.",
  metadata: {
    introducedIn: "V8.0",
    tags: ["self-audit", "architecture"],
    stability: "stable",
    dependsOn: ["AUDIT-073"],
  },
  check: () =>
    verifyRegistryContract(
      AUDIT_RULE_TAG_VALIDITY_V8_RULE,
      ["AUDIT_RULE_TAGS", "isAuditRuleTag", "Invalid tags metadata"],
      {
        pass: "Audit rule tags are validated against the typed tag registry.",
        fail: "Audit rule tag validation is incomplete.",
        recommendation:
          "Restore validation that rejects tags outside AUDIT_RULE_TAGS.",
      },
    ),
};

export const AUDIT_RULE_STABILITY_VALIDITY_V8_RULE: AuditRule = {
  id: "AUDIT-075",
  category: "architecture",
  severity: "warning",
  title: "Audit rule stability is validated against the typed registry",
  description:
    "The registry should reject stability values outside AUDIT_RULE_STABILITIES.",
  metadata: {
    introducedIn: "V8.0",
    tags: ["self-audit", "architecture"],
    stability: "stable",
    dependsOn: ["AUDIT-073"],
  },
  check: () =>
    verifyRegistryContract(
      AUDIT_RULE_STABILITY_VALIDITY_V8_RULE,
      [
        "AUDIT_RULE_STABILITIES",
        "isAuditRuleStability",
        "Invalid stability metadata",
      ],
      {
        pass: "Audit rule stability is validated against the typed stability registry.",
        fail: "Audit rule stability validation is incomplete.",
        recommendation:
          "Restore validation that rejects stability values outside AUDIT_RULE_STABILITIES.",
      },
    ),
};

export const AUDIT_RULE_DEPENDENCY_VALIDITY_V8_RULE: AuditRule = {
  id: "AUDIT-076",
  category: "architecture",
  severity: "warning",
  title: "Audit rule dependencies reference registered rules",
  description:
    "The registry should reject declared dependencies that do not exist in AUDIT_RULES.",
  metadata: {
    introducedIn: "V8.0",
    tags: ["self-audit", "architecture"],
    stability: "stable",
    dependsOn: ["AUDIT-073"],
  },
  check: () =>
    verifyRegistryContract(
      AUDIT_RULE_DEPENDENCY_VALIDITY_V8_RULE,
      ["Audit rule dependency does not exist", "ids.has(dependency)"],
      {
        pass: "Audit rule dependencies reference registered rules.",
        fail: "Audit rule dependency validation is incomplete.",
        recommendation:
          "Restore validation that rejects dependencies absent from AUDIT_RULES.",
      },
    ),
};

export const AUDIT_RULE_NO_SELF_DEPENDENCY_V8_RULE: AuditRule = {
  id: "AUDIT-077",
  category: "architecture",
  severity: "warning",
  title: "Audit rules cannot depend on themselves",
  description:
    "The registry should reject a metadata dependency equal to the rule id.",
  metadata: {
    introducedIn: "V8.0",
    tags: ["self-audit", "architecture"],
    stability: "stable",
    dependsOn: ["AUDIT-073"],
  },
  check: () =>
    verifyRegistryContract(
      AUDIT_RULE_NO_SELF_DEPENDENCY_V8_RULE,
      ["dependency === rule.id", "Audit rule must not depend on itself"],
      {
        pass: "Audit rules cannot declare self-dependencies.",
        fail: "Audit rule self-dependency validation is incomplete.",
        recommendation:
          "Restore validation that rejects a dependency matching its own rule id.",
      },
    ),
};

export const AUDIT_RULE_MANIFEST_CONSISTENCY_V8_RULE: AuditRule = {
  id: "AUDIT-078",
  category: "architecture",
  severity: "warning",
  title: "Audit rule manifest is derived from registry order",
  description:
    "The manifest should be generated directly from the selected AUDIT_RULES entries without volatile fields.",
  metadata: {
    introducedIn: "V8.0",
    tags: ["self-audit", "contract", "architecture"],
    stability: "stable",
    dependsOn: ["AUDIT-073"],
  },
  check: () =>
    verifyRegistryContract(
      AUDIT_RULE_MANIFEST_CONSISTENCY_V8_RULE,
      [
        "export function createAuditRuleManifest",
        "rules.map((rule)",
        "schemaVersion: 1",
        "introducedIn: rule.metadata.introducedIn",
      ],
      {
        pass: "Audit rule manifest follows registry order and metadata.",
        fail: "Audit rule manifest consistency validation is incomplete.",
        recommendation:
          "Restore manifest generation from registry order with normalized rule metadata.",
      },
    ),
};

function localProcessRuntimeSource(): string | null {
  const path = "src/runtime/local-process.ts";
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function verifyLocalProcessRuntime(
  rule: AuditRule,
  expectedTokens: readonly string[],
  message: string,
  recommendation: string,
): ReturnType<typeof pass> {
  const source = localProcessRuntimeSource();
  const missing = source
    ? expectedTokens.filter((token) => !source.includes(token))
    : ["src/runtime/local-process.ts"];

  return missing.length === 0
    ? pass(rule, message, expectedTokens)
    : fail(rule, message, missing, recommendation);
}

export const RUNTIME_LOCAL_PROCESS_MODULE_RULE: AuditRule = {
  id: "AUDIT-079",
  category: "architecture",
  severity: "error",
  title: "Guarded local-process runtime is registered",
  description:
    "The V10.1 local-process adapter must exist and be reachable through the static runtime registry.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-078"],
  },
  check: () => {
    const registry = existsSync("src/runtime/registry.ts")
      ? readFileSync("src/runtime/registry.ts", "utf8")
      : "";
    return verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_MODULE_RULE,
      ["LOCAL_PROCESS_RUNTIME_ID", "export const LocalProcessRuntime"],
      "Guarded local-process runtime is present.",
      "Restore src/runtime/local-process.ts and register LocalProcessRuntime statically.",
    ).status === "pass" && registry.includes("LocalProcessRuntime")
      ? pass(
          RUNTIME_LOCAL_PROCESS_MODULE_RULE,
          "Guarded local-process runtime is present and registered.",
          ["src/runtime/local-process.ts", "src/runtime/registry.ts"],
        )
      : fail(
          RUNTIME_LOCAL_PROCESS_MODULE_RULE,
          "Guarded local-process runtime is missing or not registered.",
          ["src/runtime/local-process.ts", "src/runtime/registry.ts"],
          "Restore the local-process module and its static registry entry.",
        );
  },
};

export const RUNTIME_LOCAL_PROCESS_NO_SHELL_RULE: AuditRule = {
  id: "AUDIT-080",
  category: "architecture",
  severity: "error",
  title: "local-process never enables a shell",
  description:
    "The local process adapter must invoke spawn with shell: false and never enable shell interpretation.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () => {
    const source = localProcessRuntimeSource();
    return source?.includes("shell: false") && !source.includes("shell: true")
      ? pass(
          RUNTIME_LOCAL_PROCESS_NO_SHELL_RULE,
          "local-process disables shell interpretation.",
          ["shell: false"],
        )
      : fail(
          RUNTIME_LOCAL_PROCESS_NO_SHELL_RULE,
          "local-process shell safety cannot be verified.",
          ["src/runtime/local-process.ts"],
          "Use spawn with shell: false and never enable shell execution.",
        );
  },
};

export const RUNTIME_LOCAL_PROCESS_NO_TEXT_EXEC_RULE: AuditRule = {
  id: "AUDIT-081",
  category: "architecture",
  severity: "error",
  title: "local-process does not use textual exec APIs",
  description:
    "The adapter must use spawn with structured arguments rather than exec-style command strings.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-080"],
  },
  check: () => {
    const source = localProcessRuntimeSource();
    const unsafe = source ? /\bexec(?:File|Sync)?\s*\(/.test(source) : true;
    return source !== null && /spawn\s*\(\s*executable/.test(source) && !unsafe
      ? pass(
          RUNTIME_LOCAL_PROCESS_NO_TEXT_EXEC_RULE,
          "local-process uses structured spawn arguments only.",
          ["spawn(executable, args, options)"],
        )
      : fail(
          RUNTIME_LOCAL_PROCESS_NO_TEXT_EXEC_RULE,
          "local-process may use a textual execution API.",
          ["src/runtime/local-process.ts"],
          "Keep command arguments structured and invoke only spawn without a shell.",
        );
  },
};

export const RUNTIME_LOCAL_PROCESS_PERMISSION_RULE: AuditRule = {
  id: "AUDIT-082",
  category: "architecture",
  severity: "error",
  title: "local-process requires explicit shell_exec authorization",
  description:
    "A resolved policy and selected profile must both authorize shell_exec before a process can start.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution", "policy"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () =>
    verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_PERMISSION_RULE,
      [
        "policyAllowsShellExecution",
        'includes("shell_exec")',
        '"permission_denied"',
      ],
      "local-process checks explicit shell_exec authorization.",
      "Validate shell_exec from the resolved policy before spawn.",
    ),
};

export const RUNTIME_LOCAL_PROCESS_DISABLED_BY_DEFAULT_RULE: AuditRule = {
  id: "AUDIT-083",
  category: "architecture",
  severity: "error",
  title: "local-process rejects disabled execution",
  description:
    "The local process policy must contain an enabled flag and reject false before process creation.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-082"],
  },
  check: () =>
    verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_DISABLED_BY_DEFAULT_RULE,
      ["!policy.enabled", '"runtime_disabled"'],
      "local-process rejects disabled execution.",
      "Require an explicit enabled policy flag before spawn.",
    ),
};

export const RUNTIME_LOCAL_PROCESS_ALLOWLIST_RULE: AuditRule = {
  id: "AUDIT-084",
  category: "architecture",
  severity: "error",
  title: "local-process uses a closed executable allow-list",
  description:
    "Only canonical executable paths declared by policy may be spawned.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () =>
    verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_ALLOWLIST_RULE,
      ["allowedExecutables", "canonicalPath", '"executable_not_allowed"'],
      "local-process checks its executable allow-list.",
      "Canonicalize and compare executables against the explicit policy allow-list.",
    ),
};

export const RUNTIME_LOCAL_PROCESS_CWD_CONFINEMENT_RULE: AuditRule = {
  id: "AUDIT-085",
  category: "architecture",
  severity: "error",
  title: "local-process canonically confines working directories",
  description:
    "Canonical project and cwd paths must be compared so traversal and symlink escapes are refused.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-084"],
  },
  check: () =>
    verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_CWD_CONFINEMENT_RULE,
      [
        "realpathSync",
        "isWithinProject",
        '"working_directory_outside_project"',
      ],
      "local-process confines canonical working directories.",
      "Resolve projectRoot and cwd canonically before testing containment.",
    ),
};

export const RUNTIME_LOCAL_PROCESS_LIMITS_RULE: AuditRule = {
  id: "AUDIT-086",
  category: "architecture",
  severity: "error",
  title: "local-process enforces duration and separate output limits",
  description:
    "Execution requires positive timeout, stdout, and stderr limits and terminates a process when a limit is exceeded.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () =>
    verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_LIMITS_RULE,
      [
        "timeoutMs",
        "maxStdoutBytes",
        "maxStderrBytes",
        "setTimeout",
        '"stdout_limit_exceeded"',
        '"stderr_limit_exceeded"',
      ],
      "local-process enforces independent resource limits.",
      "Require valid limits and terminate the child process when any limit is exceeded.",
    ),
};

export const RUNTIME_LOCAL_PROCESS_ERROR_CONTRACT_RULE: AuditRule = {
  id: "AUDIT-087",
  category: "architecture",
  severity: "error",
  title: "local-process exposes structured stable errors",
  description:
    "Runtime errors must carry a stable code, non-sensitive details, and whether a process started.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution", "contract"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () => {
    const types = existsSync("src/runtime/types.ts")
      ? readFileSync("src/runtime/types.ts", "utf8")
      : "";
    return types.includes("RUNTIME_ERROR_CODES") &&
      types.includes("processStarted: boolean")
      ? pass(
          RUNTIME_LOCAL_PROCESS_ERROR_CONTRACT_RULE,
          "local-process error contract is structured and stable.",
          ["src/runtime/types.ts"],
        )
      : fail(
          RUNTIME_LOCAL_PROCESS_ERROR_CONTRACT_RULE,
          "local-process error contract is incomplete.",
          ["src/runtime/types.ts"],
          "Define stable RuntimeExecutionError codes with processStarted metadata.",
        );
  },
};

export const RUNTIME_LOCAL_PROCESS_EVENTS_RULE: AuditRule = {
  id: "AUDIT-088",
  category: "architecture",
  severity: "warning",
  title: "local-process emits ordered structured events",
  description:
    "Runtime observations must have stable types and monotonically increasing sequence numbers without secret payloads.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution", "contract"],
    stability: "stable",
    dependsOn: ["AUDIT-087"],
  },
  check: () =>
    verifyLocalProcessRuntime(
      RUNTIME_LOCAL_PROCESS_EVENTS_RULE,
      [
        "sequence += 1",
        'event("request_validated")',
        'event("process_started"',
        'event("process_completed"',
      ],
      "local-process emits ordered structured events.",
      "Record each observation with a monotonic sequence and minimal non-sensitive data.",
    ),
};

export const RUNTIME_LOCAL_PROCESS_NO_PUBLIC_INTEGRATION_RULE: AuditRule = {
  id: "AUDIT-089",
  category: "architecture",
  severity: "error",
  title: "local-process remains absent from CLI and LoopRunner",
  description:
    "The guarded backend is Core-only and must not be wired into public CLI routing or runLoopPlan.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "cli", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () => {
    const publicFiles = ["src/cli.ts", "src/loop/runner.ts"];
    const violations = publicFiles.filter(
      (path) =>
        existsSync(path) &&
        readFileSync(path, "utf8").includes("local-process"),
    );
    return violations.length === 0
      ? pass(
          RUNTIME_LOCAL_PROCESS_NO_PUBLIC_INTEGRATION_RULE,
          "local-process is not exposed by CLI or LoopRunner.",
          publicFiles,
        )
      : fail(
          RUNTIME_LOCAL_PROCESS_NO_PUBLIC_INTEGRATION_RULE,
          "local-process leaked into a public execution path.",
          violations,
          "Keep local-process reachable only through the explicit Core runtime API.",
        );
  },
};

export const RUNTIME_LOCAL_PROCESS_NO_NETWORK_RULE: AuditRule = {
  id: "AUDIT-090",
  category: "architecture",
  severity: "error",
  title: "local-process contains no network integration",
  description:
    "The local backend must remain free of network modules and fetch calls.",
  metadata: {
    introducedIn: "V10.1",
    tags: ["architecture", "execution"],
    stability: "stable",
    dependsOn: ["AUDIT-079"],
  },
  check: () => {
    const source = localProcessRuntimeSource();
    const violations = source
      ? [/\bfetch\(/, /node:(http|https|net|tls)/, /\bWebSocket\b/]
          .filter((pattern) => pattern.test(source))
          .map((pattern) => pattern.source)
      : ["src/runtime/local-process.ts"];
    return violations.length === 0
      ? pass(
          RUNTIME_LOCAL_PROCESS_NO_NETWORK_RULE,
          "local-process has no network integration.",
          ["src/runtime/local-process.ts"],
        )
      : fail(
          RUNTIME_LOCAL_PROCESS_NO_NETWORK_RULE,
          "local-process contains a network integration pattern.",
          violations,
          "Keep the local process backend free of network calls and network modules.",
        );
  },
};

function providerSource(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function verifyProviderSource(
  rule: AuditRule,
  path: string,
  expectedTokens: readonly string[],
  message: string,
  recommendation: string,
): ReturnType<typeof pass> {
  const source = providerSource(path);
  const missing = source
    ? expectedTokens.filter((token) => !source.includes(token))
    : [path];

  return missing.length === 0
    ? pass(rule, message, [path, ...expectedTokens])
    : fail(rule, message, missing, recommendation);
}

const PROVIDER_AUDIT_METADATA = {
  introducedIn: "V10.2",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

export const PROVIDER_MODULE_PRESENCE_RULE: AuditRule = {
  id: "AUDIT-091",
  category: "architecture",
  severity: "error",
  title: "Provider adapter module is present",
  description:
    "The V10.2 provider contracts, static registry, selector, errors, and three stubs must be present.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-090"] },
  check: () => {
    const files = [
      "src/providers/types.ts",
      "src/providers/errors.ts",
      "src/providers/registry.ts",
      "src/providers/selector.ts",
      "src/providers/openclaw.ts",
      "src/providers/claude-code.ts",
      "src/providers/codex.ts",
    ];
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(
          PROVIDER_MODULE_PRESENCE_RULE,
          "Provider adapter module is present.",
          files,
        )
      : fail(
          PROVIDER_MODULE_PRESENCE_RULE,
          "Provider adapter module is incomplete.",
          missing,
          "Restore the V10.2 provider contract, registry, selector, errors, and stub files.",
        );
  },
};

export const PROVIDER_STATIC_REGISTRY_RULE: AuditRule = {
  id: "AUDIT-092",
  category: "architecture",
  severity: "error",
  title: "Provider registry is static and deterministic",
  description:
    "Provider registration must retain a fixed declaration order and reject duplicate ids without discovery or dynamic loading.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-091"] },
  check: () =>
    verifyProviderSource(
      PROVIDER_STATIC_REGISTRY_RULE,
      "src/providers/registry.ts",
      [
        "createProviderRegistry",
        "Duplicate provider adapter id",
        "OpenClawProviderAdapter",
        "ClaudeCodeProviderAdapter",
        "CodexProviderAdapter",
      ],
      "Provider registry is static and deterministic.",
      "Keep provider registration static, ordered, and duplicate-safe.",
    ),
};

export const PROVIDER_DETERMINISTIC_SELECTION_RULE: AuditRule = {
  id: "AUDIT-093",
  category: "architecture",
  severity: "error",
  title: "Provider selection is pure and deterministic",
  description:
    "Provider resolution must use explicit selection before fixed registry order without scoring, pricing, or randomness.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-092"] },
  check: () =>
    verifyProviderSource(
      PROVIDER_DETERMINISTIC_SELECTION_RULE,
      "src/providers/selector.ts",
      [
        "export function selectProvider",
        "request.requestedProvider",
        "PROVIDER_REGISTRY.adapters.find",
      ],
      "Provider selection is pure and deterministic.",
      "Resolve explicit providers first and otherwise use the static registry order only.",
    ),
};

export const PROVIDER_POLICY_RESTRICTION_RULE: AuditRule = {
  id: "AUDIT-094",
  category: "architecture",
  severity: "error",
  title: "Provider adapters enforce restrictive policy boundaries",
  description:
    "Provider selection must reject adapters outside existing provider/runtime policy restrictions and preserve resolved policy status.",
  metadata: {
    ...PROVIDER_AUDIT_METADATA,
    tags: ["architecture", "execution", "policy"],
    dependsOn: ["AUDIT-093"],
  },
  check: () =>
    verifyProviderSource(
      PROVIDER_POLICY_RESTRICTION_RULE,
      "src/providers/support.ts",
      [
        "isProviderAllowed",
        "allowedProviders",
        "allowedRuntimes",
        'status === "resolved"',
      ],
      "Provider adapters enforce restrictive policy boundaries.",
      "Require the resolved policy plus all provider/runtime allow-lists before a provider is selected.",
    ),
};

export const PROVIDER_STUBS_INERT_RULE: AuditRule = {
  id: "AUDIT-095",
  category: "architecture",
  severity: "error",
  title: "Provider adapters remain inert stubs",
  description:
    "OpenClaw, Claude Code, and Codex adapters must only construct not-implemented plans in V10.2.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-091"] },
  check: () => {
    const files = [
      "src/providers/openclaw.ts",
      "src/providers/claude-code.ts",
      "src/providers/codex.ts",
    ];
    const missing = files.filter(
      (path) =>
        !providerSource(path)?.includes("createNotImplementedProviderPlan"),
    );
    return missing.length === 0
      ? pass(
          PROVIDER_STUBS_INERT_RULE,
          "Provider adapters remain inert stubs.",
          files,
        )
      : fail(
          PROVIDER_STUBS_INERT_RULE,
          "Some provider adapters are not inert stubs.",
          missing,
          "Keep all V10.2 provider adapters limited to not-implemented execution plans.",
        );
  },
};

export const PROVIDER_NO_PROCESS_RULE: AuditRule = {
  id: "AUDIT-096",
  category: "architecture",
  severity: "error",
  title: "Provider module cannot spawn or execute processes",
  description:
    "Only a guarded transport may eventually spawn; provider adapters must contain no child_process, spawn, or exec APIs.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-095"] },
  check: () => {
    const files = [
      "src/providers/types.ts",
      "src/providers/errors.ts",
      "src/providers/support.ts",
      "src/providers/registry.ts",
      "src/providers/selector.ts",
      "src/providers/openclaw.ts",
      "src/providers/claude-code.ts",
      "src/providers/codex.ts",
    ];
    const forbidden = [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
    ];
    const violations = files.flatMap((path) => {
      const source = providerSource(path) ?? "";
      return forbidden
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${path}: ${pattern.source}`);
    });
    return violations.length === 0
      ? pass(
          PROVIDER_NO_PROCESS_RULE,
          "Provider module contains no process execution API.",
          files,
        )
      : fail(
          PROVIDER_NO_PROCESS_RULE,
          "Provider module contains a process execution API.",
          violations,
          "Keep process management exclusively in guarded transport modules.",
        );
  },
};

export const PROVIDER_NO_NETWORK_RULE: AuditRule = {
  id: "AUDIT-097",
  category: "architecture",
  severity: "error",
  title: "Provider module has no network integration",
  description:
    "Provider adapters must not make network calls or import network transports in V10.2.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-095"] },
  check: () => {
    const files = [
      "src/providers/types.ts",
      "src/providers/errors.ts",
      "src/providers/support.ts",
      "src/providers/registry.ts",
      "src/providers/selector.ts",
      "src/providers/openclaw.ts",
      "src/providers/claude-code.ts",
      "src/providers/codex.ts",
    ];
    const violations = files.filter((path) => {
      const source = providerSource(path) ?? "";
      return (
        /\bfetch\s*\(/.test(source) || /node:(http|https|net|tls)/.test(source)
      );
    });
    return violations.length === 0
      ? pass(
          PROVIDER_NO_NETWORK_RULE,
          "Provider module has no network integration.",
          files,
        )
      : fail(
          PROVIDER_NO_NETWORK_RULE,
          "Provider module contains a network integration pattern.",
          violations,
          "Keep provider adapters free of network modules and fetch calls.",
        );
  },
};

export const PROVIDER_NO_SECRET_LOADING_RULE: AuditRule = {
  id: "AUDIT-098",
  category: "architecture",
  severity: "error",
  title: "Provider module does not load credentials or environment",
  description:
    "Provider requests and adapters must not read process.env, credentials, or raw environment variables.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-095"] },
  check: () => {
    const files = [
      "src/providers/types.ts",
      "src/providers/errors.ts",
      "src/providers/support.ts",
      "src/providers/registry.ts",
      "src/providers/selector.ts",
      "src/providers/openclaw.ts",
      "src/providers/claude-code.ts",
      "src/providers/codex.ts",
    ];
    const violations = files.filter((path) =>
      /process\.env|readFileSync\([^)]*\.env|load(?:Secret|Credential|ApiKey)/.test(
        providerSource(path) ?? "",
      ),
    );
    return violations.length === 0
      ? pass(
          PROVIDER_NO_SECRET_LOADING_RULE,
          "Provider module does not load credentials or environment.",
          files,
        )
      : fail(
          PROVIDER_NO_SECRET_LOADING_RULE,
          "Provider module may load credentials or environment.",
          violations,
          "Keep credentials and raw environment access outside V10.2 provider adapters.",
        );
  },
};

export const PROVIDER_TRANSPORT_SEPARATION_RULE: AuditRule = {
  id: "AUDIT-099",
  category: "architecture",
  severity: "error",
  title: "local-process remains provider-agnostic",
  description:
    "The guarded local-process transport must not import or reference provider-specific adapters.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-096"] },
  check: () => {
    const source = providerSource("src/runtime/local-process.ts") ?? "";
    return !/providers\/|ProviderAdapter|OpenClawProvider|ClaudeCodeProvider|CodexProvider/.test(
      source,
    )
      ? pass(
          PROVIDER_TRANSPORT_SEPARATION_RULE,
          "local-process remains provider-agnostic.",
          ["src/runtime/local-process.ts"],
        )
      : fail(
          PROVIDER_TRANSPORT_SEPARATION_RULE,
          "local-process references provider-specific code.",
          ["src/runtime/local-process.ts"],
          "Keep local-process a generic guarded transport primitive.",
        );
  },
};

export const PROVIDER_NO_PUBLIC_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-100",
  category: "architecture",
  severity: "error",
  title: "Provider adapters remain absent from CLI and LoopRunner",
  description:
    "Provider planning is Core-only and must not create a CLI execution path or LoopRunner integration.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-091"] },
  check: () => {
    const files = ["src/cli.ts", "src/loop/runner.ts"];
    const violations = files.filter((path) =>
      /providers\//.test(providerSource(path) ?? ""),
    );
    return violations.length === 0
      ? pass(
          PROVIDER_NO_PUBLIC_EXPOSURE_RULE,
          "Provider adapters are absent from CLI and LoopRunner.",
          files,
        )
      : fail(
          PROVIDER_NO_PUBLIC_EXPOSURE_RULE,
          "Provider adapters leaked into a public execution path.",
          violations,
          "Keep provider resolution available only through Core helpers.",
        );
  },
};

export const PROVIDER_STRUCTURED_ERRORS_RULE: AuditRule = {
  id: "AUDIT-101",
  category: "architecture",
  severity: "error",
  title: "Provider errors are structured and stable",
  description:
    "Provider failures must expose stable codes, non-sensitive details, and an execution-started indicator.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-091"] },
  check: () =>
    verifyProviderSource(
      PROVIDER_STRUCTURED_ERRORS_RULE,
      "src/providers/types.ts",
      [
        "PROVIDER_ERROR_CODES",
        "executionStarted: boolean",
        '"provider_not_implemented"',
      ],
      "Provider errors are structured and stable.",
      "Keep ProviderError codes typed, non-sensitive, and explicit about whether execution started.",
    ),
};

export const PROVIDER_DEPENDENCY_DIRECTION_RULE: AuditRule = {
  id: "AUDIT-102",
  category: "architecture",
  severity: "error",
  title: "Provider dependencies remain unidirectional",
  description:
    "Provider modules may consume runtime/policy/context types but must not depend on CLI, commands, LoopRunner, Core orchestration, reports, or audit runner.",
  metadata: { ...PROVIDER_AUDIT_METADATA, dependsOn: ["AUDIT-091"] },
  check: () => {
    const files = [
      "src/providers/types.ts",
      "src/providers/errors.ts",
      "src/providers/support.ts",
      "src/providers/registry.ts",
      "src/providers/selector.ts",
      "src/providers/openclaw.ts",
      "src/providers/claude-code.ts",
      "src/providers/codex.ts",
    ];
    const forbidden = /from\s+["'].*\/(commands|loop|core|audit|reports)\//;
    const violations = files.filter((path) =>
      forbidden.test(providerSource(path) ?? ""),
    );
    return violations.length === 0
      ? pass(
          PROVIDER_DEPENDENCY_DIRECTION_RULE,
          "Provider dependencies remain unidirectional.",
          files,
        )
      : fail(
          PROVIDER_DEPENDENCY_DIRECTION_RULE,
          "Provider module imports an upper orchestration layer.",
          violations,
          "Keep providers independent of CLI, commands, LoopRunner, Core orchestration, reports, and audit runner.",
        );
  },
};

function transportSource(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function verifyTransportSource(
  rule: AuditRule,
  path: string,
  expectedTokens: readonly string[],
  message: string,
  recommendation: string,
): ReturnType<typeof pass> {
  const source = transportSource(path);
  const missing = source
    ? expectedTokens.filter((token) => !source.includes(token))
    : [path];

  return missing.length === 0
    ? pass(rule, message, [path, ...expectedTokens])
    : fail(rule, message, missing, recommendation);
}

const TRANSPORT_AUDIT_METADATA = {
  introducedIn: "V10.3",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

export const TRANSPORT_MODULE_PRESENCE_RULE: AuditRule = {
  id: "AUDIT-103",
  category: "architecture",
  severity: "error",
  title: "Transport adapter module is present",
  description:
    "The V10.3 transport contracts, static registry, selector, support, errors, and local-process adapter must be present.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-102"] },
  check: () => {
    const files = [
      "src/transports/types.ts",
      "src/transports/errors.ts",
      "src/transports/registry.ts",
      "src/transports/selector.ts",
      "src/transports/support.ts",
      "src/transports/local-process.ts",
      "src/core/transports.ts",
    ];
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(
          TRANSPORT_MODULE_PRESENCE_RULE,
          "Transport adapter module is present.",
          files,
        )
      : fail(
          TRANSPORT_MODULE_PRESENCE_RULE,
          "Transport adapter module is incomplete.",
          missing,
          "Restore the V10.3 transport contracts, Core boundary, and local-process adapter.",
        );
  },
};

export const TRANSPORT_STATIC_REGISTRY_RULE: AuditRule = {
  id: "AUDIT-104",
  category: "architecture",
  severity: "error",
  title: "Transport registry is static and deterministic",
  description:
    "Transport registration must keep a fixed declaration order and reject duplicate ids without dynamic discovery.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-103"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_STATIC_REGISTRY_RULE,
      "src/transports/registry.ts",
      [
        "createTransportRegistry",
        "Duplicate transport adapter id",
        "LocalProcessTransport",
      ],
      "Transport registry is static and deterministic.",
      "Keep transport registration fixed, ordered, and duplicate-safe.",
    ),
};

export const TRANSPORT_ID_UNIQUENESS_RULE: AuditRule = {
  id: "AUDIT-105",
  category: "architecture",
  severity: "error",
  title: "Transport registry enforces unique identifiers",
  description:
    "Transport identifiers must be declared once and rejected when duplicated.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-104"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_ID_UNIQUENESS_RULE,
      "src/transports/registry.ts",
      ["createStaticRegistryEntries", "Duplicate transport adapter id"],
      "Transport registry enforces unique identifiers.",
      "Retain duplicate-id detection in the static transport registry.",
    ),
};

export const TRANSPORT_DETERMINISTIC_SELECTION_RULE: AuditRule = {
  id: "AUDIT-106",
  category: "architecture",
  severity: "error",
  title: "Transport selection is pure and deterministic",
  description:
    "Transport resolution must use the requested transport and static registry only, with no scoring or discovery.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-105"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_DETERMINISTIC_SELECTION_RULE,
      "src/transports/selector.ts",
      [
        "export function selectTransport",
        "request.transportId",
        "TRANSPORT_REGISTRY.adapters.find",
      ],
      "Transport selection is pure and deterministic.",
      "Resolve only the explicit transport from the static registry.",
    ),
};

export const TRANSPORT_POLICY_RESTRICTION_RULE: AuditRule = {
  id: "AUDIT-107",
  category: "architecture",
  severity: "error",
  title: "Transport execution requires explicit policy authorization",
  description:
    "Transport registration or runtime selection must never enable execution without restrictive transport authorization.",
  metadata: {
    ...TRANSPORT_AUDIT_METADATA,
    tags: ["architecture", "execution", "policy"],
    dependsOn: ["AUDIT-106"],
  },
  check: () =>
    verifyTransportSource(
      TRANSPORT_POLICY_RESTRICTION_RULE,
      "src/transports/support.ts",
      [
        "transportPolicy.enabled",
        "allowedTransportIds",
        "LOCAL_PROCESS_RUNTIME_ID",
        "shell_exec",
      ],
      "Transport execution requires explicit policy authorization.",
      "Require an enabled allow-listed transport, approved runtime, provider, and shell_exec authorization.",
    ),
};

export const TRANSPORT_LOCAL_PROCESS_DELEGATION_RULE: AuditRule = {
  id: "AUDIT-108",
  category: "architecture",
  severity: "error",
  title: "Local-process transport delegates to the guarded backend",
  description:
    "The transport adapter must reuse the V10.1 local-process runtime rather than owning process execution.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-107"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_LOCAL_PROCESS_DELEGATION_RULE,
      "src/transports/local-process.ts",
      ["LocalProcessRuntime", "LocalProcessRuntime.execute", "shell_exec"],
      "Local-process transport delegates to the guarded backend.",
      "Keep V10.1 local-process as the only process execution source of truth.",
    ),
};

export const TRANSPORT_NO_DUPLICATE_SPAWN_RULE: AuditRule = {
  id: "AUDIT-109",
  category: "architecture",
  severity: "error",
  title: "Transport adapter does not duplicate process spawning",
  description:
    "The local-process transport must contain no child-process API or independent spawn implementation.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-108"] },
  check: () => {
    const source = transportSource("src/transports/local-process.ts") ?? "";
    const forbidden = [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
    ];
    const violations = forbidden
      .filter((pattern) => pattern.test(source))
      .map((pattern) => pattern.source);
    return violations.length === 0
      ? pass(
          TRANSPORT_NO_DUPLICATE_SPAWN_RULE,
          "Transport adapter does not duplicate process spawning.",
          ["src/transports/local-process.ts"],
        )
      : fail(
          TRANSPORT_NO_DUPLICATE_SPAWN_RULE,
          "Transport adapter contains a process execution API.",
          violations,
          "Delegate only to the guarded local-process backend.",
        );
  },
};

export const TRANSPORT_NO_SHELL_RULE: AuditRule = {
  id: "AUDIT-110",
  category: "architecture",
  severity: "error",
  title: "Transport preserves the no-shell boundary",
  description:
    "Transport contracts must use a structured command and delegate to the shell-false local-process backend.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-109"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_NO_SHELL_RULE,
      "src/transports/types.ts",
      ["LocalProcessCommand", "shell command string"],
      "Transport preserves the no-shell boundary.",
      "Keep transport commands structured and never accept shell command strings.",
    ),
};

export const TRANSPORT_PROVIDER_PLAN_VALIDATION_RULE: AuditRule = {
  id: "AUDIT-111",
  category: "architecture",
  severity: "error",
  title: "Core validates provider plans before transport resolution",
  description:
    "Incomplete or stub provider plans must fail with a structured transport error before transport selection.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-110"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_PROVIDER_PLAN_VALIDATION_RULE,
      "src/core/transports.ts",
      [
        'providerPlan.status !== "ready"',
        "provider_plan_not_executable",
        "createTransportAdapterRequest",
      ],
      "Core validates provider plans before transport resolution.",
      "Reject non-ready or missing-intent provider plans before selecting a transport.",
    ),
};

export const TRANSPORT_INVALID_PLAN_NO_START_RULE: AuditRule = {
  id: "AUDIT-112",
  category: "architecture",
  severity: "error",
  title: "Invalid provider plans cannot start a transport",
  description:
    "The explicit Core execution helper must return a rejection before resolving or invoking a transport for invalid plans.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-111"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_INVALID_PLAN_NO_START_RULE,
      "src/core/transports.ts",
      [
        'if (created.outcome === "rejected")',
        "return createProviderResult",
        "executeTransport",
      ],
      "Invalid provider plans cannot start a transport.",
      "Retain the early rejection branch before transport resolution and execution.",
    ),
};

export const TRANSPORT_LOCAL_PROCESS_PROVIDER_AGNOSTIC_RULE: AuditRule = {
  id: "AUDIT-113",
  category: "architecture",
  severity: "error",
  title: "Guarded local-process backend remains provider-agnostic",
  description:
    "The V10.1 backend must not import or reference provider-specific code after transport layering.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-112"] },
  check: () => {
    const source = transportSource("src/runtime/local-process.ts") ?? "";
    return !/providers\/|ProviderAdapter|OpenClawProvider|ClaudeCodeProvider|CodexProvider/.test(
      source,
    )
      ? pass(
          TRANSPORT_LOCAL_PROCESS_PROVIDER_AGNOSTIC_RULE,
          "Guarded local-process backend remains provider-agnostic.",
          ["src/runtime/local-process.ts"],
        )
      : fail(
          TRANSPORT_LOCAL_PROCESS_PROVIDER_AGNOSTIC_RULE,
          "Guarded local-process backend references provider-specific code.",
          ["src/runtime/local-process.ts"],
          "Keep the local-process backend independent from Provider adapters.",
        );
  },
};

export const TRANSPORT_PROVIDER_AGNOSTIC_RULE: AuditRule = {
  id: "AUDIT-114",
  category: "architecture",
  severity: "error",
  title: "Transport adapters remain provider-agnostic",
  description:
    "Transport modules may carry provider identity data but must not import provider adapters or construct provider commands.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-113"] },
  check: () => {
    const files = [
      "src/transports/types.ts",
      "src/transports/errors.ts",
      "src/transports/support.ts",
      "src/transports/registry.ts",
      "src/transports/selector.ts",
      "src/transports/local-process.ts",
    ];
    const violations = files.filter((path) =>
      /providers\/|ProviderAdapter/.test(transportSource(path) ?? ""),
    );
    return violations.length === 0
      ? pass(
          TRANSPORT_PROVIDER_AGNOSTIC_RULE,
          "Transport adapters remain provider-agnostic.",
          files,
        )
      : fail(
          TRANSPORT_PROVIDER_AGNOSTIC_RULE,
          "Transport adapter references provider-specific code.",
          violations,
          "Keep provider protocol and command construction outside transport adapters.",
        );
  },
};

export const TRANSPORT_NO_NETWORK_RULE: AuditRule = {
  id: "AUDIT-115",
  category: "architecture",
  severity: "error",
  title: "Transport module has no network integration",
  description:
    "V10.3 transports must not add HTTP, SDK, MCP, remote-worker, or network execution.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-114"] },
  check: () => {
    const files = [
      "src/transports/types.ts",
      "src/transports/errors.ts",
      "src/transports/support.ts",
      "src/transports/registry.ts",
      "src/transports/selector.ts",
      "src/transports/local-process.ts",
    ];
    const violations = files.filter((path) =>
      /\bfetch\s*\(|node:(http|https|net|tls)/.test(
        transportSource(path) ?? "",
      ),
    );
    return violations.length === 0
      ? pass(
          TRANSPORT_NO_NETWORK_RULE,
          "Transport module has no network integration.",
          files,
        )
      : fail(
          TRANSPORT_NO_NETWORK_RULE,
          "Transport module contains a network integration pattern.",
          violations,
          "Keep V10.3 transport adapters local and network-free.",
        );
  },
};

export const TRANSPORT_NO_SECRET_LOADING_RULE: AuditRule = {
  id: "AUDIT-116",
  category: "architecture",
  severity: "error",
  title: "Transport module does not load secrets or environment",
  description:
    "Transport adapters must receive only structured filtered intent and must not load credentials or the parent environment.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-115"] },
  check: () => {
    const files = [
      "src/transports/types.ts",
      "src/transports/errors.ts",
      "src/transports/support.ts",
      "src/transports/registry.ts",
      "src/transports/selector.ts",
      "src/transports/local-process.ts",
    ];
    const violations = files.filter((path) =>
      /process\.env|readFileSync\([^)]*\.env|load(?:Secret|Credential|ApiKey)/.test(
        transportSource(path) ?? "",
      ),
    );
    return violations.length === 0
      ? pass(
          TRANSPORT_NO_SECRET_LOADING_RULE,
          "Transport module does not load secrets or environment.",
          files,
        )
      : fail(
          TRANSPORT_NO_SECRET_LOADING_RULE,
          "Transport module may load credentials or environment.",
          violations,
          "Keep secret and parent-environment loading outside transport adapters.",
        );
  },
};

export const TRANSPORT_STRUCTURED_ERRORS_RULE: AuditRule = {
  id: "AUDIT-117",
  category: "architecture",
  severity: "error",
  title: "Transport errors are structured and stable",
  description:
    "Transport failures must expose stable codes, safe details, and explicit execution-started semantics.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-103"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_STRUCTURED_ERRORS_RULE,
      "src/transports/types.ts",
      [
        "TRANSPORT_ERROR_CODES",
        "executionStarted: boolean",
        "provider_plan_not_executable",
      ],
      "Transport errors are structured and stable.",
      "Keep TransportError codes typed, non-sensitive, and explicit about execution start.",
    ),
};

export const TRANSPORT_RESULT_NORMALIZATION_RULE: AuditRule = {
  id: "AUDIT-118",
  category: "architecture",
  severity: "error",
  title: "Transport results normalize guarded backend output",
  description:
    "Local-process results must be normalized to the stable TransportResult contract before Provider normalization.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-117"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_RESULT_NORMALIZATION_RULE,
      "src/transports/local-process.ts",
      [
        "normalizeLocalProcessResult",
        "executionStarted",
        "durationMs",
        "runtimeStatus",
      ],
      "Transport results normalize guarded backend output.",
      "Keep backend result mapping inside the local-process transport adapter.",
    ),
};

export const TRANSPORT_NO_CLI_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-119",
  category: "architecture",
  severity: "error",
  title: "Transport execution is absent from the CLI",
  description:
    "No public CLI command may import or expose transport execution.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-103"] },
  check: () => {
    const source = transportSource("src/cli.ts") ?? "";
    return !/transports\/|executeTransport|executeProviderPlan/.test(source)
      ? pass(
          TRANSPORT_NO_CLI_EXPOSURE_RULE,
          "Transport execution is absent from the CLI.",
          ["src/cli.ts"],
        )
      : fail(
          TRANSPORT_NO_CLI_EXPOSURE_RULE,
          "Transport execution leaked into the CLI.",
          ["src/cli.ts"],
          "Keep transport execution Core-only and out of public commands.",
        );
  },
};

export const TRANSPORT_NO_LOOPRUNNER_EXPOSURE_RULE: AuditRule = {
  id: "AUDIT-120",
  category: "architecture",
  severity: "error",
  title: "Transport execution is absent from LoopRunner",
  description:
    "LoopRunner plan mode must not import or invoke transport execution.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-119"] },
  check: () => {
    const source = transportSource("src/loop/runner.ts") ?? "";
    return !/transports\/|executeTransport|executeProviderPlan/.test(source)
      ? pass(
          TRANSPORT_NO_LOOPRUNNER_EXPOSURE_RULE,
          "Transport execution is absent from LoopRunner.",
          ["src/loop/runner.ts"],
        )
      : fail(
          TRANSPORT_NO_LOOPRUNNER_EXPOSURE_RULE,
          "Transport execution leaked into LoopRunner.",
          ["src/loop/runner.ts"],
          "Keep transport execution outside LoopRunner until an explicit public mode exists.",
        );
  },
};

export const TRANSPORT_DEPENDENCY_DIRECTION_RULE: AuditRule = {
  id: "AUDIT-121",
  category: "architecture",
  severity: "error",
  title: "Transport dependencies remain unidirectional",
  description:
    "Transport modules may depend on local-process runtime contracts and policy types, never Core or upper orchestration layers.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-114"] },
  check: () => {
    const files = [
      "src/transports/types.ts",
      "src/transports/errors.ts",
      "src/transports/support.ts",
      "src/transports/registry.ts",
      "src/transports/selector.ts",
      "src/transports/local-process.ts",
    ];
    const forbidden =
      /from\s+["'].*\/(core|commands|loop|providers|audit|reports)\//;
    const violations = files.filter((path) =>
      forbidden.test(transportSource(path) ?? ""),
    );
    return violations.length === 0
      ? pass(
          TRANSPORT_DEPENDENCY_DIRECTION_RULE,
          "Transport dependencies remain unidirectional.",
          files,
        )
      : fail(
          TRANSPORT_DEPENDENCY_DIRECTION_RULE,
          "Transport module imports an upper orchestration layer.",
          violations,
          "Keep transports independent from Core, providers, CLI, LoopRunner, reports, and audit.",
        );
  },
};

export const TRANSPORT_CORE_EXECUTION_BOUNDARY_RULE: AuditRule = {
  id: "AUDIT-122",
  category: "architecture",
  severity: "error",
  title: "Core owns explicit transport execution orchestration",
  description:
    "Only the Core helper may compose provider-plan validation, resolution, transport execution, and Provider result normalization.",
  metadata: { ...TRANSPORT_AUDIT_METADATA, dependsOn: ["AUDIT-121"] },
  check: () =>
    verifyTransportSource(
      TRANSPORT_CORE_EXECUTION_BOUNDARY_RULE,
      "src/core/transports.ts",
      [
        "createTransportAdapterRequest",
        "resolveTransport",
        "executeTransport",
        "normalizeProviderTransportResult",
        "executeProviderPlan",
      ],
      "Core owns explicit transport execution orchestration.",
      "Keep the execution chain explicit and available only through Core helpers.",
    ),
};

function openClawProtocolSource(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const OPENCLAW_PROTOCOL_AUDIT_METADATA = {
  introducedIn: "V10.4",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function openClawProtocolRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...OPENCLAW_PROTOCOL_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function protocolContains(
  rule: AuditRule,
  path: string,
  tokens: readonly string[],
  message: string,
): ReturnType<typeof pass> {
  const source = openClawProtocolSource(path);
  const missing = tokens.filter((token) => !source.includes(token));
  return missing.length === 0
    ? pass(rule, message, [path, ...tokens])
    : fail(
        rule,
        message,
        missing,
        "Restore the required deterministic OpenClaw protocol contract.",
      );
}

export const OPENCLAW_PROTOCOL_MODULE_RULE: AuditRule = openClawProtocolRule(
  "AUDIT-123",
  "OpenClaw protocol module is present",
  "V10.4 must provide internal OpenClaw protocol types, registry, normalization, validation, diagnostics, and planning.",
  ["AUDIT-122"],
  (rule) => {
    const files = [
      "src/providers/openclaw/types.ts",
      "src/providers/openclaw/protocol.ts",
      "src/providers/openclaw/normalization.ts",
      "src/providers/openclaw/validation.ts",
      "src/providers/openclaw/diagnostics.ts",
      "src/providers/openclaw/planning.ts",
    ];
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(rule, "OpenClaw protocol module is present.", files)
      : fail(
          rule,
          "OpenClaw protocol module is incomplete.",
          missing,
          "Restore all V10.4 OpenClaw protocol modules.",
        );
  },
);

export const OPENCLAW_PROTOCOL_VERSION_RULE: AuditRule = openClawProtocolRule(
  "AUDIT-124",
  "OpenClaw protocol versions are typed and static",
  "The internal planning schema must declare supported versions without environment or binary negotiation.",
  ["AUDIT-123"],
  (rule) =>
    protocolContains(
      rule,
      "src/providers/openclaw/types.ts",
      [
        "OPENCLAW_PROTOCOL_VERSIONS",
        "OpenClawProtocolVersion",
        "loop-engine-openclaw-planning/v1",
      ],
      "OpenClaw protocol versions are typed and static.",
    ),
);

export const OPENCLAW_PROTOCOL_OPERATION_RULE: AuditRule = openClawProtocolRule(
  "AUDIT-125",
  "OpenClaw operations are typed and static",
  "Only a closed abstract operation registry justified by Loop Engine planning may be accepted.",
  ["AUDIT-124"],
  (rule) =>
    protocolContains(
      rule,
      "src/providers/openclaw/protocol.ts",
      ["OPENCLAW_OPERATION_REGISTRY", 'operation: "plan"', "executable: false"],
      "OpenClaw operations are typed and static.",
    ),
);

export const OPENCLAW_PROTOCOL_NORMALIZATION_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-126",
    "OpenClaw request normalization is deterministic",
    "Normalization must derive a safe envelope from ProviderRequest without task content, process discovery, or timestamps.",
    ["AUDIT-125"],
    (rule) =>
      protocolContains(
        rule,
        "src/providers/openclaw/normalization.ts",
        [
          "normalizeOpenClawRequest",
          "taskId",
          "correlationId",
          "Object.freeze",
        ],
        "OpenClaw request normalization is deterministic.",
      ),
  );

export const OPENCLAW_PROTOCOL_VALIDATION_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-127",
    "OpenClaw protocol validation is pure and structured",
    "Validation must check versions, operations, identity, context, capabilities, permissions, runtime, and transport compatibility without throwing expected errors.",
    ["AUDIT-126"],
    (rule) =>
      protocolContains(
        rule,
        "src/providers/openclaw/validation.ts",
        [
          "validateOpenClawProtocolRequest",
          "OPENCLAW_PROTOCOL_VERSIONS",
          "OPENCLAW_OPERATION_REGISTRY",
          "openclaw_context_invalid",
          "openclaw_permission_denied",
        ],
        "OpenClaw protocol validation is pure and structured.",
      ),
  );

export const OPENCLAW_PROTOCOL_ERROR_RULE: AuditRule = openClawProtocolRule(
  "AUDIT-128",
  "OpenClaw protocol errors are typed and non-executing",
  "Protocol errors require stable codes, safe details, and executionStarted false.",
  ["AUDIT-127"],
  (rule) =>
    protocolContains(
      rule,
      "src/providers/openclaw/types.ts",
      [
        "OPENCLAW_PROTOCOL_ERROR_CODES",
        "openclaw_executable_mapping_missing",
        "executionStarted: false",
      ],
      "OpenClaw protocol errors are typed and non-executing.",
    ),
);

export const OPENCLAW_PROTOCOL_DIAGNOSTIC_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-129",
    "OpenClaw diagnostics are structured and safe",
    "Protocol diagnostics must identify validation outcomes without prompt, context, command, or secret content.",
    ["AUDIT-128"],
    (rule) =>
      protocolContains(
        rule,
        "src/providers/openclaw/diagnostics.ts",
        [
          "OpenClawProtocolDiagnostic",
          "validProtocolDiagnostic",
          "diagnosticFromError",
        ],
        "OpenClaw diagnostics are structured and safe.",
      ),
  );

export const OPENCLAW_PROTOCOL_NO_MAPPING_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-130",
    "OpenClaw has no executable mapping by default",
    "A protocol-valid request must still expose an absent executable mapping in V10.4.",
    ["AUDIT-129"],
    (rule) =>
      protocolContains(
        rule,
        "src/providers/openclaw/planning.ts",
        [
          'executableMapping: "absent"',
          "openclaw_executable_mapping_missing",
          "valid_non_executable",
        ],
        "OpenClaw has no executable mapping by default.",
      ),
  );

export const OPENCLAW_PROTOCOL_INERT_PLAN_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-131",
    "OpenClaw Provider plans remain inert",
    "The OpenClaw adapter may use protocol planning but must still return a non-ready ProviderExecutionPlan.",
    ["AUDIT-130"],
    (rule) =>
      protocolContains(
        rule,
        "src/providers/openclaw.ts",
        [
          "createOpenClawProtocolPlan",
          "createNotImplementedProviderPlan",
          "openclawProtocol",
        ],
        "OpenClaw Provider plans remain inert.",
      ),
  );

export const OPENCLAW_PROTOCOL_INVALID_PLAN_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-132",
    "Invalid OpenClaw protocol plans cannot reach Transport",
    "Protocol-invalid and non-executable plans must contain no transport intent or direct transport resolution.",
    ["AUDIT-131"],
    (rule) => {
      const source = openClawProtocolSource("src/providers/openclaw.ts");
      return !/transports\/|resolveTransport|executeTransport|transportIntent:/.test(
        source,
      )
        ? pass(
            rule,
            "Invalid OpenClaw protocol plans cannot reach Transport.",
            ["src/providers/openclaw.ts"],
          )
        : fail(
            rule,
            "OpenClaw protocol code references transport execution.",
            ["src/providers/openclaw.ts"],
            "Keep OpenClaw planning inert and transport-free.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_NO_COMMAND_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-133",
    "OpenClaw protocol constructs no undocumented command or binary",
    "V10.4 must not encode a provider executable, command line, flag, or discovery behavior.",
    ["AUDIT-132"],
    (rule) => {
      const files = [
        "src/providers/openclaw/protocol.ts",
        "src/providers/openclaw/normalization.ts",
        "src/providers/openclaw/validation.ts",
        "src/providers/openclaw/planning.ts",
      ];
      const forbidden =
        /executablePath|binaryPath|which\(|commandLine|--json|--prompt|--project|--model/;
      const violations = files.filter((path) =>
        forbidden.test(openClawProtocolSource(path)),
      );
      return violations.length === 0
        ? pass(
            rule,
            "OpenClaw protocol constructs no undocumented command or binary.",
            files,
          )
        : fail(
            rule,
            "OpenClaw protocol contains an undocumented command or binary pattern.",
            violations,
            "Remove executable, flag, command-line, and binary-discovery assumptions.",
          );
    },
  );

function noOpenClawProtocolIoRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return openClawProtocolRule(id, title, description, dependsOn, (rule) => {
    const files = [
      "src/providers/openclaw/types.ts",
      "src/providers/openclaw/protocol.ts",
      "src/providers/openclaw/diagnostics.ts",
      "src/providers/openclaw/normalization.ts",
      "src/providers/openclaw/validation.ts",
      "src/providers/openclaw/planning.ts",
    ];
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(openClawProtocolSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep the OpenClaw protocol local, inert, and free of external I/O.",
        );
  });
}

export const OPENCLAW_PROTOCOL_NO_PROCESS_RULE: AuditRule =
  noOpenClawProtocolIoRule(
    "AUDIT-134",
    "OpenClaw protocol has no process execution",
    "Protocol modules may not import child_process or invoke spawn or exec APIs",
    ["AUDIT-133"],
    [/child_process/, /\bspawn\s*\(/, /\bexec(?:File|Sync)?\s*\(/],
  );
export const OPENCLAW_PROTOCOL_NO_NETWORK_RULE: AuditRule =
  noOpenClawProtocolIoRule(
    "AUDIT-135",
    "OpenClaw protocol has no network integration",
    "Protocol modules may not call network APIs or import network modules",
    ["AUDIT-134"],
    [/\bfetch\s*\(/, /node:(http|https|net|tls)/],
  );
export const OPENCLAW_PROTOCOL_NO_SECRET_RULE: AuditRule =
  noOpenClawProtocolIoRule(
    "AUDIT-136",
    "OpenClaw protocol has no credential or environment loading",
    "Protocol modules may not read secrets, parent environment, or dotenv files",
    ["AUDIT-135"],
    [
      /process\.env/,
      /readFileSync\([^)]*\.env/,
      /load(?:Secret|Credential|ApiKey)/,
    ],
  );

export const OPENCLAW_PROTOCOL_TRANSPORT_BOUNDARY_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-137",
    "Transport modules do not depend on OpenClaw protocol",
    "Generic transports must remain provider-protocol agnostic",
    ["AUDIT-136"],
    (rule) => {
      const files = [
        "src/transports/types.ts",
        "src/transports/errors.ts",
        "src/transports/support.ts",
        "src/transports/registry.ts",
        "src/transports/selector.ts",
        "src/transports/local-process.ts",
      ];
      const violations = files.filter((path) =>
        /openclaw\//.test(openClawProtocolSource(path)),
      );
      return violations.length === 0
        ? pass(
            rule,
            "Transport modules do not depend on OpenClaw protocol.",
            files,
          )
        : fail(
            rule,
            "Transport module depends on OpenClaw protocol.",
            violations,
            "Keep transports provider-protocol agnostic.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_RUNTIME_BOUNDARY_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-138",
    "Runtime modules do not depend on OpenClaw protocol",
    "Runtime abstractions must not import protocol-specific planning modules",
    ["AUDIT-137"],
    (rule) => {
      const files = [
        "src/runtime/local-process.ts",
        "src/runtime/registry.ts",
        "src/runtime/selector.ts",
      ];
      const violations = files.filter((path) =>
        /openclaw\//.test(openClawProtocolSource(path)),
      );
      return violations.length === 0
        ? pass(
            rule,
            "Runtime modules do not depend on OpenClaw protocol.",
            files,
          )
        : fail(
            rule,
            "Runtime module depends on OpenClaw protocol.",
            violations,
            "Keep Runtime independent from provider protocol design.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_CLI_BOUNDARY_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-139",
    "CLI does not expose OpenClaw protocol",
    "No public CLI command may import or execute the protocol layer",
    ["AUDIT-138"],
    (rule) => {
      const source = openClawProtocolSource("src/cli.ts");
      return !/openclaw\//.test(source)
        ? pass(rule, "CLI does not expose OpenClaw protocol.", ["src/cli.ts"])
        : fail(
            rule,
            "CLI exposes OpenClaw protocol.",
            ["src/cli.ts"],
            "Keep protocol planning Core/provider-internal.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_LOOP_BOUNDARY_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-140",
    "LoopRunner does not expose OpenClaw protocol",
    "LoopRunner plan mode may not import or execute the protocol layer",
    ["AUDIT-139"],
    (rule) => {
      const source = openClawProtocolSource("src/loop/runner.ts");
      return !/openclaw\//.test(source)
        ? pass(rule, "LoopRunner does not expose OpenClaw protocol.", [
            "src/loop/runner.ts",
          ])
        : fail(
            rule,
            "LoopRunner exposes OpenClaw protocol.",
            ["src/loop/runner.ts"],
            "Keep protocol planning out of LoopRunner.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_OTHER_STUBS_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-141",
    "Claude Code and Codex remain inert stubs",
    "Other providers must not gain OpenClaw protocol fields, executable plans, or provider commands",
    ["AUDIT-140"],
    (rule) => {
      const files = ["src/providers/claude-code.ts", "src/providers/codex.ts"];
      const violations = files.filter(
        (path) =>
          /openclaw\/|transportIntent|createNotImplementedProviderPlan/.test(
            openClawProtocolSource(path),
          ) &&
          !openClawProtocolSource(path).includes(
            "createNotImplementedProviderPlan",
          ),
      );
      return violations.length === 0
        ? pass(rule, "Claude Code and Codex remain inert stubs.", files)
        : fail(
            rule,
            "Another provider gained OpenClaw-specific behavior.",
            violations,
            "Keep Claude Code and Codex as generic inert stubs.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_POLICY_SEPARATION_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-142",
    "OpenClaw protocol validity remains separate from policy authorization",
    "Protocol validation must not import policy resolution while the Provider adapter keeps restrictive policy support",
    ["AUDIT-141"],
    (rule) => {
      const protocol = openClawProtocolSource(
        "src/providers/openclaw/validation.ts",
      );
      const adapter = openClawProtocolSource("src/providers/openclaw.ts");
      return !/isProviderAllowed|resolvePolicy/.test(protocol) &&
        adapter.includes("isProviderAllowed")
        ? pass(
            rule,
            "OpenClaw protocol validity remains separate from policy authorization.",
            [
              "src/providers/openclaw/validation.ts",
              "src/providers/openclaw.ts",
            ],
          )
        : fail(
            rule,
            "OpenClaw protocol and policy authorization are not separated.",
            [
              "src/providers/openclaw/validation.ts",
              "src/providers/openclaw.ts",
            ],
            "Keep protocol validation pure and preserve Provider policy checks separately.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_DEPENDENCY_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-143",
    "OpenClaw protocol dependencies remain unidirectional",
    "Protocol modules may consume Provider/Runtime types but never Core, Transport, CLI, LoopRunner, reports, or audit",
    ["AUDIT-142"],
    (rule) => {
      const files = [
        "src/providers/openclaw/types.ts",
        "src/providers/openclaw/protocol.ts",
        "src/providers/openclaw/diagnostics.ts",
        "src/providers/openclaw/normalization.ts",
        "src/providers/openclaw/validation.ts",
        "src/providers/openclaw/planning.ts",
      ];
      const forbidden =
        /from\s+["'].*\/(core|transports|commands|loop|audit|reports)\//;
      const violations = files.filter((path) =>
        forbidden.test(openClawProtocolSource(path)),
      );
      return violations.length === 0
        ? pass(
            rule,
            "OpenClaw protocol dependencies remain unidirectional.",
            files,
          )
        : fail(
            rule,
            "OpenClaw protocol imports an upper layer.",
            violations,
            "Keep the protocol below Provider and above no execution layer.",
          );
    },
  );

export const OPENCLAW_PROTOCOL_ADAPTER_INTEGRATION_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-144",
    "OpenClaw adapter consumes the internal protocol only",
    "The adapter must normalize and plan internally without direct Runtime or Transport execution",
    ["AUDIT-143"],
    (rule) =>
      protocolContains(
        rule,
        "src/providers/openclaw.ts",
        [
          "normalizeOpenClawRequest",
          "createOpenClawProtocolPlan",
          "createNotImplementedProviderPlan",
        ],
        "OpenClaw adapter consumes the internal protocol only.",
      ),
  );

export const OPENCLAW_PROTOCOL_NO_PUBLIC_REPORT_RULE: AuditRule =
  openClawProtocolRule(
    "AUDIT-145",
    "OpenClaw protocol does not change public reports",
    "Protocol design must remain internal and absent from report generators",
    ["AUDIT-144"],
    (rule) => {
      const files = [
        "src/core/reports.ts",
        "src/commands/audit.ts",
        "src/commands/run.ts",
      ];
      const violations = files.filter((path) =>
        /openclaw\//.test(openClawProtocolSource(path)),
      );
      return violations.length === 0
        ? pass(rule, "OpenClaw protocol does not change public reports.", files)
        : fail(
            rule,
            "OpenClaw protocol leaked into public reports.",
            violations,
            "Keep protocol details internal to Provider planning.",
          );
    },
  );

function executableMappingSource(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const EXECUTABLE_MAPPING_AUDIT_METADATA = {
  introducedIn: "V10.5",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function executableMappingRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...EXECUTABLE_MAPPING_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function mappingContains(
  rule: AuditRule,
  path: string,
  tokens: readonly string[],
  message: string,
): ReturnType<typeof pass> {
  const source = executableMappingSource(path);
  const missing = tokens.filter((token) => !source.includes(token));
  return missing.length === 0
    ? pass(rule, message, [path, ...tokens])
    : fail(
        rule,
        message,
        missing,
        "Restore the deterministic mapping contract.",
      );
}

export const EXECUTABLE_MAPPING_MODULE_RULE: AuditRule = executableMappingRule(
  "AUDIT-146",
  "Executable mapping module is present",
  "V10.5 must expose the deterministic mapping contracts and Core integration helper.",
  ["AUDIT-145"],
  (rule) => {
    const files = [
      "src/providers/mapping/types.ts",
      "src/providers/mapping/errors.ts",
      "src/providers/mapping/registry.ts",
      "src/providers/mapping/selector.ts",
      "src/providers/mapping/validation.ts",
      "src/providers/mapping/support.ts",
      "src/providers/mapping/index.ts",
      "src/providers/mapping/index.ts",
      "src/core/mapping.ts",
    ];
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(rule, "Executable mapping module is present.", files)
      : fail(
          rule,
          "Executable mapping module is incomplete.",
          missing,
          "Restore all V10.5 mapping modules.",
        );
  },
);

export const EXECUTABLE_MAPPING_REGISTRY_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-147",
    "Executable mapping registry is static and deterministic",
    "Mapping registration must retain fixed declaration order without discovery or plugins.",
    ["AUDIT-146"],
    (rule) =>
      mappingContains(
        rule,
        "src/providers/mapping/registry.ts",
        [
          "createExecutableMappingRegistry",
          "EXECUTABLE_MAPPING_REGISTRY",
          "OpenClawExecutableMapping",
        ],
        "Executable mapping registry is static and deterministic.",
      ),
  );

export const EXECUTABLE_MAPPING_UNIQUENESS_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-148",
    "Executable mapping registry enforces unique identifiers",
    "Mappings must be uniquely declared in the static registry.",
    ["AUDIT-147"],
    (rule) =>
      mappingContains(
        rule,
        "src/providers/mapping/registry.ts",
        ["createStaticRegistryEntries", "Duplicate executable mapping id"],
        "Executable mapping registry enforces unique identifiers.",
      ),
  );

export const EXECUTABLE_MAPPING_VALIDATION_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-149",
    "Executable mapping validation is explicit and structured",
    "Validation must distinguish protocol, mapping, compatibility, and policy gates without execution.",
    ["AUDIT-148"],
    (rule) =>
      mappingContains(
        rule,
        "src/providers/mapping/validation.ts",
        [
          "validateExecutableMapping",
          "mapping_disabled",
          "mapping_policy_denied",
          "mapping_not_configured",
        ],
        "Executable mapping validation is explicit and structured.",
      ),
  );

export const EXECUTABLE_MAPPING_DISABLED_DEFAULT_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-150",
    "Executable mappings are disabled by default",
    "Registered mappings may not become enabled or configured implicitly.",
    ["AUDIT-149"],
    (rule) =>
      mappingContains(
        rule,
        "src/providers/mapping/registry.ts",
        ["enabled: false", "configured: false"],
        "Executable mappings are disabled by default.",
      ),
  );

function noExecutableMappingIoRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return executableMappingRule(id, title, description, dependsOn, (rule) => {
    const files = [
      "src/providers/mapping/types.ts",
      "src/providers/mapping/errors.ts",
      "src/providers/mapping/registry.ts",
      "src/providers/mapping/selector.ts",
      "src/providers/mapping/validation.ts",
      "src/providers/mapping/support.ts",
    ];
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(executableMappingSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep executable mapping local, declarative, and non-executing.",
        );
  });
}

export const EXECUTABLE_MAPPING_NO_EXECUTION_RULE: AuditRule =
  noExecutableMappingIoRule(
    "AUDIT-151",
    "Executable mapping never invokes a transport",
    "Mapping code may not construct, resolve, or invoke a transport execution path.",
    ["AUDIT-150"],
    [
      /createTransportRequest\s*\(/,
      /resolveTransport\s*\(/,
      /executeTransport\s*\(/,
      /executeProviderPlan\s*\(/,
      /\.execute\s*\(/,
    ],
  );
export const EXECUTABLE_MAPPING_NO_PROCESS_RULE: AuditRule =
  noExecutableMappingIoRule(
    "AUDIT-152",
    "Executable mapping has no process API",
    "Mapping code may not import child_process or invoke process APIs.",
    ["AUDIT-151"],
    [/child_process/, /\bspawn\s*\(/, /\bexec(?:File|Sync)?\s*\(/],
  );
export const EXECUTABLE_MAPPING_NO_NETWORK_RULE: AuditRule =
  noExecutableMappingIoRule(
    "AUDIT-153",
    "Executable mapping has no network integration",
    "Mapping code may not call network APIs or import network modules.",
    ["AUDIT-152"],
    [/\bfetch\s*\(/, /node:(http|https|net|tls)/],
  );
export const EXECUTABLE_MAPPING_NO_COMMAND_RULE: AuditRule =
  noExecutableMappingIoRule(
    "AUDIT-154",
    "Executable mapping contains no command metadata",
    "Mapping contracts may not encode executable paths, command lines, flags, or arguments.",
    ["AUDIT-153"],
    [
      /executablePath/,
      /binaryPath/,
      /commandLine/,
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bflags\s*:/,
    ],
  );

export const EXECUTABLE_MAPPING_CLI_BOUNDARY_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-155",
    "CLI does not expose executable mapping",
    "No public CLI command may import or resolve the mapping layer.",
    ["AUDIT-154"],
    (rule) => {
      const source = executableMappingSource("src/cli.ts");
      return !/providers\/mapping|ExecutableMapping|resolveExecutableMapping/.test(
        source,
      )
        ? pass(rule, "CLI does not expose executable mapping.", ["src/cli.ts"])
        : fail(
            rule,
            "CLI exposes executable mapping.",
            ["src/cli.ts"],
            "Keep mapping Core-only.",
          );
    },
  );
export const EXECUTABLE_MAPPING_LOOP_BOUNDARY_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-156",
    "LoopRunner does not expose executable mapping",
    "LoopRunner planning may not import or resolve the mapping layer.",
    ["AUDIT-155"],
    (rule) => {
      const source = executableMappingSource("src/loop/runner.ts");
      return !/providers\/mapping|ExecutableMapping|resolveExecutableMapping/.test(
        source,
      )
        ? pass(rule, "LoopRunner does not expose executable mapping.", [
            "src/loop/runner.ts",
          ])
        : fail(
            rule,
            "LoopRunner exposes executable mapping.",
            ["src/loop/runner.ts"],
            "Keep mapping out of LoopRunner.",
          );
    },
  );
export const EXECUTABLE_MAPPING_OPENCLAW_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-157",
    "OpenClaw executable mapping exists",
    "The static registry must declare exactly the documented OpenClaw protocol compatibility.",
    ["AUDIT-156"],
    (rule) =>
      mappingContains(
        rule,
        "src/providers/mapping/registry.ts",
        [
          "OpenClawExecutableMapping",
          "loop-engine-openclaw-planning/v1",
          'operation: "plan"',
        ],
        "OpenClaw executable mapping exists.",
      ),
  );
export const EXECUTABLE_MAPPING_OPENCLAW_DISABLED_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-158",
    "OpenClaw executable mapping remains disabled",
    "OpenClaw mapping must remain non-executable and unconfigured in V10.5.",
    ["AUDIT-157"],
    (rule) =>
      mappingContains(
        rule,
        "src/providers/mapping/registry.ts",
        ["enabled: false", "configured: false"],
        "OpenClaw executable mapping remains disabled.",
      ),
  );
export const EXECUTABLE_MAPPING_OTHER_PROVIDERS_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-159",
    "Claude Code and Codex remain unmapped",
    "The V10.5 mapping registry must not register Claude Code or Codex mappings.",
    ["AUDIT-158"],
    (rule) => {
      const source = executableMappingSource(
        "src/providers/mapping/registry.ts",
      );
      return !/Claude|Codex|claude-code|codex/.test(source)
        ? pass(rule, "Claude Code and Codex remain unmapped.", [
            "src/providers/mapping/registry.ts",
          ])
        : fail(
            rule,
            "Another provider was added to executable mapping.",
            ["src/providers/mapping/registry.ts"],
            "Keep Claude Code and Codex unmapped.",
          );
    },
  );
export const EXECUTABLE_MAPPING_DEPENDENCY_RULE: AuditRule =
  executableMappingRule(
    "AUDIT-160",
    "Executable mapping dependencies remain unidirectional",
    "Mapping modules may use Provider, protocol, policy, and transport contracts only; they must not import upper layers or implementations.",
    ["AUDIT-159"],
    (rule) => {
      const files = [
        "types.ts",
        "errors.ts",
        "registry.ts",
        "selector.ts",
        "validation.ts",
        "support.ts",
      ].map((file) => `src/providers/mapping/${file}`);
      const violations = files.filter((path) =>
        /from\s+["'][^"']*\/(core|cli|commands|loop)\/|from\s+["'][^"']*\/transports\/(local-process|registry|selector)/.test(
          executableMappingSource(path),
        ),
      );
      return violations.length === 0
        ? pass(
            rule,
            "Executable mapping dependencies remain unidirectional.",
            files,
          )
        : fail(
            rule,
            "Executable mapping imports an upper layer or implementation.",
            violations,
            "Keep mapping below Provider and above Transport contracts only.",
          );
    },
  );

function transportIntentSource(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const TRANSPORT_INTENT_AUDIT_METADATA = {
  introducedIn: "V10.6",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function transportIntentRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...TRANSPORT_INTENT_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function intentContains(
  rule: AuditRule,
  path: string,
  tokens: readonly string[],
  message: string,
): ReturnType<typeof pass> {
  const missing = tokens.filter(
    (token) => !transportIntentSource(path).includes(token),
  );
  return missing.length === 0
    ? pass(rule, message, [path, ...tokens])
    : fail(
        rule,
        message,
        missing,
        "Restore the deterministic transport intent contract.",
      );
}

export const TRANSPORT_INTENT_MODULE_RULE: AuditRule = transportIntentRule(
  "AUDIT-161",
  "Transport intent module is present",
  "V10.6 must expose declarative intent contracts and Core-only helpers.",
  ["AUDIT-160"],
  (rule) => {
    const files = [
      "types.ts",
      "errors.ts",
      "registry.ts",
      "selector.ts",
      "validation.ts",
      "support.ts",
      "index.ts",
    ]
      .map((file) => `src/providers/intent/${file}`)
      .concat("src/core/intent.ts");
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(rule, "Transport intent module is present.", files)
      : fail(
          rule,
          "Transport intent module is incomplete.",
          missing,
          "Restore all V10.6 intent modules.",
        );
  },
);
export const TRANSPORT_INTENT_CONTRACT_RULE: AuditRule = transportIntentRule(
  "AUDIT-162",
  "Transport intent contracts are typed and immutable",
  "Intent contracts must model identity, requirements, policy, validation, resolution, and structured errors only.",
  ["AUDIT-161"],
  (rule) =>
    intentContains(
      rule,
      "src/providers/intent/types.ts",
      [
        "TransportIntentId",
        "TransportIntent",
        "TransportIntentRequest",
        "TransportIntentResult",
        "TransportIntentValidation",
        "TransportIntentPolicy",
        "TransportIntentError",
        "executionStarted: false",
      ],
      "Transport intent contracts are typed and immutable.",
    ),
);
export const TRANSPORT_INTENT_REGISTRY_RULE: AuditRule = transportIntentRule(
  "AUDIT-163",
  "Transport intent registry is static and deterministic",
  "Intent registration must use fixed declaration order without discovery or plugins.",
  ["AUDIT-162"],
  (rule) =>
    intentContains(
      rule,
      "src/providers/intent/registry.ts",
      [
        "createTransportIntentRegistry",
        "TRANSPORT_INTENT_REGISTRY",
        "OpenClawTransportIntent",
      ],
      "Transport intent registry is static and deterministic.",
    ),
);
export const TRANSPORT_INTENT_UNIQUENESS_RULE: AuditRule = transportIntentRule(
  "AUDIT-164",
  "Transport intent registry enforces unique identifiers",
  "Intent identifiers must be unique in the static registry.",
  ["AUDIT-163"],
  (rule) =>
    intentContains(
      rule,
      "src/providers/intent/registry.ts",
      ["createStaticRegistryEntries", "Duplicate transport intent id"],
      "Transport intent registry enforces unique identifiers.",
    ),
);
export const TRANSPORT_INTENT_VALIDATION_RULE: AuditRule = transportIntentRule(
  "AUDIT-165",
  "Transport intent validation is explicit and structured",
  "Validation must check provider, runtime, mapping, policy, capability, activity, and configuration without execution.",
  ["AUDIT-164"],
  (rule) =>
    intentContains(
      rule,
      "src/providers/intent/validation.ts",
      [
        "validateTransportIntent",
        "intent_disabled",
        "intent_policy_denied",
        "intent_not_configured",
      ],
      "Transport intent validation is explicit and structured.",
    ),
);
export const TRANSPORT_INTENT_INACTIVE_DEFAULT_RULE: AuditRule =
  transportIntentRule(
    "AUDIT-166",
    "Transport intents are inactive by default",
    "Registered intents may not become active or configured implicitly.",
    ["AUDIT-165"],
    (rule) =>
      intentContains(
        rule,
        "src/providers/intent/registry.ts",
        ["active: false", "configured: false"],
        "Transport intents are inactive by default.",
      ),
  );

function noTransportIntentSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return transportIntentRule(id, title, description, dependsOn, (rule) => {
    const files = [
      "types.ts",
      "errors.ts",
      "registry.ts",
      "selector.ts",
      "validation.ts",
      "support.ts",
      "index.ts",
    ].map((file) => `src/providers/intent/${file}`);
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportIntentSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep transport intent declarative and non-executing.",
        );
  });
}

export const TRANSPORT_INTENT_NO_COMMAND_RULE: AuditRule =
  noTransportIntentSurfaceRule(
    "AUDIT-167",
    "Transport intent has no command metadata",
    "Intent code may not encode commands, arguments, flags, environments, or working directories.",
    ["AUDIT-166"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bflags\s*:/,
      /environment\s*:/,
      /workingDirectory\s*:/,
      /processOptions\s*:/,
    ],
  );
export const TRANSPORT_INTENT_NO_PATH_RULE: AuditRule =
  noTransportIntentSurfaceRule(
    "AUDIT-168",
    "Transport intent has no executable paths",
    "Intent code may not encode executable paths, binary paths, or discovery behavior.",
    ["AUDIT-167"],
    [/executablePath/, /binaryPath/, /which\s*\(/, /realpathSync/],
  );
export const TRANSPORT_INTENT_NO_PROCESS_RULE: AuditRule =
  noTransportIntentSurfaceRule(
    "AUDIT-169",
    "Transport intent has no process APIs",
    "Intent code may not import child_process or call spawn, exec, or fork APIs.",
    ["AUDIT-168"],
    [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
    ],
  );
export const TRANSPORT_INTENT_NO_RUNTIME_EXECUTION_RULE: AuditRule =
  noTransportIntentSurfaceRule(
    "AUDIT-170",
    "Transport intent has no runtime execution",
    "Intent code may not resolve or execute a Runtime adapter.",
    ["AUDIT-169"],
    [/resolveRuntime\s*\(/, /executeRuntime\s*\(/, /\.runtime\.execute\s*\(/],
  );
export const TRANSPORT_INTENT_NO_TRANSPORT_EXECUTION_RULE: AuditRule =
  noTransportIntentSurfaceRule(
    "AUDIT-171",
    "Transport intent has no transport execution",
    "Intent code may not construct a transport payload, resolve a transport, or invoke a transport adapter.",
    ["AUDIT-170"],
    [
      /TransportRequest/,
      /createTransportRequest\s*\(/,
      /resolveTransport\s*\(/,
      /executeTransport\s*\(/,
      /\.execute\s*\(/,
    ],
  );
export const TRANSPORT_INTENT_CLI_BOUNDARY_RULE: AuditRule =
  transportIntentRule(
    "AUDIT-172",
    "CLI does not expose transport intent",
    "No public CLI command may import or resolve the intent layer.",
    ["AUDIT-171"],
    (rule) =>
      !/providers\/intent|TransportIntent|resolveTransportIntent/.test(
        transportIntentSource("src/cli.ts"),
      )
        ? pass(rule, "CLI does not expose transport intent.", ["src/cli.ts"])
        : fail(
            rule,
            "CLI exposes transport intent.",
            ["src/cli.ts"],
            "Keep intent Core-only.",
          ),
  );
export const TRANSPORT_INTENT_LOOP_BOUNDARY_RULE: AuditRule =
  transportIntentRule(
    "AUDIT-173",
    "LoopRunner does not expose transport intent",
    "LoopRunner planning may not import or resolve the intent layer.",
    ["AUDIT-172"],
    (rule) =>
      !/providers\/intent|TransportIntent|resolveTransportIntent/.test(
        transportIntentSource("src/loop/runner.ts"),
      )
        ? pass(rule, "LoopRunner does not expose transport intent.", [
            "src/loop/runner.ts",
          ])
        : fail(
            rule,
            "LoopRunner exposes transport intent.",
            ["src/loop/runner.ts"],
            "Keep intent out of LoopRunner.",
          ),
  );
export const TRANSPORT_INTENT_OPENCLAW_RULE: AuditRule = transportIntentRule(
  "AUDIT-174",
  "OpenClaw transport intent exists",
  "The static registry must declare the documented OpenClaw intent only.",
  ["AUDIT-173"],
  (rule) =>
    intentContains(
      rule,
      "src/providers/intent/registry.ts",
      [
        "OpenClawTransportIntent",
        'id: "openclaw-plan"',
        'mappingId: "openclaw-planning"',
        'transportId: "local-process"',
      ],
      "OpenClaw transport intent exists.",
    ),
);
export const TRANSPORT_INTENT_OPENCLAW_INACTIVE_RULE: AuditRule =
  transportIntentRule(
    "AUDIT-175",
    "OpenClaw transport intent remains inactive",
    "OpenClaw intent must remain non-executable and unconfigured in V10.6.",
    ["AUDIT-174"],
    (rule) =>
      intentContains(
        rule,
        "src/providers/intent/registry.ts",
        ["active: false", "configured: false"],
        "OpenClaw transport intent remains inactive.",
      ),
  );
export const TRANSPORT_INTENT_DEPENDENCY_RULE: AuditRule = transportIntentRule(
  "AUDIT-176",
  "Transport intent dependencies remain unidirectional",
  "Intent modules may depend on Provider, mapping, policy, and transport contracts only, never upper layers or implementations.",
  ["AUDIT-175"],
  (rule) => {
    const files = [
      "types.ts",
      "errors.ts",
      "registry.ts",
      "selector.ts",
      "validation.ts",
      "support.ts",
      "index.ts",
    ].map((file) => `src/providers/intent/${file}`);
    const violations = files.filter((path) =>
      /from\s+["'][^"']*\/(core|cli|commands|loop)\/|from\s+["'][^"']*\/transports\/(local-process|registry|selector)/.test(
        transportIntentSource(path),
      ),
    );
    return violations.length === 0
      ? pass(
          rule,
          "Transport intent dependencies remain unidirectional.",
          files,
        )
      : fail(
          rule,
          "Transport intent imports an upper layer or implementation.",
          violations,
          "Keep intent below mapping and above Transport contracts only.",
        );
  },
);

function capabilityPolicySource(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const CAPABILITY_POLICY_AUDIT_METADATA = {
  introducedIn: "V10.7",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function capabilityPolicyRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...CAPABILITY_POLICY_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function policyContains(
  rule: AuditRule,
  path: string,
  tokens: readonly string[],
  message: string,
): ReturnType<typeof pass> {
  const missing = tokens.filter(
    (token) => !capabilityPolicySource(path).includes(token),
  );
  return missing.length === 0
    ? pass(rule, message, [path, ...tokens])
    : fail(
        rule,
        message,
        missing,
        "Restore the deterministic capability and policy contract.",
      );
}

const CAPABILITY_POLICY_FILES = [
  "types.ts",
  "errors.ts",
  "registry.ts",
  "selector.ts",
  "validation.ts",
  "evaluation.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/policy/${file}`);

export const CAPABILITY_POLICY_MODULE_RULE: AuditRule = capabilityPolicyRule(
  "AUDIT-177",
  "Capability policy module is present",
  "V10.7 must expose deterministic capability, policy, and authorization contracts with Core helpers.",
  ["AUDIT-176"],
  (rule) => {
    const files = CAPABILITY_POLICY_FILES.concat("src/core/policy.ts");
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(rule, "Capability policy module is present.", files)
      : fail(
          rule,
          "Capability policy module is incomplete.",
          missing,
          "Restore all V10.7 policy modules.",
        );
  },
);

export const CAPABILITY_POLICY_CAPABILITY_REGISTRY_RULE: AuditRule =
  capabilityPolicyRule(
    "AUDIT-178",
    "Capability registry is static and deterministic",
    "Capability identifiers must come from a fixed immutable registry.",
    ["AUDIT-177"],
    (rule) =>
      policyContains(
        rule,
        "src/policy/registry.ts",
        ["CAPABILITY_REGISTRY", "AGENT_CAPABILITIES"],
        "Capability registry is static and deterministic.",
      ),
  );

export const CAPABILITY_POLICY_POLICY_REGISTRY_RULE: AuditRule =
  capabilityPolicyRule(
    "AUDIT-179",
    "Policy registry is static and deterministic",
    "Policy rules must use fixed declaration order and reject duplicate identifiers.",
    ["AUDIT-178"],
    (rule) =>
      policyContains(
        rule,
        "src/policy/registry.ts",
        [
          "DEFAULT_DENY_POLICY",
          "createPolicyRegistry",
          "POLICY_REGISTRY",
          "Duplicate policy id",
        ],
        "Policy registry is static and deterministic.",
      ),
  );

export const CAPABILITY_POLICY_CONTRACT_RULE: AuditRule = capabilityPolicyRule(
  "AUDIT-180",
  "Authorization contracts are typed and immutable",
  "Capability, policy, and authorization contracts must model a non-executing decision only.",
  ["AUDIT-179"],
  (rule) =>
    policyContains(
      rule,
      "src/policy/types.ts",
      [
        "CapabilityId",
        "CapabilityRequirement",
        "CapabilitySet",
        "CapabilityEvaluation",
        "PolicyId",
        "PolicyRule",
        "PolicyDecision",
        "AuthorizationDecision",
        "AuthorizationStatus",
        "AuthorizationSummary",
        "executionStarted: false",
      ],
      "Authorization contracts are typed and immutable.",
    ),
);

export const CAPABILITY_POLICY_EVALUATION_RULE: AuditRule =
  capabilityPolicyRule(
    "AUDIT-181",
    "Authorization evaluation is explicit and deterministic",
    "Evaluation must check compatibility, capabilities, permissions, activation, configuration, and policy without execution.",
    ["AUDIT-180"],
    (rule) =>
      policyContains(
        rule,
        "src/policy/evaluation.ts",
        [
          "evaluateCapabilities",
          "evaluatePolicies",
          "evaluateAuthorization",
          "mapping_disabled",
          "intent_inactive",
          "policy_denied",
        ],
        "Authorization evaluation is explicit and deterministic.",
      ),
  );

export const CAPABILITY_POLICY_DEFAULT_DENY_RULE: AuditRule =
  capabilityPolicyRule(
    "AUDIT-182",
    "Capability policy defaults to deny",
    "The shipped policy rule must be disabled with empty allow-lists.",
    ["AUDIT-181"],
    (rule) =>
      policyContains(
        rule,
        "src/policy/registry.ts",
        [
          "enabled: false",
          "allowedProviders: Object.freeze([])",
          "allowedTransports: Object.freeze([])",
        ],
        "Capability policy defaults to deny.",
      ),
  );

export const CAPABILITY_POLICY_OPENCLAW_RULE: AuditRule = capabilityPolicyRule(
  "AUDIT-183",
  "OpenClaw remains not authorized",
  "The disabled OpenClaw executable mapping must result in a non-authorized decision.",
  ["AUDIT-182"],
  (rule) =>
    policyContains(
      rule,
      "src/policy/evaluation.ts",
      ["not_authorized", "mapping_disabled"],
      "OpenClaw remains not authorized.",
    ),
);

function noCapabilityPolicySurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return capabilityPolicyRule(id, title, description, dependsOn, (rule) => {
    const violations = CAPABILITY_POLICY_FILES.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(capabilityPolicySource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", CAPABILITY_POLICY_FILES)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep the policy engine deterministic and non-executing.",
        );
  });
}

export const CAPABILITY_POLICY_NO_TRANSPORT_REQUEST_RULE: AuditRule =
  noCapabilityPolicySurfaceRule(
    "AUDIT-184",
    "Capability policy has no transport request",
    "Policy code may not create, resolve, or execute a transport request.",
    ["AUDIT-183"],
    [
      /TransportRequest/,
      /createTransportRequest\s*\(/,
      /resolveTransport\s*\(/,
      /executeTransport\s*\(/,
    ],
  );

export const CAPABILITY_POLICY_NO_RUNTIME_EXECUTION_RULE: AuditRule =
  noCapabilityPolicySurfaceRule(
    "AUDIT-185",
    "Capability policy has no runtime execution",
    "Policy code may not resolve or invoke a Runtime adapter.",
    ["AUDIT-184"],
    [/resolveRuntime\s*\(/, /executeRuntime\s*\(/, /\.runtime\.execute\s*\(/],
  );

export const CAPABILITY_POLICY_NO_PROVIDER_EXECUTION_RULE: AuditRule =
  noCapabilityPolicySurfaceRule(
    "AUDIT-186",
    "Capability policy has no provider execution",
    "Policy code may not prepare or invoke a Provider adapter.",
    ["AUDIT-185"],
    [
      /prepareProvider\s*\(/,
      /executeProvider\s*\(/,
      /\.provider\.prepare\s*\(/,
    ],
  );

export const CAPABILITY_POLICY_NO_PROCESS_RULE: AuditRule =
  noCapabilityPolicySurfaceRule(
    "AUDIT-187",
    "Capability policy has no process APIs",
    "Policy code may not import process APIs or read process environment.",
    ["AUDIT-186"],
    [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
    ],
  );

export const CAPABILITY_POLICY_NO_PATH_RULE: AuditRule =
  noCapabilityPolicySurfaceRule(
    "AUDIT-188",
    "Capability policy has no executable paths",
    "Policy code may not declare binary paths or filesystem discovery.",
    ["AUDIT-187"],
    [/executablePath/, /binaryPath/, /which\s*\(/, /realpathSync/],
  );

export const CAPABILITY_POLICY_NO_COMMAND_RULE: AuditRule =
  noCapabilityPolicySurfaceRule(
    "AUDIT-189",
    "Capability policy has no command strings",
    "Policy code may not carry commands, arguments, flags, or process options.",
    ["AUDIT-188"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bflags\s*:/,
      /environment\s*:/,
      /workingDirectory\s*:/,
      /processOptions\s*:/,
    ],
  );

export const CAPABILITY_POLICY_DEPENDENCY_RULE: AuditRule =
  capabilityPolicyRule(
    "AUDIT-190",
    "Capability policy dependencies remain unidirectional",
    "Policy modules may consume contracts only, never upper layers or concrete Runtime or Transport implementations.",
    ["AUDIT-189"],
    (rule) => {
      const violations = CAPABILITY_POLICY_FILES.filter((path) =>
        /from\s+["'][^"']*\/(core|cli|commands|loop)\/|from\s+["'][^"']*\/(runtime|transports)\/(local-process|registry|selector)/.test(
          capabilityPolicySource(path),
        ),
      );
      return violations.length === 0
        ? pass(
            rule,
            "Capability policy dependencies remain unidirectional.",
            CAPABILITY_POLICY_FILES,
          )
        : fail(
            rule,
            "Capability policy imports an upper layer or implementation.",
            violations,
            "Keep policy below intent and above future transport execution.",
          );
    },
  );

function authorizationConfigurationSource(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const AUTHORIZATION_CONFIGURATION_AUDIT_METADATA = {
  introducedIn: "V10.8",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function authorizationConfigurationRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...AUTHORIZATION_CONFIGURATION_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function authorizationConfigurationContains(
  rule: AuditRule,
  path: string,
  tokens: readonly string[],
  message: string,
): ReturnType<typeof pass> {
  const missing = tokens.filter(
    (token) => !authorizationConfigurationSource(path).includes(token),
  );
  return missing.length === 0
    ? pass(rule, message, [path, ...tokens])
    : fail(
        rule,
        message,
        missing,
        "Restore the deterministic authorization configuration contract.",
      );
}

const AUTHORIZATION_CONFIGURATION_FILES = [
  "types.ts",
  "errors.ts",
  "registry.ts",
  "selector.ts",
  "validation.ts",
  "configuration.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/authorization/${file}`);

export const AUTHORIZATION_CONFIGURATION_MODULE_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-191",
    "Authorization configuration module is present",
    "V10.8 must expose declarative configuration contracts and Core-only helpers.",
    ["AUDIT-190"],
    (rule) => {
      const files = AUTHORIZATION_CONFIGURATION_FILES.concat(
        "src/core/authorization.ts",
      );
      const missing = files.filter((path) => !existsSync(path));
      return missing.length === 0
        ? pass(rule, "Authorization configuration module is present.", files)
        : fail(
            rule,
            "Authorization configuration module is incomplete.",
            missing,
            "Restore all V10.8 authorization configuration modules.",
          );
    },
  );

export const AUTHORIZATION_CONFIGURATION_REGISTRY_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-192",
    "Authorization configuration registry is static and deterministic",
    "Configuration registration must use a fixed declaration order and unique identifiers.",
    ["AUDIT-191"],
    (rule) =>
      authorizationConfigurationContains(
        rule,
        "src/authorization/registry.ts",
        [
          "OpenClawAuthorizationConfiguration",
          "createAuthorizationConfigurationRegistry",
          "AUTHORIZATION_CONFIGURATION_REGISTRY",
          "Duplicate authorization configuration id",
        ],
        "Authorization configuration registry is static and deterministic.",
      ),
  );

export const AUTHORIZATION_CONFIGURATION_CONTRACT_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-193",
    "Authorization configuration contracts are typed and immutable",
    "Configuration contracts must describe reviewable identity and version requirements only.",
    ["AUDIT-192"],
    (rule) =>
      authorizationConfigurationContains(
        rule,
        "src/authorization/types.ts",
        [
          "AuthorizationConfigurationId",
          "AuthorizationConfiguration",
          "AuthorizationConfigurationStatus",
          "AuthorizationConfigurationMetadata",
          "AuthorizationConfigurationRegistry",
          "AuthorizationConfigurationSelection",
          "AuthorizationConfigurationResolution",
          "AuthorizationConfigurationValidation",
          "AuthorizationConfigurationResult",
          "AuthorizationConfigurationSummary",
          "AuthorizationConfigurationRequirement",
          "AuthorizationConfigurationPolicy",
          "executionStarted: false",
        ],
        "Authorization configuration contracts are typed and immutable.",
      ),
  );

export const AUTHORIZATION_CONFIGURATION_VALIDATION_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-194",
    "Authorization configuration validation is explicit",
    "Validation must check decision, activation, policy, approval, and review without execution.",
    ["AUDIT-193"],
    (rule) =>
      authorizationConfigurationContains(
        rule,
        "src/authorization/validation.ts",
        [
          "validateAuthorizationConfiguration",
          "configuration_not_authorized",
          "configuration_inactive",
          "configuration_unapproved",
          "configuration_review_required",
        ],
        "Authorization configuration validation is explicit.",
      ),
  );

export const AUTHORIZATION_CONFIGURATION_DEFAULT_DENY_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-195",
    "Authorization configurations default to deny",
    "The OpenClaw declaration must remain inactive, unapproved, and unconfigured.",
    ["AUDIT-194"],
    (rule) =>
      authorizationConfigurationContains(
        rule,
        "src/authorization/registry.ts",
        ["active: false", "approved: false", "configured: false"],
        "Authorization configurations default to deny.",
      ),
  );

export const AUTHORIZATION_CONFIGURATION_REVIEW_REQUIRED_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-196",
    "Authorization configuration requires review",
    "The shipped configuration must require an explicit future review.",
    ["AUDIT-195"],
    (rule) =>
      authorizationConfigurationContains(
        rule,
        "src/authorization/registry.ts",
        ["reviewRequired: true"],
        "Authorization configuration requires review.",
      ),
  );

export const AUTHORIZATION_CONFIGURATION_OPENCLAW_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-197",
    "OpenClaw authorization configuration exists",
    "The sole V10.8 configuration must describe OpenClaw review requirements only.",
    ["AUDIT-196"],
    (rule) =>
      authorizationConfigurationContains(
        rule,
        "src/authorization/registry.ts",
        [
          "OpenClawAuthorizationConfiguration",
          'id: "openclaw-plan-review"',
          'mappingId: "openclaw-planning"',
          'intentId: "openclaw-plan"',
        ],
        "OpenClaw authorization configuration exists.",
      ),
  );

function noAuthorizationConfigurationSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return authorizationConfigurationRule(
    id,
    title,
    description,
    dependsOn,
    (rule) => {
      const violations = AUTHORIZATION_CONFIGURATION_FILES.flatMap((path) =>
        patterns
          .filter((pattern) =>
            pattern.test(authorizationConfigurationSource(path)),
          )
          .map((pattern) => `${path}: ${pattern.source}`),
      );
      return violations.length === 0
        ? pass(rule, title + ".", AUTHORIZATION_CONFIGURATION_FILES)
        : fail(
            rule,
            title + ".",
            violations,
            "Keep authorization configuration declarative and non-executing.",
          );
    },
  );
}

export const AUTHORIZATION_CONFIGURATION_NO_COMMAND_RULE: AuditRule =
  noAuthorizationConfigurationSurfaceRule(
    "AUDIT-198",
    "Authorization configuration has no command strings",
    "Configuration code may not carry commands, arguments, flags, environments, or process options.",
    ["AUDIT-197"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bflags\s*:/,
      /environment\s*:/,
      /workingDirectory\s*:/,
      /processOptions\s*:/,
    ],
  );

export const AUTHORIZATION_CONFIGURATION_NO_PATH_RULE: AuditRule =
  noAuthorizationConfigurationSurfaceRule(
    "AUDIT-199",
    "Authorization configuration has no binary paths",
    "Configuration code may not encode binary paths or filesystem discovery.",
    ["AUDIT-198"],
    [/executablePath/, /binaryPath/, /which\s*\(/, /realpathSync/],
  );

export const AUTHORIZATION_CONFIGURATION_NO_EXECUTION_RULE: AuditRule =
  noAuthorizationConfigurationSurfaceRule(
    "AUDIT-200",
    "Authorization configuration has no execution boundary",
    "Configuration code may not create transport or runtime requests, resolve adapters, or execute providers.",
    ["AUDIT-199"],
    [
      /TransportRequest/,
      /RuntimeRequest/,
      /createTransportRequest\s*\(/,
      /resolveTransport\s*\(/,
      /executeTransport\s*\(/,
      /resolveRuntime\s*\(/,
      /executeRuntime\s*\(/,
      /prepareProvider\s*\(/,
      /executeProvider\s*\(/,
    ],
  );

export const AUTHORIZATION_CONFIGURATION_NO_PROCESS_RULE: AuditRule =
  noAuthorizationConfigurationSurfaceRule(
    "AUDIT-201",
    "Authorization configuration has no process APIs",
    "Configuration code may not import process APIs, read environment, or access the network.",
    ["AUDIT-200"],
    [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /\bfetch\s*\(/,
      /node:(http|https|net|tls)/,
    ],
  );

export const AUTHORIZATION_CONFIGURATION_DEPENDENCY_RULE: AuditRule =
  authorizationConfigurationRule(
    "AUDIT-202",
    "Authorization configuration dependencies remain unidirectional",
    "Configuration modules may consume contracts only, never upper layers or concrete Runtime or Transport implementations.",
    ["AUDIT-201"],
    (rule) => {
      const violations = AUTHORIZATION_CONFIGURATION_FILES.filter((path) =>
        /from\s+["'][^"']*\/(core|cli|commands|loop)\/|from\s+["'][^"']*\/(runtime|transports)\/(local-process|registry|selector)/.test(
          authorizationConfigurationSource(path),
        ),
      );
      return violations.length === 0
        ? pass(
            rule,
            "Authorization configuration dependencies remain unidirectional.",
            AUTHORIZATION_CONFIGURATION_FILES,
          )
        : fail(
            rule,
            "Authorization configuration imports an upper layer or implementation.",
            violations,
            "Keep configuration below authorization evaluation and above any future review boundary.",
          );
    },
  );

function transportRequestSource(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const TRANSPORT_REQUEST_AUDIT_METADATA = {
  introducedIn: "V11.1",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function transportRequestRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...TRANSPORT_REQUEST_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function transportRequestContains(
  rule: AuditRule,
  path: string,
  tokens: readonly string[],
  message: string,
): ReturnType<typeof pass> {
  const missing = tokens.filter(
    (token) => !transportRequestSource(path).includes(token),
  );
  return missing.length === 0
    ? pass(rule, message, [path, ...tokens])
    : fail(
        rule,
        message,
        missing,
        "Restore the deterministic TransportRequest contract.",
      );
}

const TRANSPORT_REQUEST_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/transport-request/${file}`);

export const TRANSPORT_REQUEST_MODULE_RULE: AuditRule = transportRequestRule(
  "AUDIT-203",
  "TransportRequest module is present",
  "V11.1 must expose declarative TransportRequest contracts and Core-only helpers.",
  ["AUDIT-202"],
  (rule) => {
    const files = TRANSPORT_REQUEST_FILES.concat(
      "src/core/transport-request.ts",
    );
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(rule, "TransportRequest module is present.", files)
      : fail(
          rule,
          "TransportRequest module is incomplete.",
          missing,
          "Restore all V11.1 TransportRequest modules.",
        );
  },
);

export const TRANSPORT_REQUEST_DECLARATIVE_RULE: AuditRule =
  transportRequestRule(
    "AUDIT-204",
    "TransportRequest contracts are declarative",
    "TransportRequest must reference validated Provider, mapping, authorization, runtime, transport, capability, and policy evidence only.",
    ["AUDIT-203"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/transport-request/types.ts",
        [
          "TransportRequestId",
          "TransportRequest",
          "TransportRequestStatus",
          "TransportRequestValidation",
          "TransportRequestMetadata",
          "TransportRequestCapabilityReference",
          "TransportRequestRuntimeReference",
          "TransportRequestTransportReference",
          "TransportRequestPolicyReference",
          "TransportRequestSummary",
          "TransportRequestResult",
          "TransportRequestError",
          "TransportRequestErrorCode",
          "active: false",
          "dispatchable: false",
          "executable: false",
          "validationRequired: true",
          "executionStarted: false",
        ],
        "TransportRequest contracts are declarative.",
      ),
  );

function noTransportRequestSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return transportRequestRule(id, title, description, dependsOn, (rule) => {
    const files = TRANSPORT_REQUEST_FILES.concat(
      "src/core/transport-request.ts",
    );
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep TransportRequest declarative and disconnected from execution.",
        );
  });
}

export const TRANSPORT_REQUEST_NO_EXECUTION_FIELDS_RULE: AuditRule =
  noTransportRequestSurfaceRule(
    "AUDIT-205",
    "TransportRequest contains no execution fields",
    "TransportRequest may not encode execution payloads or dispatch state.",
    ["AUDIT-204"],
    [
      /\bexecute\s*:/,
      /\bdispatch\s*:/,
      /TransportAdapterRequest/,
      /LocalProcessCommand/,
      /LocalProcessExecutionPolicy/,
      /TransportExecutionPolicy/,
    ],
  );

export const TRANSPORT_REQUEST_NO_COMMAND_PROCESS_FILESYSTEM_RULE: AuditRule =
  noTransportRequestSurfaceRule(
    "AUDIT-206",
    "TransportRequest contains no command, process, or filesystem fields",
    "TransportRequest may not carry commands, arguments, process APIs, paths, environments, credentials, or filesystem discovery.",
    ["AUDIT-205"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bargv\s*:/,
      /\bstdin\s*:/,
      /\bstdout\s*:/,
      /\bstderr\s*:/,
      /environment\s*:/,
      /credentials?\s*:/,
      /workingDirectory/,
      /\bcwd\s*:/,
      /timeoutMs/,
      /executablePath/,
      /binaryPath/,
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /realpathSync/,
      /readdirSync/,
    ],
  );

export const TRANSPORT_REQUEST_NO_NETWORK_RULE: AuditRule =
  noTransportRequestSurfaceRule(
    "AUDIT-207",
    "TransportRequest contains no network surface",
    "TransportRequest may not access the network or describe network execution.",
    ["AUDIT-206"],
    [/\bfetch\s*\(/, /node:(http|https|net|tls)/],
  );

export const TRANSPORT_REQUEST_RUNTIME_DISCONNECTED_RULE: AuditRule =
  noTransportRequestSurfaceRule(
    "AUDIT-208",
    "TransportRequest is disconnected from Runtime execution",
    "TransportRequest may reference Runtime identity contracts but may not consume RuntimeRequest, adapters, or implementations.",
    ["AUDIT-207"],
    [
      /RuntimeRequest/,
      /RuntimeAdapter/,
      /RuntimeExecution/,
      /LocalProcessRuntime/,
      /executeRuntime/,
      /resolveRuntime\s*\(/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const TRANSPORT_REQUEST_TRANSPORT_DISCONNECTED_RULE: AuditRule =
  noTransportRequestSurfaceRule(
    "AUDIT-209",
    "TransportRequest is disconnected from Transport execution",
    "TransportRequest may reference Transport identity contracts but may not consume adapters, selectors, or implementations.",
    ["AUDIT-208"],
    [
      /TransportAdapter/,
      /TransportResult/,
      /TransportExecution/,
      /selectTransport/,
      /resolveTransport\s*\(/,
      /executeTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

const TRANSPORT_REQUEST_BUILDER_FILES = [
  "builder.ts",
  "builder-errors.ts",
  "builder-validation.ts",
  "builder-support.ts",
].map((file) => `src/transport-request/${file}`);

function transportRequestBuilderRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...TRANSPORT_REQUEST_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noTransportRequestBuilderSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return transportRequestBuilderRule(
    id,
    title,
    description,
    dependsOn,
    (rule) => {
      const files = TRANSPORT_REQUEST_BUILDER_FILES.concat(
        "src/core/transport-request-builder.ts",
      );
      const violations = files.flatMap((path) =>
        patterns
          .filter((pattern) => pattern.test(transportRequestSource(path)))
          .map((pattern) => `${path}: ${pattern.source}`),
      );
      return violations.length === 0
        ? pass(rule, title + ".", files)
        : fail(
            rule,
            title + ".",
            violations,
            "Keep TransportRequestBuilder pure and disconnected from execution.",
          );
    },
  );
}

export const TRANSPORT_REQUEST_BUILDER_SINGLE_FACTORY_RULE: AuditRule =
  transportRequestBuilderRule(
    "AUDIT-210",
    "Single TransportRequestBuilder exists",
    "V11.2 must expose one builder module as the supported ProviderExecutionPlan to TransportRequest factory.",
    ["AUDIT-209"],
    (rule) => {
      const files = TRANSPORT_REQUEST_BUILDER_FILES.concat(
        "src/core/transport-request-builder.ts",
      );
      const missing = files.filter((path) => !existsSync(path));
      if (missing.length > 0) {
        return fail(
          rule,
          "TransportRequestBuilder module is incomplete.",
          missing,
          "Restore all V11.2 builder files.",
        );
      }
      return transportRequestContains(
        rule,
        "src/transport-request/builder.ts",
        [
          "TransportRequestBuilder",
          "TransportRequestBuilderResult",
          "TransportRequestBuilderError",
          "TransportRequestBuilderErrorCode",
          "TransportRequestBuilderValidation",
          "TransportRequestBuilderSummary",
          "export const buildTransportRequest",
        ],
        "Single TransportRequestBuilder exists.",
      );
    },
  );

export const TRANSPORT_REQUEST_BUILDER_PURE_RULE: AuditRule =
  transportRequestBuilderRule(
    "AUDIT-211",
    "TransportRequestBuilder is pure and deterministic",
    "The builder must validate references and return structured data without resolving registries or invoking adapters.",
    ["AUDIT-210"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/transport-request/builder-validation.ts",
        [
          "validateTransportRequestBuild",
          "builder_invalid_plan",
          "builder_invalid_authorization",
          "builder_invalid_mapping",
          "builder_invalid_intent",
          "builder_invalid_runtime_reference",
          "builder_invalid_transport_reference",
          "builder_invalid_capability_reference",
        ],
        "TransportRequestBuilder validation is pure and deterministic.",
      ),
  );

export const TRANSPORT_REQUEST_BUILDER_NO_RUNTIME_RULE: AuditRule =
  noTransportRequestBuilderSurfaceRule(
    "AUDIT-212",
    "TransportRequestBuilder has no Runtime dependency",
    "Builder code may reference Runtime identities through contracts only and must not consume RuntimeRequest or implementations.",
    ["AUDIT-211"],
    [
      /RuntimeRequest/,
      /RuntimeAdapter/,
      /RuntimeExecution/,
      /LocalProcessRuntime/,
      /resolveRuntime/,
      /executeRuntime/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const TRANSPORT_REQUEST_BUILDER_NO_TRANSPORT_RULE: AuditRule =
  noTransportRequestBuilderSurfaceRule(
    "AUDIT-213",
    "TransportRequestBuilder has no Transport dependency",
    "Builder code may reference Transport identity contracts only and must not consume adapters, selectors, results, or adapter requests.",
    ["AUDIT-212"],
    [
      /TransportAdapterRequest/,
      /TransportAdapter/,
      /TransportResult/,
      /TransportExecution/,
      /selectTransport/,
      /resolveTransport\s*\(/,
      /executeTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

export const TRANSPORT_REQUEST_BUILDER_NO_PROCESS_RULE: AuditRule =
  noTransportRequestBuilderSurfaceRule(
    "AUDIT-214",
    "TransportRequestBuilder has no process APIs",
    "Builder code may not import process APIs, read environment, touch filesystem, or access the network.",
    ["AUDIT-213"],
    [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /\bfetch\s*\(/,
      /node:(http|https|net|tls|fs)/,
      /readFileSync/,
      /readdirSync/,
      /realpathSync/,
    ],
  );

export const TRANSPORT_REQUEST_BUILDER_NO_COMMAND_RULE: AuditRule =
  noTransportRequestBuilderSurfaceRule(
    "AUDIT-215",
    "TransportRequestBuilder has no command fields",
    "Builder code may not create commands, arguments, binary paths, environments, credentials, or execution options.",
    ["AUDIT-214"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bargv\s*:/,
      /\bstdin\s*:/,
      /\bstdout\s*:/,
      /\bstderr\s*:/,
      /environment\s*:/,
      /credentials?\s*:/,
      /workingDirectory/,
      /\bcwd\s*:/,
      /timeoutMs/,
      /executablePath/,
      /binaryPath/,
      /LocalProcessCommand/,
      /LocalProcessExecutionPolicy/,
    ],
  );

export const TRANSPORT_REQUEST_BUILDER_NO_EXECUTION_RULE: AuditRule =
  noTransportRequestBuilderSurfaceRule(
    "AUDIT-216",
    "TransportRequestBuilder has no execution",
    "Builder code may not create adapter requests, dispatch requests, or cross the execution boundary.",
    ["AUDIT-215"],
    [
      /TransportAdapterRequest/,
      /createTransportAdapterRequest/,
      /executeTransport/,
      /executeProviderPlan/,
      /executeRuntime/,
      /\bdispatch\s*:/,
      /\bexecute\s*:/,
    ],
  );

export const TRANSPORT_REQUEST_BUILDER_IMMUTABLE_OUTPUT_RULE: AuditRule =
  transportRequestBuilderRule(
    "AUDIT-217",
    "TransportRequestBuilder returns immutable TransportRequest output",
    "The builder must recursively freeze the TransportRequest and preserve non-execution status.",
    ["AUDIT-216"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/transport-request/builder-support.ts",
        [
          "freezeTransportRequestValue",
          'status: "validation_required"',
          "active: false",
          "dispatchable: false",
          "executable: false",
          "validationRequired: true",
        ],
        "TransportRequestBuilder returns immutable TransportRequest output.",
      ),
  );

const EXECUTION_REVIEW_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "review.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/review/${file}`);

const EXECUTION_REVIEW_AUDIT_METADATA = {
  introducedIn: "V11.3",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function executionReviewRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...EXECUTION_REVIEW_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noExecutionReviewSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return executionReviewRule(id, title, description, dependsOn, (rule) => {
    const files = EXECUTION_REVIEW_FILES.concat("src/core/review.ts");
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep ExecutionReviewGate declarative and disconnected from execution.",
        );
  });
}

export const EXECUTION_REVIEW_GATE_SINGLE_RULE: AuditRule = executionReviewRule(
  "AUDIT-218",
  "Single ExecutionReviewGate exists",
  "V11.3 must expose one review gate module as the supported TransportRequest review mechanism.",
  ["AUDIT-217"],
  (rule) => {
    const files = EXECUTION_REVIEW_FILES.concat("src/core/review.ts");
    const missing = files.filter((path) => !existsSync(path));
    if (missing.length > 0) {
      return fail(
        rule,
        "ExecutionReviewGate module is incomplete.",
        missing,
        "Restore all V11.3 review files.",
      );
    }
    return transportRequestContains(
      rule,
      "src/review/review.ts",
      [
        "ExecutionReviewGate",
        "reviewTransportRequest",
        "ReviewedTransportRequest",
        "TransportRequest",
        "AuthorizationConfiguration",
      ],
      "Single ExecutionReviewGate exists.",
    );
  },
);

export const EXECUTION_REVIEW_GATE_PURE_RULE: AuditRule = executionReviewRule(
  "AUDIT-219",
  "ExecutionReviewGate is pure and deterministic",
  "The review gate must validate references and return structured data without resolving registries or invoking adapters.",
  ["AUDIT-218"],
  (rule) =>
    transportRequestContains(
      rule,
      "src/review/validation.ts",
      [
        "validateTransportReview",
        "review_missing",
        "review_required",
        "review_incomplete",
        "review_not_approved",
        "review_version_mismatch",
        "review_configuration_mismatch",
        "review_policy_mismatch",
      ],
      "ExecutionReviewGate validation is pure and deterministic.",
    ),
);

export const EXECUTION_REVIEW_GATE_NO_RUNTIME_RULE: AuditRule =
  noExecutionReviewSurfaceRule(
    "AUDIT-220",
    "ExecutionReviewGate has no Runtime dependency",
    "Review code may reference Runtime identities through contracts only and must not consume RuntimeRequest or implementations.",
    ["AUDIT-219"],
    [
      /RuntimeRequest/,
      /RuntimeAdapter/,
      /RuntimeExecution/,
      /LocalProcessRuntime/,
      /resolveRuntime/,
      /executeRuntime/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const EXECUTION_REVIEW_GATE_NO_TRANSPORT_RULE: AuditRule =
  noExecutionReviewSurfaceRule(
    "AUDIT-221",
    "ExecutionReviewGate has no Transport dependency",
    "Review code may reference Transport identity contracts only and must not consume adapters, selectors, results, or adapter requests.",
    ["AUDIT-220"],
    [
      /TransportAdapterRequest/,
      /TransportAdapter/,
      /TransportResult/,
      /TransportExecution/,
      /selectTransport/,
      /resolveTransport\s*\(/,
      /executeTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

export const EXECUTION_REVIEW_GATE_NO_PROCESS_RULE: AuditRule =
  noExecutionReviewSurfaceRule(
    "AUDIT-222",
    "ExecutionReviewGate has no process APIs",
    "Review code may not import process APIs, read environment, touch filesystem, or access the network.",
    ["AUDIT-221"],
    [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /\bfetch\s*\(/,
      /node:(http|https|net|tls|fs)/,
      /readFileSync/,
      /readdirSync/,
      /realpathSync/,
    ],
  );

export const EXECUTION_REVIEW_GATE_NO_COMMAND_RULE: AuditRule =
  noExecutionReviewSurfaceRule(
    "AUDIT-223",
    "ExecutionReviewGate has no commands",
    "Review code may not create commands, arguments, binary paths, environments, credentials, or execution options.",
    ["AUDIT-222"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bargv\s*:/,
      /\bstdin\s*:/,
      /\bstdout\s*:/,
      /\bstderr\s*:/,
      /environment\s*:/,
      /credentials?\s*:/,
      /workingDirectory/,
      /\bcwd\s*:/,
      /timeoutMs/,
      /executablePath/,
      /binaryPath/,
      /LocalProcessCommand/,
      /LocalProcessExecutionPolicy/,
    ],
  );

export const EXECUTION_REVIEW_GATE_NO_EXECUTION_RULE: AuditRule =
  noExecutionReviewSurfaceRule(
    "AUDIT-224",
    "ExecutionReviewGate has no execution",
    "Review code may not create adapter requests, dispatch requests, or cross the execution boundary.",
    ["AUDIT-223"],
    [
      /TransportAdapterRequest/,
      /createTransportAdapterRequest/,
      /RuntimeRequest/,
      /executeTransport/,
      /executeProviderPlan/,
      /executeRuntime/,
      /\bdispatch\s*:/,
      /\bexecute\s*:/,
    ],
  );

export const EXECUTION_REVIEW_GATE_IMMUTABLE_OUTPUT_RULE: AuditRule =
  executionReviewRule(
    "AUDIT-225",
    "ExecutionReviewGate produces immutable ReviewedTransportRequest output",
    "The review gate must recursively freeze ReviewedTransportRequest and preserve non-execution status.",
    ["AUDIT-224"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/review/support.ts",
        [
          "freezeReviewValue",
          'status: "not_approved"',
          "approved: false",
          "dispatchable: false",
          "executable: false",
          "handoffAllowed: false",
        ],
        "ExecutionReviewGate produces immutable ReviewedTransportRequest output.",
      ),
  );

const APPROVAL_PROVENANCE_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "provenance.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/provenance/${file}`);

const APPROVAL_PROVENANCE_AUDIT_METADATA = {
  introducedIn: "V11.4",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function approvalProvenanceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...APPROVAL_PROVENANCE_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noApprovalProvenanceSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return approvalProvenanceRule(id, title, description, dependsOn, (rule) => {
    const files = APPROVAL_PROVENANCE_FILES.concat("src/core/provenance.ts");
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep ApprovalProvenance descriptive and disconnected from execution.",
        );
  });
}

export const APPROVAL_PROVENANCE_MODULE_RULE: AuditRule =
  approvalProvenanceRule(
    "AUDIT-226",
    "ApprovalProvenance module exists",
    "V11.4 must expose immutable approval provenance contracts and Core integration.",
    ["AUDIT-225"],
    (rule) => {
      const files = APPROVAL_PROVENANCE_FILES.concat("src/core/provenance.ts");
      const missing = files.filter((path) => !existsSync(path));
      if (missing.length > 0) {
        return fail(
          rule,
          "ApprovalProvenance module is incomplete.",
          missing,
          "Restore all V11.4 provenance files.",
        );
      }
      return pass(rule, "ApprovalProvenance module exists.", files);
    },
  );

export const APPROVAL_PROVENANCE_IMMUTABLE_CONTRACT_RULE: AuditRule =
  approvalProvenanceRule(
    "AUDIT-227",
    "ApprovalProvenance contracts are immutable",
    "ApprovalProvenance must expose stable readonly contracts for evidence, scope, versions, summary, validation, result, and errors.",
    ["AUDIT-226"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/provenance/types.ts",
        [
          "ApprovalProvenanceId",
          "ApprovalProvenance",
          "ApprovalProvenanceStatus",
          "ApprovalProvenanceMetadata",
          "ApprovalEvidence",
          "ApprovalScope",
          "ApprovalVersionSet",
          "ApprovalSummary",
          "ApprovalValidation",
          "ApprovalResult",
          "ApprovalError",
          "ApprovalErrorCode",
          "Readonly",
          "executionStarted: false",
        ],
        "ApprovalProvenance contracts are immutable.",
      ),
  );

export const APPROVAL_PROVENANCE_NO_EXECUTION_RULE: AuditRule =
  noApprovalProvenanceSurfaceRule(
    "AUDIT-228",
    "ApprovalProvenance has no execution",
    "Approval provenance may not create adapter requests, runtime requests, dispatch payloads, or executable metadata.",
    ["AUDIT-227"],
    [
      /TransportAdapterRequest/,
      /createTransportAdapterRequest/,
      /RuntimeRequest/,
      /executeTransport/,
      /executeProviderPlan/,
      /executeRuntime/,
      /\bdispatch\s*:/,
      /\bexecute\s*:/,
    ],
  );

export const APPROVAL_PROVENANCE_NO_PROCESS_RULE: AuditRule =
  noApprovalProvenanceSurfaceRule(
    "AUDIT-229",
    "ApprovalProvenance has no process APIs",
    "Approval provenance may not import process APIs or read environment state.",
    ["AUDIT-228"],
    [
      /child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /LocalProcessRuntime/,
    ],
  );

export const APPROVAL_PROVENANCE_NO_COMMAND_RULE: AuditRule =
  noApprovalProvenanceSurfaceRule(
    "AUDIT-230",
    "ApprovalProvenance has no commands",
    "Approval provenance may not describe commands, arguments, binaries, credentials, or process options.",
    ["AUDIT-229"],
    [
      /\bcommand\s*:/,
      /\bargs\s*:/,
      /\bargv\s*:/,
      /\bstdin\s*:/,
      /\bstdout\s*:/,
      /\bstderr\s*:/,
      /environment\s*:/,
      /credentials?\s*:/,
      /workingDirectory/,
      /\bcwd\s*:/,
      /timeoutMs/,
      /executablePath/,
      /binaryPath/,
      /LocalProcessCommand/,
      /LocalProcessExecutionPolicy/,
    ],
  );

export const APPROVAL_PROVENANCE_NO_FILESYSTEM_RULE: AuditRule =
  noApprovalProvenanceSurfaceRule(
    "AUDIT-231",
    "ApprovalProvenance has no filesystem",
    "Approval provenance may not access files or perform discovery.",
    ["AUDIT-230"],
    [
      /node:fs/,
      /readFileSync/,
      /readdirSync/,
      /realpathSync/,
      /existsSync/,
      /statSync/,
    ],
  );

export const APPROVAL_PROVENANCE_NO_NETWORK_RULE: AuditRule =
  noApprovalProvenanceSurfaceRule(
    "AUDIT-232",
    "ApprovalProvenance has no network",
    "Approval provenance may not access network APIs.",
    ["AUDIT-231"],
    [/\bfetch\s*\(/, /node:(http|https|net|tls)/],
  );

export const APPROVAL_PROVENANCE_REFERENCE_ONLY_RULE: AuditRule =
  approvalProvenanceRule(
    "AUDIT-233",
    "ApprovalProvenance is reference-only",
    "Approval provenance must remain pending, not approved, evidence-only, and tied to RFC version evidence.",
    ["AUDIT-232"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/provenance/support.ts",
        [
          "OpenClawApprovalProvenanceFixture",
          "reviewPending",
          "approved: false",
          "executionStarted: false",
          "rfc-execution-architecture-v11",
          "evidenceOnly",
        ],
        "ApprovalProvenance is reference-only.",
      ),
  );

const HANDOFF_ELIGIBILITY_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "evaluation.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/handoff-eligibility/${file}`);

const HANDOFF_ELIGIBILITY_AUDIT_METADATA = {
  introducedIn: "V11.5",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function handoffEligibilityRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...HANDOFF_ELIGIBILITY_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noHandoffEligibilitySurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return handoffEligibilityRule(id, title, description, dependsOn, (rule) => {
    const files = HANDOFF_ELIGIBILITY_FILES.concat(
      "src/core/handoff-eligibility.ts",
    );
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep HandoffEligibility declarative and disconnected from execution.",
        );
  });
}

export const HANDOFF_ELIGIBILITY_MODULE_RULE: AuditRule =
  handoffEligibilityRule(
    "AUDIT-234",
    "HandoffEligibility module exists",
    "V11.5 must expose immutable handoff eligibility contracts and Core integration.",
    ["AUDIT-233"],
    (rule) => {
      const files = HANDOFF_ELIGIBILITY_FILES.concat(
        "src/core/handoff-eligibility.ts",
      );
      const missing = files.filter((path) => !existsSync(path));
      if (missing.length > 0) {
        return fail(
          rule,
          "HandoffEligibility module is incomplete.",
          missing,
          "Restore all V11.5 handoff eligibility files.",
        );
      }
      return pass(rule, "HandoffEligibility module exists.", files);
    },
  );

export const HANDOFF_ELIGIBILITY_SINGLE_EVALUATOR_RULE: AuditRule =
  handoffEligibilityRule(
    "AUDIT-235",
    "Single HandoffEligibilityEvaluator exists",
    "Handoff eligibility must be produced through one exported pure evaluator function.",
    ["AUDIT-234"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/handoff-eligibility/evaluation.ts",
        [
          "HandoffEligibilityEvaluator",
          "export const evaluateHandoffEligibility",
          "ReviewedTransportRequest",
          "ApprovalProvenance",
        ],
        "Single HandoffEligibilityEvaluator exists.",
      ),
  );

export const HANDOFF_ELIGIBILITY_PURE_RULE: AuditRule = handoffEligibilityRule(
  "AUDIT-236",
  "HandoffEligibilityEvaluator is pure",
  "The evaluator must validate declarative evidence and return structured results without classes, dependency injection, registries, or implementations.",
  ["AUDIT-235"],
  (rule) => {
    const source = transportRequestSource(
      "src/handoff-eligibility/evaluation.ts",
    );
    const violations = [
      /\bclass\s+/,
      /new\s+[A-Z]/,
      /registry/i,
      /selector/i,
    ].filter((pattern) => pattern.test(source));
    return violations.length === 0
      ? pass(rule, "HandoffEligibilityEvaluator is pure.", [
          "src/handoff-eligibility/evaluation.ts",
        ])
      : fail(
          rule,
          "HandoffEligibilityEvaluator has mutable or injectable shape.",
          violations.map((pattern) => pattern.source),
          "Keep evaluator as a deterministic function over explicit inputs.",
        );
  },
);

export const HANDOFF_ELIGIBILITY_IMMUTABLE_CONTRACT_RULE: AuditRule =
  handoffEligibilityRule(
    "AUDIT-237",
    "HandoffEligibility contracts are immutable",
    "Handoff eligibility must expose readonly contracts for requirements, evidence, validation, summary, result, and errors.",
    ["AUDIT-236"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/handoff-eligibility/types.ts",
        [
          "HandoffEligibilityId",
          "HandoffEligibility",
          "HandoffEligibilityStatus",
          "HandoffEligibilityDecision",
          "HandoffEligibilityReason",
          "HandoffEligibilityRequirement",
          "HandoffEligibilityEvidence",
          "HandoffEligibilityMetadata",
          "HandoffEligibilityValidation",
          "HandoffEligibilitySummary",
          "HandoffEligibilityResult",
          "HandoffEligibilityError",
          "HandoffEligibilityErrorCode",
          "HandoffEligibilityEvaluator",
          "Readonly",
          "executionStarted: false",
        ],
        "HandoffEligibility contracts are immutable.",
      ),
  );

export const HANDOFF_ELIGIBILITY_DEFAULT_DENY_RULE: AuditRule =
  handoffEligibilityRule(
    "AUDIT-238",
    "HandoffEligibility defaults to not_eligible",
    "Default eligibility must be pending, not eligible, not allowed, not dispatchable, and not executable.",
    ["AUDIT-237"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/handoff-eligibility/support.ts",
        [
          "OpenClawHandoffEligibilityFixture",
          'status: "pending"',
          'decision: "not_eligible"',
          "handoffAllowed: false",
          "dispatchable: false",
          "executable: false",
          "executionStarted: false",
        ],
        "HandoffEligibility defaults to not_eligible.",
      ),
  );

export const HANDOFF_ELIGIBILITY_NO_INFERRED_ELIGIBILITY_RULE: AuditRule =
  handoffEligibilityRule(
    "AUDIT-239",
    "HandoffEligibility is never inferred from missing evidence",
    "Missing or incomplete evidence must produce not_eligible or indeterminate, never eligible.",
    ["AUDIT-238"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/handoff-eligibility/support.ts",
        ["evidence_incomplete", "indeterminate", "unknown", "approval_absent"],
        "HandoffEligibility is never inferred from missing evidence.",
      ),
  );

export const HANDOFF_ELIGIBILITY_NO_RUNTIME_IMPL_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-240",
    "HandoffEligibility has no Runtime implementation dependency",
    "Handoff eligibility may reference reviewed runtime identity only and must not consume Runtime implementations.",
    ["AUDIT-239"],
    [
      /RuntimeRequest/,
      /RuntimeAdapter/,
      /LocalProcessRuntime/,
      /executeRuntime/,
      /resolveRuntime/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const HANDOFF_ELIGIBILITY_NO_TRANSPORT_IMPL_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-241",
    "HandoffEligibility has no Transport implementation dependency",
    "Handoff eligibility must not consume Transport adapters, selectors, results, or implementation modules.",
    ["AUDIT-240"],
    [
      /TransportAdapter/,
      /TransportResult/,
      /executeTransport/,
      /selectTransport/,
      /resolveTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

export const HANDOFF_ELIGIBILITY_NO_PROVIDER_IMPL_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-242",
    "HandoffEligibility has no Provider implementation dependency",
    "Handoff eligibility must not consume provider adapters or implementations.",
    ["AUDIT-241"],
    [
      /ProviderAdapter/,
      /executeProvider/,
      /prepareProvider/,
      /from\s+["'][^"']*\/providers\/(openclaw|claude-code|codex|registry|selector)/,
    ],
  );

export const HANDOFF_ELIGIBILITY_NO_ADAPTER_REQUEST_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-243",
    "HandoffEligibility creates no TransportAdapterRequest",
    "Handoff eligibility must not materialize adapter requests.",
    ["AUDIT-242"],
    [/TransportAdapterRequest/, /createTransportAdapterRequest/],
  );

export const HANDOFF_ELIGIBILITY_NO_RUNTIME_REQUEST_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-244",
    "HandoffEligibility creates no RuntimeRequest",
    "Handoff eligibility must not materialize runtime requests.",
    ["AUDIT-243"],
    [/RuntimeRequest/, /createRuntimeRequest/],
  );

export const HANDOFF_ELIGIBILITY_NO_PROCESS_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-245",
    "HandoffEligibility has no process APIs",
    "Handoff eligibility may not import process APIs or read environment state.",
    ["AUDIT-244"],
    [
      /child_process/,
      /node:child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
    ],
  );

export const HANDOFF_ELIGIBILITY_NO_COMMAND_ARGUMENT_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-246",
    "HandoffEligibility has no commands or arguments",
    "Handoff eligibility may not create commands, argument arrays, binaries, credentials, or execution options.",
    ["AUDIT-245"],
    [
      /\bcommand\s*:/,
      /\bcommands\s*:/,
      /\bargs\s*:/,
      /\barguments\s*:/,
      /\bargv\s*:/,
      /\bstdin\s*:/,
      /\bstdout\s*:/,
      /\bstderr\s*:/,
      /environment\s*:/,
      /credentials?\s*:/,
      /workingDirectory/,
      /\bcwd\s*:/,
      /timeoutMs/,
      /executablePath/,
      /binaryPath/,
    ],
  );

export const HANDOFF_ELIGIBILITY_NO_FILESYSTEM_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-247",
    "HandoffEligibility has no filesystem access",
    "Handoff eligibility may not read, write, or discover filesystem state.",
    ["AUDIT-246"],
    [
      /node:fs/,
      /readFileSync/,
      /writeFileSync/,
      /readdirSync/,
      /realpathSync/,
      /existsSync/,
      /statSync/,
    ],
  );

export const HANDOFF_ELIGIBILITY_NO_NETWORK_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-248",
    "HandoffEligibility has no network access",
    "Handoff eligibility may not access network APIs.",
    ["AUDIT-247"],
    [/\bfetch\s*\(/, /node:(http|https|net|tls)/],
  );

export const HANDOFF_ELIGIBILITY_NO_PROCESS_ENV_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-249",
    "HandoffEligibility has no process.env access",
    "Handoff eligibility may not read process environment variables.",
    ["AUDIT-248"],
    [/process\.env/],
  );

export const HANDOFF_ELIGIBILITY_NO_EXECUTION_DISPATCH_RULE: AuditRule =
  noHandoffEligibilitySurfaceRule(
    "AUDIT-250",
    "HandoffEligibility has no execution or dispatch",
    "Handoff eligibility must remain an assessment and must not execute, dispatch, or perform handoff.",
    ["AUDIT-249"],
    [
      /executeTransport/,
      /executeRuntime/,
      /executeProvider/,
      /\bexecute\s*:/,
      /\bdispatch\s*:/,
      /handoffAllowed:\s*true/,
      /dispatchable:\s*true/,
      /executable:\s*true/,
    ],
  );

const V11_CONSOLIDATION_FILES = [
  "src/transport-request/support.ts",
  "src/transport-request/errors.ts",
  "src/transport-request/builder-errors.ts",
  "src/review/support.ts",
  "src/review/errors.ts",
  "src/review/validation.ts",
  "src/provenance/support.ts",
  "src/provenance/errors.ts",
  "src/handoff-eligibility/support.ts",
  "src/handoff-eligibility/errors.ts",
  "src/review-architecture/shared.ts",
];

const V11_CONSOLIDATION_AUDIT_METADATA = {
  introducedIn: "V11.6",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function v11ConsolidationRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...V11_CONSOLIDATION_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

export const V11_CONSOLIDATION_SHARED_HELPERS_RULE: AuditRule =
  v11ConsolidationRule(
    "AUDIT-251",
    "V11 declarative layers share technical helpers",
    "TransportRequest, review, provenance, and eligibility modules should centralize duplicated immutable, metadata, diagnostic, validation, and summary mechanics.",
    ["AUDIT-250"],
    (rule) => {
      const source = transportRequestSource(
        "src/review-architecture/shared.ts",
      );
      const expectations = [
        "freezeReviewArchitectureValue",
        "readReviewArchitectureMetadataString",
        "reviewArchitectureMetadataVersionCompatible",
        "reviewArchitectureMetadataVersionMismatch",
        "countReviewArchitectureItems",
        "createReviewArchitectureError",
        "diagnosticFromReviewArchitectureError",
        "createReviewArchitectureValidation",
      ];
      const missing = expectations.filter((token) => !source.includes(token));
      const consumers = V11_CONSOLIDATION_FILES.filter(
        (path) =>
          path !== "src/review-architecture/shared.ts" &&
          !transportRequestSource(path).includes(
            "../review-architecture/shared.js",
          ),
      );
      const violations = missing
        .map((token) => `src/review-architecture/shared.ts -> ${token}`)
        .concat(consumers.map((path) => `${path} -> shared helper import`));
      return violations.length === 0
        ? pass(
            rule,
            "V11 declarative layers share technical helpers.",
            V11_CONSOLIDATION_FILES,
          )
        : fail(
            rule,
            "V11 declarative helper consolidation is incomplete.",
            violations,
            "Keep common immutable, metadata, diagnostic, validation, and summary mechanics in src/review-architecture/shared.ts.",
          );
    },
  );

export const V11_CONSOLIDATION_DEPENDENCY_DIRECTION_RULE: AuditRule =
  v11ConsolidationRule(
    "AUDIT-252",
    "V11 consolidation preserves dependency direction",
    "Consolidated review architecture helpers and declarative modules must not import CLI, LoopRunner, Runtime, Transport, or Provider implementations.",
    ["AUDIT-251"],
    (rule) => {
      const patterns = [
        /from\s+["'][^"']*\/cli/,
        /from\s+["'][^"']*\/commands\//,
        /from\s+["'][^"']*\/loop\//,
        /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
        /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
        /from\s+["'][^"']*\/providers\/(openclaw|claude-code|codex|registry|selector)/,
        /child_process/,
        /node:child_process/,
        /process\.env/,
      ];
      const violations = V11_CONSOLIDATION_FILES.flatMap((path) =>
        patterns
          .filter((pattern) => pattern.test(transportRequestSource(path)))
          .map((pattern) => `${path}: ${pattern.source}`),
      );
      return violations.length === 0
        ? pass(
            rule,
            "V11 consolidation preserves dependency direction.",
            V11_CONSOLIDATION_FILES,
          )
        : fail(
            rule,
            "V11 consolidation imports an upper layer or concrete implementation.",
            violations,
            "Keep consolidated helpers and declarative modules below Core and away from concrete Runtime, Transport, and Provider implementations.",
          );
    },
  );

export const V11_CONSOLIDATION_MODULE_ISOLATION_RULE: AuditRule =
  v11ConsolidationRule(
    "AUDIT-253",
    "V11 consolidation helper remains domain-neutral",
    "The shared review architecture helper must remain a technical module and must not absorb TransportRequest, review, provenance, or eligibility responsibilities.",
    ["AUDIT-252"],
    (rule) => {
      const shared = transportRequestSource(
        "src/review-architecture/shared.ts",
      );
      const forbidden = [
        /TransportRequest/,
        /ExecutionReview/,
        /ApprovalProvenance/,
        /HandoffEligibility/,
        /AuthorizationConfiguration/,
        /ProviderExecutionPlan/,
        /TransportAdapter/,
        /RuntimeAdapter/,
      ].filter((pattern) => pattern.test(shared));
      const docs = transportRequestSource(
        "docs/architecture/v11-consolidation.md",
      );
      const docTokens = [
        "Responsibility matrix",
        "Dependency matrix",
        "Validation matrix",
        "Ownership matrix",
        "Security boundary",
        "Execution boundary",
        "Review boundary",
      ];
      const missingDocs = docTokens.filter((token) => !docs.includes(token));
      const violations = forbidden
        .map(
          (pattern) => `src/review-architecture/shared.ts: ${pattern.source}`,
        )
        .concat(
          missingDocs.map(
            (token) => `docs/architecture/v11-consolidation.md -> ${token}`,
          ),
        );
      return violations.length === 0
        ? pass(rule, "V11 consolidation helper remains domain-neutral.", [
            "src/review-architecture/shared.ts",
            "docs/architecture/v11-consolidation.md",
          ])
        : fail(
            rule,
            "V11 consolidation helper absorbed domain responsibilities or docs are incomplete.",
            violations,
            "Keep shared helpers technical and document the V11 ownership boundaries.",
          );
    },
  );

const DISPATCH_DESCRIPTOR_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "descriptor.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/dispatch/${file}`);

const DISPATCH_DESCRIPTOR_AUDIT_METADATA = {
  introducedIn: "V12.1",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function dispatchDescriptorRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...DISPATCH_DESCRIPTOR_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noDispatchDescriptorSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return dispatchDescriptorRule(id, title, description, dependsOn, (rule) => {
    const files = DISPATCH_DESCRIPTOR_FILES.concat("src/core/dispatch.ts");
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep DispatchDescriptor transport-independent, declarative, and below the execution boundary.",
        );
  });
}

export const DISPATCH_DESCRIPTOR_MODULE_RULE: AuditRule =
  dispatchDescriptorRule(
    "AUDIT-254",
    "DispatchDescriptor module exists",
    "V12.1 must expose a dedicated dispatch descriptor module and Core integration point.",
    ["AUDIT-253"],
    (rule) => {
      const files = DISPATCH_DESCRIPTOR_FILES.concat("src/core/dispatch.ts");
      const missing = files.filter((path) => !existsSync(path));
      return missing.length === 0
        ? pass(rule, "DispatchDescriptor module exists.", files)
        : fail(
            rule,
            "DispatchDescriptor module files are missing.",
            missing,
            "Restore the V12.1 dispatch descriptor contracts and Core integration.",
          );
    },
  );

export const DISPATCH_DESCRIPTOR_IMMUTABLE_CONTRACT_RULE: AuditRule =
  dispatchDescriptorRule(
    "AUDIT-255",
    "DispatchDescriptor contracts are immutable",
    "DispatchDescriptor must expose readonly contracts for descriptor, evidence, validation, summary, result, errors, and builder.",
    ["AUDIT-254"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/dispatch/types.ts",
        [
          "DispatchDescriptorId",
          "DispatchDescriptor",
          "DispatchDescriptorStatus",
          "DispatchDescriptorMetadata",
          "DispatchDescriptorEvidence",
          "DispatchDescriptorValidation",
          "DispatchDescriptorSummary",
          "DispatchDescriptorResult",
          "DispatchDescriptorError",
          "DispatchDescriptorErrorCode",
          "DispatchDescriptorBuilder",
          "Readonly",
          "executionStarted: false",
        ],
        "DispatchDescriptor contracts are immutable.",
      ),
  );

export const DISPATCH_DESCRIPTOR_PURE_BUILDER_RULE: AuditRule =
  dispatchDescriptorRule(
    "AUDIT-256",
    "DispatchDescriptor builder is pure",
    "The descriptor builder must be a deterministic function over HandoffEligibilityResult and ExecutionAuthority only.",
    ["AUDIT-255"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/dispatch/descriptor.ts",
        [
          "DispatchDescriptorBuilder",
          "export const createDispatchDescriptor",
          "HandoffEligibilityResult",
          "ExecutionAuthority",
        ],
        "DispatchDescriptor builder is pure.",
      ),
  );

export const DISPATCH_DESCRIPTOR_NO_RUNTIME_RULE: AuditRule =
  noDispatchDescriptorSurfaceRule(
    "AUDIT-257",
    "DispatchDescriptor has no Runtime dependency",
    "DispatchDescriptor may reference reviewed runtime contract versions but must not consume Runtime implementations.",
    ["AUDIT-256"],
    [
      /RuntimeAdapter/,
      /LocalProcessRuntime/,
      /executeRuntime/,
      /resolveRuntime/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const DISPATCH_DESCRIPTOR_NO_TRANSPORT_RULE: AuditRule =
  noDispatchDescriptorSurfaceRule(
    "AUDIT-258",
    "DispatchDescriptor has no Transport dependency",
    "DispatchDescriptor must remain transport-independent and must not consume Transport adapters or implementations.",
    ["AUDIT-257"],
    [
      /TransportAdapter/,
      /TransportResult/,
      /executeTransport/,
      /selectTransport/,
      /resolveTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

export const DISPATCH_DESCRIPTOR_NO_TRANSPORT_ADAPTER_REQUEST_RULE: AuditRule =
  noDispatchDescriptorSurfaceRule(
    "AUDIT-259",
    "DispatchDescriptor creates no TransportAdapterRequest",
    "DispatchDescriptor must not materialize a transport adapter payload.",
    ["AUDIT-258"],
    [/TransportAdapterRequest/, /createTransportAdapterRequest/],
  );

export const DISPATCH_DESCRIPTOR_NO_RUNTIME_REQUEST_RULE: AuditRule =
  noDispatchDescriptorSurfaceRule(
    "AUDIT-260",
    "DispatchDescriptor creates no RuntimeRequest",
    "DispatchDescriptor must not materialize a runtime request.",
    ["AUDIT-259"],
    [/RuntimeRequest/, /createRuntimeRequest/],
  );

export const DISPATCH_DESCRIPTOR_NO_EXECUTION_RULE: AuditRule =
  noDispatchDescriptorSurfaceRule(
    "AUDIT-261",
    "DispatchDescriptor has no execution",
    "DispatchDescriptor must not execute, spawn processes, access process state, read filesystem state, or access the network.",
    ["AUDIT-260"],
    [
      /child_process/,
      /node:child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /node:fs/,
      /readFileSync/,
      /writeFileSync/,
      /\bfetch\s*\(/,
      /node:(http|https|net|tls)/,
    ],
  );

export const DISPATCH_DESCRIPTOR_NO_DISPATCH_RULE: AuditRule =
  noDispatchDescriptorSurfaceRule(
    "AUDIT-262",
    "DispatchDescriptor performs no dispatch",
    "DispatchDescriptor must remain non-dispatchable and must not cross the execution boundary.",
    ["AUDIT-261"],
    [
      /readyForBoundary:\s*true/,
      /dispatchable:\s*true/,
      /executable:\s*true/,
      /handoffAllowed:\s*true/,
      /executeTransport/,
      /executeRuntime/,
      /executeProvider/,
    ],
  );

const BOUNDARY_HANDOFF_FILES = [
  "types.ts",
  "errors.ts",
  "registry.ts",
  "selector.ts",
  "validation.ts",
  "handoff.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/boundary/${file}`);

const BOUNDARY_HANDOFF_AUDIT_METADATA = {
  introducedIn: "V12.3",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function boundaryHandoffRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...BOUNDARY_HANDOFF_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noBoundaryHandoffSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return boundaryHandoffRule(id, title, description, dependsOn, (rule) => {
    const files = BOUNDARY_HANDOFF_FILES.concat("src/core/boundary.ts");
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep BoundaryHandoff declarative, inert, and disconnected from executable layers.",
        );
  });
}

export const BOUNDARY_HANDOFF_MODULE_RULE: AuditRule = boundaryHandoffRule(
  "AUDIT-263",
  "BoundaryHandoff module exists",
  "V12.3 must expose a dedicated boundary handoff module and Core integration point.",
  ["AUDIT-262"],
  (rule) => {
    const files = BOUNDARY_HANDOFF_FILES.concat("src/core/boundary.ts");
    const missing = files.filter((path) => !existsSync(path));
    return missing.length === 0
      ? pass(rule, "BoundaryHandoff module exists.", files)
      : fail(
          rule,
          "BoundaryHandoff module files are missing.",
          missing,
          "Restore the V12.3 boundary handoff contracts and Core integration.",
        );
  },
);

export const BOUNDARY_HANDOFF_IMMUTABLE_CONTRACT_RULE: AuditRule =
  boundaryHandoffRule(
    "AUDIT-264",
    "BoundaryHandoff contracts are immutable",
    "BoundaryHandoff must expose readonly contracts for handoff, evidence, validation, summary, result, registry, selector, resolver, errors, and builder.",
    ["AUDIT-263"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/types.ts",
        [
          "BoundaryHandoffId",
          "BoundaryHandoff",
          "BoundaryHandoffStatus",
          "BoundaryHandoffMetadata",
          "BoundaryHandoffEvidence",
          "BoundaryHandoffValidation",
          "BoundaryHandoffSummary",
          "BoundaryHandoffResult",
          "BoundaryHandoffSelection",
          "BoundaryHandoffResolution",
          "BoundaryHandoffRegistry",
          "BoundaryHandoffBuilder",
          "BoundaryHandoffError",
          "BoundaryHandoffErrorCode",
          "Readonly",
          "executionStarted: false",
        ],
        "BoundaryHandoff contracts are immutable.",
      ),
  );

export const BOUNDARY_HANDOFF_PURE_BUILDER_RULE: AuditRule =
  boundaryHandoffRule(
    "AUDIT-265",
    "BoundaryHandoff builder is pure",
    "The boundary handoff builder must be a deterministic function over DispatchDescriptorResult only.",
    ["AUDIT-264"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/handoff.ts",
        [
          "BoundaryHandoffBuilder",
          "export const createBoundaryHandoff",
          "DispatchDescriptorResult",
        ],
        "BoundaryHandoff builder is pure.",
      ),
  );

export const BOUNDARY_HANDOFF_NO_RUNTIME_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-266",
    "BoundaryHandoff has no Runtime dependency",
    "BoundaryHandoff may reference reviewed runtime contract versions but must not consume Runtime implementations.",
    ["AUDIT-265"],
    [
      /RuntimeAdapter/,
      /LocalProcessRuntime/,
      /executeRuntime/,
      /resolveRuntime/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const BOUNDARY_HANDOFF_NO_TRANSPORT_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-267",
    "BoundaryHandoff has no Transport dependency",
    "BoundaryHandoff must not consume Transport adapters or implementations.",
    ["AUDIT-266"],
    [
      /TransportAdapter/,
      /TransportResult/,
      /executeTransport/,
      /selectTransport/,
      /resolveTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

export const BOUNDARY_HANDOFF_NO_RUNTIME_REQUEST_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-268",
    "BoundaryHandoff creates no RuntimeRequest",
    "BoundaryHandoff must not materialize a runtime request.",
    ["AUDIT-267"],
    [/RuntimeRequest/, /createRuntimeRequest/],
  );

export const BOUNDARY_HANDOFF_NO_TRANSPORT_REQUEST_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-269",
    "BoundaryHandoff creates no TransportRequest",
    "BoundaryHandoff must not materialize a transport request.",
    ["AUDIT-268"],
    [/TransportRequest/, /createTransportRequest/],
  );

export const BOUNDARY_HANDOFF_NO_ADAPTER_REQUEST_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-270",
    "BoundaryHandoff creates no TransportAdapterRequest",
    "BoundaryHandoff must not materialize an adapter request.",
    ["AUDIT-269"],
    [/TransportAdapterRequest/, /createTransportAdapterRequest/],
  );

export const BOUNDARY_HANDOFF_NO_EXECUTION_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-271",
    "BoundaryHandoff has no execution",
    "BoundaryHandoff must not execute, spawn processes, access process state, read filesystem state, or access the network.",
    ["AUDIT-270"],
    [
      /child_process/,
      /node:child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /node:fs/,
      /readFileSync/,
      /writeFileSync/,
      /\bfetch\s*\(/,
      /node:(http|https|net|tls)/,
    ],
  );

export const BOUNDARY_HANDOFF_NO_DISPATCH_RULE: AuditRule =
  noBoundaryHandoffSurfaceRule(
    "AUDIT-272",
    "BoundaryHandoff performs no dispatch",
    "BoundaryHandoff must remain not ready, not accepted, not dispatchable, and not executable.",
    ["AUDIT-271"],
    [
      /ready:\s*true/,
      /accepted:\s*true/,
      /dispatchable:\s*true/,
      /executable:\s*true/,
      /executeTransport/,
      /executeRuntime/,
      /executeProvider/,
    ],
  );

export const BOUNDARY_HANDOFF_DEFAULT_DENY_RULE: AuditRule =
  boundaryHandoffRule(
    "AUDIT-273",
    "BoundaryHandoff defaults to deny",
    "Every BoundaryHandoff must remain not ready, not accepted, not dispatchable, not executable, and execution-not-started.",
    ["AUDIT-272"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/support.ts",
        [
          "OpenClawBoundaryHandoffFixture",
          "ClaudeBoundaryHandoffFixture",
          "CodexBoundaryHandoffFixture",
          "ready: false",
          "accepted: false",
          "dispatchable: false",
          "executable: false",
          "executionStarted: false",
        ],
        "BoundaryHandoff defaults to deny.",
      ),
  );

const EXECUTION_BOUNDARY_RFC_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "evaluation.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/boundary/rfc/${file}`);

const EXECUTION_BOUNDARY_RFC_AUDIT_METADATA = {
  introducedIn: "V12.4",
  tags: ["architecture", "execution"] as const,
  stability: "stable" as const,
};

function executionBoundaryRfcRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title,
    description,
    metadata: { ...EXECUTION_BOUNDARY_RFC_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function noExecutionBoundaryRfcSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return executionBoundaryRfcRule(id, title, description, dependsOn, (rule) => {
    const files = EXECUTION_BOUNDARY_RFC_FILES.concat(
      "src/core/boundary-rfc.ts",
    );
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep ExecutionBoundaryRFC declarative, inert, and disconnected from executable layers.",
        );
  });
}

export const EXECUTION_BOUNDARY_RFC_MODULE_RULE: AuditRule =
  executionBoundaryRfcRule(
    "AUDIT-274",
    "ExecutionBoundaryRFC module exists",
    "V12.4 must expose a dedicated execution boundary RFC module and Core integration point.",
    ["AUDIT-273"],
    (rule) => {
      const files = EXECUTION_BOUNDARY_RFC_FILES.concat(
        "src/core/boundary-rfc.ts",
      );
      const missing = files.filter((path) => !existsSync(path));
      return missing.length === 0
        ? pass(rule, "ExecutionBoundaryRFC module exists.", files)
        : fail(
            rule,
            "ExecutionBoundaryRFC module files are missing.",
            missing,
            "Restore the V12.4 execution boundary RFC contracts and Core integration.",
          );
    },
  );

export const EXECUTION_BOUNDARY_RFC_IMMUTABLE_CONTRACT_RULE: AuditRule =
  executionBoundaryRfcRule(
    "AUDIT-275",
    "ExecutionBoundaryRFC contracts are immutable",
    "ExecutionBoundaryRFC must expose readonly contracts for invariants, requirements, constraints, evidence, validation, summary, result, evaluation, errors, and builder.",
    ["AUDIT-274"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/rfc/types.ts",
        [
          "ExecutionBoundaryId",
          "ExecutionBoundaryRFC",
          "ExecutionBoundaryInvariant",
          "ExecutionBoundaryRequirement",
          "ExecutionBoundaryConstraint",
          "ExecutionBoundaryValidation",
          "ExecutionBoundaryEvidence",
          "ExecutionBoundarySummary",
          "ExecutionBoundaryResult",
          "ExecutionBoundaryEvaluation",
          "ExecutionBoundaryStatus",
          "ExecutionBoundaryError",
          "ExecutionBoundaryErrorCode",
          "ExecutionBoundaryBuilder",
          "Readonly",
          "executionStarted: false",
        ],
        "ExecutionBoundaryRFC contracts are immutable.",
      ),
  );

export const EXECUTION_BOUNDARY_RFC_PURE_BUILDER_RULE: AuditRule =
  executionBoundaryRfcRule(
    "AUDIT-276",
    "ExecutionBoundaryRFC builder is pure",
    "The RFC builder must be a deterministic function over BoundaryHandoffResult only.",
    ["AUDIT-275"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/rfc/evaluation.ts",
        [
          "ExecutionBoundaryBuilder",
          "export const createExecutionBoundaryRFC",
          "BoundaryHandoffResult",
        ],
        "ExecutionBoundaryRFC builder is pure.",
      ),
  );

export const EXECUTION_BOUNDARY_RFC_DETERMINISTIC_VALIDATION_RULE: AuditRule =
  executionBoundaryRfcRule(
    "AUDIT-277",
    "ExecutionBoundaryRFC validation is deterministic",
    "Validation must inspect declarative handoff evidence and RFC invariants without side effects.",
    ["AUDIT-276"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/rfc/validation.ts",
        [
          "validateExecutionBoundaryInput",
          "validateExecutionBoundaryRFC",
          "boundary_invariant_failed",
          "boundary_evidence_missing",
          "boundary_not_ready",
        ],
        "ExecutionBoundaryRFC validation is deterministic.",
      ),
  );

export const EXECUTION_BOUNDARY_RFC_NO_RUNTIME_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-278",
    "ExecutionBoundaryRFC has no Runtime dependency",
    "ExecutionBoundaryRFC may reference runtime contract versions but must not consume Runtime implementations.",
    ["AUDIT-277"],
    [
      /RuntimeAdapter/,
      /LocalProcessRuntime/,
      /executeRuntime/,
      /resolveRuntime/,
      /from\s+["'][^"']*\/runtime\/(local-process|registry|selector)/,
    ],
  );

export const EXECUTION_BOUNDARY_RFC_NO_TRANSPORT_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-279",
    "ExecutionBoundaryRFC has no Transport dependency",
    "ExecutionBoundaryRFC may reference transport contract versions but must not consume Transport implementations.",
    ["AUDIT-278"],
    [
      /TransportAdapter/,
      /TransportResult/,
      /executeTransport/,
      /selectTransport/,
      /resolveTransport/,
      /from\s+["'][^"']*\/transports\/(local-process|registry|selector)/,
    ],
  );

export const EXECUTION_BOUNDARY_RFC_NO_RUNTIME_REQUEST_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-280",
    "ExecutionBoundaryRFC creates no RuntimeRequest",
    "ExecutionBoundaryRFC must not materialize a runtime request.",
    ["AUDIT-279"],
    [/RuntimeRequest/, /createRuntimeRequest/],
  );

export const EXECUTION_BOUNDARY_RFC_NO_TRANSPORT_REQUEST_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-281",
    "ExecutionBoundaryRFC creates no TransportRequest",
    "ExecutionBoundaryRFC must not materialize a transport request.",
    ["AUDIT-280"],
    [/TransportRequest/, /createTransportRequest/],
  );

export const EXECUTION_BOUNDARY_RFC_NO_ADAPTER_REQUEST_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-282",
    "ExecutionBoundaryRFC creates no TransportAdapterRequest",
    "ExecutionBoundaryRFC must not materialize an adapter request.",
    ["AUDIT-281"],
    [/TransportAdapterRequest/, /createTransportAdapterRequest/],
  );

export const EXECUTION_BOUNDARY_RFC_NO_EXECUTION_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-283",
    "ExecutionBoundaryRFC has no execution",
    "ExecutionBoundaryRFC must not execute, spawn processes, access process state, read filesystem state, or access the network.",
    ["AUDIT-282"],
    [
      /child_process/,
      /node:child_process/,
      /\bspawn\s*\(/,
      /\bexec(?:File|Sync)?\s*\(/,
      /\bfork\s*\(/,
      /process\.env/,
      /node:fs/,
      /readFileSync/,
      /writeFileSync/,
      /\bfetch\s*\(/,
      /node:(http|https|net|tls)/,
    ],
  );

export const EXECUTION_BOUNDARY_RFC_NO_DISPATCH_RULE: AuditRule =
  noExecutionBoundaryRfcSurfaceRule(
    "AUDIT-284",
    "ExecutionBoundaryRFC performs no dispatch",
    "ExecutionBoundaryRFC must keep the boundary unsatisfied, crossing denied, non-dispatchable, and non-executable.",
    ["AUDIT-283"],
    [
      /boundarySatisfied:\s*true/,
      /crossingAllowed:\s*true/,
      /dispatchable:\s*true/,
      /executable:\s*true/,
      /executeTransport/,
      /executeRuntime/,
      /executeProvider/,
    ],
  );

export const EXECUTION_BOUNDARY_RFC_INVARIANT_FAMILIES_RULE: AuditRule =
  executionBoundaryRfcRule(
    "AUDIT-285",
    "ExecutionBoundaryRFC invariant families are complete",
    "The RFC contract must model authority, eligibility, descriptor, boundary, evidence, policy, review, configuration, transport isolation, and runtime isolation invariants.",
    ["AUDIT-284"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/boundary/rfc/types.ts",
        [
          "authority",
          "eligibility",
          "descriptor",
          "boundary",
          "evidence",
          "policy",
          "review",
          "configuration",
          "transport_isolation",
          "runtime_isolation",
        ],
        "ExecutionBoundaryRFC invariant families are complete.",
      ),
  );

const EXECUTION_ARCHITECTURE_RFC_PATH =
  "docs/architecture/execution-architecture-rfc.md";

const EXECUTION_ARCHITECTURE_RFC_AUDIT_METADATA = {
  introducedIn: "V13.0",
  tags: ["architecture", "documentation", "execution"] as const,
  stability: "stable" as const,
};

function executionArchitectureRfcRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  dependsOn: readonly string[],
  expectedTokens: readonly string[],
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: { ...EXECUTION_ARCHITECTURE_RFC_AUDIT_METADATA, dependsOn },
    check: () => {
      if (!existsSync(EXECUTION_ARCHITECTURE_RFC_PATH)) {
        return fail(
          rule,
          "Execution architecture RFC is missing.",
          [EXECUTION_ARCHITECTURE_RFC_PATH],
          "Restore the V13.0 normative execution architecture RFC.",
        );
      }

      const content = readFileSync(EXECUTION_ARCHITECTURE_RFC_PATH, "utf8");
      const missing = expectedTokens.filter((token) => !content.includes(token));
      return missing.length === 0
        ? pass(rule, title + ".", expectedTokens)
        : fail(
            rule,
            title + " is incomplete.",
            missing,
            "Document the required V13.0 execution architecture RFC content.",
          );
    },
  };
  return rule;
}

export const EXECUTION_ARCHITECTURE_RFC_EXISTS_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-286",
    "architecture",
    "Execution architecture RFC exists",
    "V13.0 must publish the normative execution architecture RFC.",
    ["AUDIT-285"],
    ["# Execution Architecture RFC", "## Status and normative language"],
  );

export const EXECUTION_ARCHITECTURE_RFC_LAYERS_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-287",
    "docs",
    "Execution architecture RFC documents all layers",
    "The RFC must describe every implemented declarative layer and every future execution layer.",
    ["AUDIT-286"],
    [
      "Eligibility",
      "ExecutionAuthority",
      "DispatchDescriptor",
      "BoundaryHandoff",
      "ExecutionBoundaryRFC",
      "Future Bridge",
      "Future Runtime",
      "Future Transport",
    ],
  );

export const EXECUTION_ARCHITECTURE_RFC_RESPONSIBILITY_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-288",
    "architecture",
    "Execution architecture RFC defines responsibility and ownership",
    "The RFC must define responsibility and ownership matrices for every layer.",
    ["AUDIT-287"],
    [
      "## 2. Responsibility matrix",
      "## 3. Ownership",
      "Inputs",
      "Outputs",
      "Allowed dependencies",
      "Forbidden dependencies",
    ],
  );

export const EXECUTION_ARCHITECTURE_RFC_BOUNDARY_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-289",
    "architecture",
    "Execution architecture RFC defines the execution boundary",
    "The RFC must identify what may cross the future boundary and who owns and validates that crossing.",
    ["AUDIT-288"],
    [
      "## 4. Execution boundary",
      "MAY cross",
      "MUST NOT cross",
      "future Bridge owns the crossing",
      "Core MUST validate the crossing",
    ],
  );

export const EXECUTION_ARCHITECTURE_RFC_STATE_MACHINE_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-290",
    "docs",
    "Execution architecture RFC defines the state machine",
    "The RFC must document declarative, future operational, rejected, and cancelled lifecycle states.",
    ["AUDIT-289"],
    [
      "## 5. State machine",
      "Declared",
      "Validated",
      "Approved",
      "BoundaryReady",
      "Crossed",
      "Executed",
      "Completed",
      "Rejected",
      "Cancelled",
    ],
  );

export const EXECUTION_ARCHITECTURE_RFC_INVARIANTS_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-291",
    "architecture",
    "Execution architecture RFC catalogues invariants",
    "The RFC must classify the V10 through V12.4 invariants by layer.",
    ["AUDIT-290"],
    [
      "## 6. Invariant catalogue",
      "Provider, mapping and intent",
      "Policy and authorization",
      "Transport request and review",
      "Provenance and eligibility",
      "Boundary RFC",
    ],
  );

export const EXECUTION_ARCHITECTURE_RFC_THREAT_SECURITY_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-292",
    "docs",
    "Execution architecture RFC defines threat and security models",
    "The RFC must document the threat model and default-deny security model.",
    ["AUDIT-291"],
    [
      "## 7. Threat model",
      "Accidental execution",
      "Privilege escalation",
      "Runtime bypass",
      "Transport bypass",
      "Provider bypass",
      "Descriptor forgery",
      "Authority forgery",
      "Boundary forgery",
      "Review bypass",
      "## 8. Security model",
      "default-deny",
    ],
  );

export const EXECUTION_ARCHITECTURE_RFC_ROADMAP_NON_GOALS_RULE: AuditRule =
  executionArchitectureRfcRule(
    "AUDIT-293",
    "docs",
    "Execution architecture RFC documents roadmap and non-goals",
    "The RFC must separate delivered architecture, future RFC work, future implementation, and explicit non-goals.",
    ["AUDIT-292"],
    [
      "## 9. Operational roadmap",
      "Already implemented",
      "Future RFC",
      "Future implementation",
      "## 10. Explicit non-goals",
      "`RuntimeRequest`",
      "`TransportRequest`",
      "execution;",
      "a Bridge;",
      "adapter payloads;",
      "provider invocation;",
    ],
  );

const OPERATOR_APPROVAL_RFC_DOCUMENT_PATH =
  "docs/architecture/operator-approval-rfc.md";

const OPERATOR_APPROVAL_RFC_FILES = [
  "types.ts",
  "errors.ts",
  "validation.ts",
  "evaluation.ts",
  "support.ts",
  "index.ts",
].map((file) => `src/authority/rfc/${file}`);

const OPERATOR_APPROVAL_RFC_AUDIT_METADATA = {
  introducedIn: "V13.1",
  tags: ["architecture", "documentation", "execution"] as const,
  stability: "stable" as const,
};

function operatorApprovalRfcRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  dependsOn: readonly string[],
  check: (rule: AuditRule) => ReturnType<typeof pass>,
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: { ...OPERATOR_APPROVAL_RFC_AUDIT_METADATA, dependsOn },
    check: () => check(rule),
  };
  return rule;
}

function operatorApprovalRfcDocumentRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  dependsOn: readonly string[],
  expectedTokens: readonly string[],
): AuditRule {
  return operatorApprovalRfcRule(id, category, title, description, dependsOn, (rule) => {
    if (!existsSync(OPERATOR_APPROVAL_RFC_DOCUMENT_PATH)) {
      return fail(
        rule,
        "Operator approval RFC is missing.",
        [OPERATOR_APPROVAL_RFC_DOCUMENT_PATH],
        "Restore the V13.1 operator approval RFC.",
      );
    }
    const content = readFileSync(OPERATOR_APPROVAL_RFC_DOCUMENT_PATH, "utf8");
    const missing = expectedTokens.filter((token) => !content.includes(token));
    return missing.length === 0
      ? pass(rule, title + ".", expectedTokens)
      : fail(
          rule,
          title + " is incomplete.",
          missing,
          "Document the required V13.1 operator approval RFC content.",
        );
  });
}

function noOperatorApprovalRfcSurfaceRule(
  id: string,
  title: string,
  description: string,
  dependsOn: readonly string[],
  patterns: readonly RegExp[],
): AuditRule {
  return operatorApprovalRfcRule(id, "architecture", title, description, dependsOn, (rule) => {
    const files = OPERATOR_APPROVAL_RFC_FILES.concat("src/core/operator-approval.ts");
    const violations = files.flatMap((path) =>
      patterns
        .filter((pattern) => pattern.test(transportRequestSource(path)))
        .map((pattern) => `${path}: ${pattern.source}`),
    );
    return violations.length === 0
      ? pass(rule, title + ".", files)
      : fail(
          rule,
          title + ".",
          violations,
          "Keep OperatorApprovalRFC declarative and isolated from operational layers.",
        );
  });
}

export const OPERATOR_APPROVAL_RFC_MODULE_RULE: AuditRule =
  operatorApprovalRfcRule(
    "AUDIT-294",
    "architecture",
    "OperatorApprovalRFC module exists",
    "V13.1 must expose the operator approval RFC contracts and Core integration point.",
    ["AUDIT-293"],
    (rule) => {
      const files = OPERATOR_APPROVAL_RFC_FILES.concat("src/core/operator-approval.ts");
      const missing = files.filter((path) => !existsSync(path));
      return missing.length === 0
        ? pass(rule, "OperatorApprovalRFC module exists.", files)
        : fail(rule, "OperatorApprovalRFC module files are missing.", missing, "Restore the V13.1 operator approval RFC contracts.");
    },
  );

export const OPERATOR_APPROVAL_RFC_LIFECYCLE_RULE: AuditRule =
  operatorApprovalRfcDocumentRule(
    "AUDIT-295",
    "docs",
    "Operator approval RFC documents the lifecycle",
    "The RFC must document every operator approval lifecycle state and transition.",
    ["AUDIT-294"],
    ["## Lifecycle and state machine", "draft", "submitted", "under_review", "approved", "rejected", "expired", "revoked", "superseded"],
  );

export const OPERATOR_APPROVAL_RFC_STATE_MACHINE_RULE: AuditRule =
  operatorApprovalRfcRule(
    "AUDIT-296",
    "architecture",
    "Operator approval state machine is explicit",
    "OperatorApprovalRFC must expose stable states and validate explicit transitions.",
    ["AUDIT-295"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/authority/rfc/types.ts",
        ["OPERATOR_APPROVAL_STATES", "OperatorApprovalState", "draft", "submitted", "under_review", "approved", "rejected", "expired", "revoked", "superseded"],
        "Operator approval state machine is explicit.",
      ),
  );

export const OPERATOR_APPROVAL_RFC_REVIEW_MODEL_RULE: AuditRule =
  operatorApprovalRfcRule(
    "AUDIT-297",
    "architecture",
    "Operator approval review model is traceable",
    "The review contract must record reviewer, timestamp, scope, version, evidence, expiry policy, and revocation reason.",
    ["AUDIT-296"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/authority/rfc/types.ts",
        ["OperatorApprovalReview", "reviewerId", "reviewedAt", "approvalScope", "approvalVersion", "evidenceReferences", "expiryPolicy", "revocationReason"],
        "Operator approval review model is traceable.",
      ),
  );

export const OPERATOR_APPROVAL_RFC_VALIDATION_RULE: AuditRule =
  operatorApprovalRfcRule(
    "AUDIT-298",
    "architecture",
    "Operator approval validation is deterministic",
    "Validation must check evidence, scope, version, review completeness, transition, expiry, and revocation without side effects.",
    ["AUDIT-297"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/authority/rfc/validation.ts",
        ["validateOperatorApprovalInput", "validateOperatorApprovalRFC", "operator_approval_transition_invalid", "operator_approval_expired", "operator_approval_revoked"],
        "Operator approval validation is deterministic.",
      ),
  );

export const OPERATOR_APPROVAL_RFC_SECURITY_RULE: AuditRule =
  operatorApprovalRfcDocumentRule(
    "AUDIT-299",
    "docs",
    "Operator approval RFC documents security guarantees",
    "The RFC must document default deny, explicit approval, immutable evidence, review traceability, revocation traceability, and expiry enforcement.",
    ["AUDIT-298"],
    ["## Security guarantees", "default deny", "explicit approval", "immutable approvals", "review traceability", "revocation traceability", "expiry enforcement"],
  );

export const OPERATOR_APPROVAL_RFC_DEFAULT_DENY_RULE: AuditRule =
  operatorApprovalRfcRule(
    "AUDIT-300",
    "architecture",
    "Operator approval defaults to deny",
    "Every operator approval result must keep approval-derived execution disabled and not started.",
    ["AUDIT-299"],
    (rule) =>
      transportRequestContains(
        rule,
        "src/authority/rfc/types.ts",
        ["approved: boolean", "revoked: boolean", "expired: boolean", "executionAllowed: false", "executionStarted: false"],
        "Operator approval defaults to deny.",
      ),
  );

export const OPERATOR_APPROVAL_RFC_NO_EXECUTION_RULE: AuditRule =
  noOperatorApprovalRfcSurfaceRule(
    "AUDIT-301",
    "OperatorApprovalRFC has no execution surface",
    "OperatorApprovalRFC must not depend on runtime, transport, provider, process, filesystem, network, or operational request layers.",
    ["AUDIT-300"],
    [
      /RuntimeRequest/,
      /TransportRequest/,
      /TransportAdapterRequest/,
      /RuntimeAdapter/,
      /TransportAdapter/,
      /child_process|node:child_process/,
      /\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/,
      /process\.env/,
      /node:fs|readFileSync|writeFileSync/,
      /node:(http|https|net|tls)|\bfetch\s*\(/,
      /from\s+["'][^"']*\/(cli|commands|loop|runtime|transports|providers)\//,
    ],
  );

const AUTHORITY_VERIFICATION_RFC_DOCUMENT_PATH = "docs/architecture/authority-verification-rfc.md";
const AUTHORITY_VERIFICATION_RFC_FILES = ["types.ts", "errors.ts", "validation.ts", "evaluation.ts", "support.ts", "index.ts"].map((file) => `src/authority/verification/${file}`);
const AUTHORITY_VERIFICATION_RFC_AUDIT_METADATA = { introducedIn: "V13.2", tags: ["architecture", "documentation", "contract"] as const, stability: "stable" as const };
function authorityVerificationRfcRule(id: string, category: AuditRule["category"], title: string, description: string, dependsOn: readonly string[], check: (rule: AuditRule) => ReturnType<typeof pass>): AuditRule {
  const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { ...AUTHORITY_VERIFICATION_RFC_AUDIT_METADATA, dependsOn }, check: () => check(rule) }; return rule;
}
function authorityVerificationRfcDocumentRule(id: string, title: string, dependsOn: readonly string[], tokens: readonly string[]): AuditRule {
  return authorityVerificationRfcRule(id, "docs", title, "The authority verification RFC must document its declarative guarantees.", dependsOn, (rule) => {
    const content = existsSync(AUTHORITY_VERIFICATION_RFC_DOCUMENT_PATH) ? readFileSync(AUTHORITY_VERIFICATION_RFC_DOCUMENT_PATH, "utf8") : "";
    const missing = tokens.filter((token) => !content.includes(token));
    return missing.length === 0 ? pass(rule, title + ".", tokens) : fail(rule, title + ".", missing.length ? missing : [AUTHORITY_VERIFICATION_RFC_DOCUMENT_PATH], "Restore the required authority verification RFC documentation.");
  });
}
function noAuthorityVerificationRfcSurfaceRule(id: string, title: string, dependsOn: readonly string[]): AuditRule {
  return authorityVerificationRfcRule(id, "architecture", title, "Authority verification must remain isolated from every operational surface.", dependsOn, (rule) => {
    const files = AUTHORITY_VERIFICATION_RFC_FILES.concat("src/core/authority-verification.ts");
    const patterns = [/Date\.now|new Date\s*\(|performance\.now/, /RuntimeRequest|TransportRequest|TransportAdapterRequest/, /child_process|node:child_process|process\.env/, /node:fs|readFileSync|writeFileSync|node:(http|https|net|tls)|\bfetch\s*\(/, /\bspawn\s*\(|\bexec(?:File|Sync)?\s*\(|\bfork\s*\(/, /from\s+["'][^"']*\/(cli|commands|loop|runtime|transports|providers|boundary)\//];
    const violations = files.flatMap((path) => patterns.filter((pattern) => pattern.test(transportRequestSource(path))).map((pattern) => `${path}: ${pattern.source}`));
    return violations.length === 0 ? pass(rule, title + ".", files) : fail(rule, title + ".", violations, "Keep verification pure, declarative, and implementation-isolated.");
  });
}
export const AUTHORITY_VERIFICATION_RFC_MODULE_RULE: AuditRule = authorityVerificationRfcRule("AUDIT-302", "architecture", "Authority Verification RFC module exists", "V13.2 must expose verification contracts and the Core integration point.", ["AUDIT-301"], (rule) => { const files = AUTHORITY_VERIFICATION_RFC_FILES.concat("src/core/authority-verification.ts"); const missing = files.filter((path) => !existsSync(path)); return missing.length === 0 ? pass(rule, "Authority Verification RFC module exists.", files) : fail(rule, "Authority Verification RFC module files are missing.", missing, "Restore the V13.2 verification contracts."); });
export const AUTHORITY_VERIFICATION_RFC_DOCUMENT_RULE: AuditRule = authorityVerificationRfcDocumentRule("AUDIT-303", "Authority Verification RFC documents purpose, lifecycle, and default deny", ["AUDIT-302"], ["# Authority Verification RFC", "## 1. Purpose", "## 5. Lifecycle", "## 9. Default deny and security guarantees", "Verification is consistency assessment"]);
export const AUTHORITY_VERIFICATION_RFC_CONTRACT_RULE: AuditRule = authorityVerificationRfcRule("AUDIT-304", "architecture", "Authority verification contracts are immutable and deterministic", "Contracts must expose immutable verification state, context, subject, checks, evidence, result and denied execution flags.", ["AUDIT-303"], (rule) => transportRequestContains(rule, "src/authority/verification/types.ts", ["AuthorityVerificationRFC", "AuthorityVerificationContext", "AuthorityVerificationSubject", "AuthorityVerificationCheck", "AuthorityVerificationEvidence", "AuthorityVerificationResult", "executionAllowed: false", "executionStarted: false"], "Authority verification contracts are immutable and deterministic."));
export const AUTHORITY_VERIFICATION_RFC_CHECKS_RULE: AuditRule = authorityVerificationRfcRule("AUDIT-305", "architecture", "Authority verification evaluates complete governance checks", "Checks must cover authority, approval, scope, versions, references, capabilities, policy, evidence, validity, revocation and supersession.", ["AUDIT-304"], (rule) => transportRequestContains(rule, "src/authority/verification/evaluation.ts", ["authority_active", "approval_lifecycle_state", "approval_scope_consistent", "authority_version_consistent", "approval_version_consistent", "provider_consistent", "protocol_consistent", "mapping_consistent", "intent_consistent", "runtime_capability_consistent", "transport_capability_consistent", "policy_consistent", "evidence_complete", "valid_from_enforced", "expiry_enforced", "revocation_enforced", "supersession_enforced"], "Authority verification evaluates complete governance checks."));
export const AUTHORITY_VERIFICATION_RFC_TIME_RULE: AuditRule = authorityVerificationRfcRule("AUDIT-306", "architecture", "Authority verification uses explicit time only", "Verification must consume supplied time and never read an ambient clock.", ["AUDIT-305"], (rule) => transportRequestContains(rule, "src/authority/verification/types.ts", ["verificationAt: string", "validFrom?: string", "expiresAt?: string", "revokedAt?: string"], "Authority verification uses explicit time only."));
export const AUTHORITY_VERIFICATION_RFC_DIAGNOSTICS_RULE: AuditRule = authorityVerificationRfcRule("AUDIT-307", "architecture", "Authority verification emits safe deterministic diagnostics", "Errors must be stable, safe, and non-starting.", ["AUDIT-306"], (rule) => transportRequestContains(rule, "src/authority/verification/types.ts", ["AuthorityVerificationErrorCode", "verification_input_missing", "verification_unsupported", "executionAllowed: false", "executionStarted: false"], "Authority verification emits safe deterministic diagnostics."));
export const AUTHORITY_VERIFICATION_RFC_DEFAULT_DENY_RULE: AuditRule = authorityVerificationRfcDocumentRule("AUDIT-308", "Authority verification documents non-authorizing default deny", ["AUDIT-307"], ["not verified", "MUST NOT be considered authorization", "executionAllowed: false", "executionStarted: false"]);
export const AUTHORITY_VERIFICATION_RFC_NO_EXECUTION_RULE: AuditRule = noAuthorityVerificationRfcSurfaceRule("AUDIT-309", "Authority Verification RFC has no operational surface", ["AUDIT-308"]);

const AUTHORITY_LIFECYCLE_FILES = ["types.ts", "errors.ts", "validation.ts", "evaluation.ts", "support.ts", "index.ts"].map((file) => `src/authority/lifecycle/${file}`);
function authorityLifecycleRule(id: string, category: AuditRule["category"], title: string, tokens: readonly string[], file: string): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description: "V13.3 lifecycle RFC must remain declarative, deterministic, and default-denied.", metadata: { introducedIn: "V13.3", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: id === "AUDIT-310" ? ["AUDIT-309"] : [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const content = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !content.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required V13.3 lifecycle evidence.") : pass(rule, title + ".", tokens); } }; return rule; }
export const AUTHORITY_LIFECYCLE_RFC_MODULE_RULE: AuditRule = authorityLifecycleRule("AUDIT-310", "architecture", "Authority lifecycle module exists", ["AuthorityLifecycleId", "AuthorityLifecycleRFC"], "src/authority/lifecycle/types.ts");
export const AUTHORITY_LIFECYCLE_RFC_CONTRACT_RULE: AuditRule = authorityLifecycleRule("AUDIT-311", "architecture", "Authority lifecycle contracts are immutable and default denied", ["AuthorityLifecycleRFC", "AuthorityLifecycleEvent", "AuthorityLifecycleState", "executionAllowed: false", "executionStarted: false"], "src/authority/lifecycle/types.ts");
export const AUTHORITY_LIFECYCLE_RFC_EVALUATION_RULE: AuditRule = authorityLifecycleRule("AUDIT-312", "architecture", "Authority lifecycle evaluates expiry, revocation, supersession, replacement and active state", ["expired", "revoked", "superseded", "replaced", "not_yet_valid", "active"], "src/authority/lifecycle/evaluation.ts");
export const AUTHORITY_LIFECYCLE_RFC_DOCUMENT_RULE: AuditRule = authorityLifecycleRule("AUDIT-313", "docs", "Revocation and expiry RFC documents lifecycle semantics and security", ["Revocation & Expiry Lifecycle RFC", "Expiry is a time-based", "Revocation is an explicit", "`active` does not mean approved", "executionAllowed: false"], "docs/architecture/revocation-expiry-rfc.md");

function bridgeContractRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.4", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required V13.4 bridge contract invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const BRIDGE_CONTRACT_MODULE_RULE: AuditRule = bridgeContractRule("AUDIT-314", "architecture", "Bridge contract module exists", "Bridge Contract must expose declarative contracts and Core integration.", "src/bridge/contract/types.ts", ["BridgeContractRFC", "BridgeContractInput"]);
export const BRIDGE_CONTRACT_IMMUTABLE_RULE: AuditRule = bridgeContractRule("AUDIT-315", "architecture", "Bridge contract contracts are immutable and default denied", "Bridge Contract must retain denied execution flags.", "src/bridge/contract/types.ts", ["executionAllowed: false", "executionStarted: false"]);
export const BRIDGE_CONTRACT_VALIDATION_RULE: AuditRule = bridgeContractRule("AUDIT-316", "architecture", "Bridge contract validates governance consistency", "Bridge Contract must validate lifecycle, policy, references and evidence.", "src/bridge/contract/validation.ts", ["bridge_lifecycle_inactive", "bridge_reference_inconsistent", "bridge_evidence_incomplete"]);
export const BRIDGE_CONTRACT_TIME_RULE: AuditRule = bridgeContractRule("AUDIT-317", "architecture", "Bridge contract uses explicit time only", "Bridge Contract must require a supplied evaluation timestamp.", "src/bridge/contract/types.ts", ["evaluationAt: string"]);
export const BRIDGE_CONTRACT_DIAGNOSTICS_RULE: AuditRule = bridgeContractRule("AUDIT-318", "architecture", "Bridge contract emits deterministic diagnostics", "Bridge Contract diagnostics must be stable and safe.", "src/bridge/contract/types.ts", ["BridgeContractErrorCode", "bridge_not_eligible"]);
export const BRIDGE_CONTRACT_DOCUMENT_RULE: AuditRule = bridgeContractRule("AUDIT-319", "docs", "Bridge Contract RFC documents non-operational semantics", "The RFC must state that it cannot authorize or execute.", "docs/architecture/bridge-contract-rfc.md", ["not authorization", "not execution", "executionAllowed` remains false", "executionStarted` remains false"]);
export const BRIDGE_CONTRACT_NO_SURFACE_RULE: AuditRule = bridgeContractRule("AUDIT-320", "architecture", "Bridge Contract RFC has no executable surface", "The contract must not expose operational primitives.", "src/bridge/contract/evaluation.ts", ["non_operational", "Bridge contract never authorizes execution"]);

function bridgeRequestRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.5", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Bridge Request invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const BRIDGE_REQUEST_MODULE_RULE: AuditRule = bridgeRequestRule("AUDIT-321", "architecture", "Bridge Request module exists", "Bridge Request must expose declarative contracts.", "src/bridge/request/types.ts", ["BridgeRequestInput", "BridgeRequestResult"]);
export const BRIDGE_REQUEST_IMMUTABLE_RULE: AuditRule = bridgeRequestRule("AUDIT-322", "architecture", "Bridge Request contracts are immutable and default denied", "Bridge Request must preserve denied execution flags.", "src/bridge/request/types.ts", ["executionAllowed: false", "executionStarted: false"]);
export const BRIDGE_REQUEST_CONTRACT_RULE: AuditRule = bridgeRequestRule("AUDIT-323", "architecture", "Bridge Request requires eligible Bridge Contract", "Bridge Request must require explicit eligible contract evidence.", "src/bridge/request/validation.ts", ["bridge_request_contract_not_eligible"]);
export const BRIDGE_REQUEST_VALIDATION_RULE: AuditRule = bridgeRequestRule("AUDIT-324", "architecture", "Bridge Request validates governance consistency", "Bridge Request must validate lifecycle and governance references.", "src/bridge/request/validation.ts", ["bridge_request_lifecycle_inactive"]);
export const BRIDGE_REQUEST_TIME_RULE: AuditRule = bridgeRequestRule("AUDIT-325", "architecture", "Bridge Request uses explicit identifiers and time", "Bridge Request must use caller-supplied id and time.", "src/bridge/request/types.ts", ["createdAt: string", "id: BridgeRequestId"]);
export const BRIDGE_REQUEST_PAYLOAD_RULE: AuditRule = bridgeRequestRule("AUDIT-326", "architecture", "Bridge Request payload is inert", "Bridge Request payload must reject operational fields.", "src/bridge/request/validation.ts", ["bridge_request_payload_operational"]);
export const BRIDGE_REQUEST_DIAGNOSTICS_RULE: AuditRule = bridgeRequestRule("AUDIT-327", "architecture", "Bridge Request diagnostics are deterministic", "Bridge Request diagnostics must be safe and stable.", "src/bridge/request/types.ts", ["BridgeRequestErrorCode"]);
export const BRIDGE_REQUEST_DOCUMENT_RULE: AuditRule = bridgeRequestRule("AUDIT-328", "docs", "Bridge Request RFC documents non-authorizing semantics", "RFC must describe a non-operational default-deny request.", "docs/architecture/bridge-request-rfc.md", ["not authorization", "not execution", "executionAllowed` remains false"]);
export const BRIDGE_REQUEST_NO_SURFACE_RULE: AuditRule = bridgeRequestRule("AUDIT-329", "architecture", "Bridge Request RFC has no operational surface", "Bridge Request must not invoke operational layers.", "src/bridge/request/evaluation.ts", ["Bridge request never authorizes execution"]);

function executionBridgeRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.6", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Execution Bridge invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const EXECUTION_BRIDGE_MODULE_RULE: AuditRule = executionBridgeRule("AUDIT-330", "architecture", "Execution Bridge module exists", "Execution Bridge must expose declarative contracts.", "src/bridge/execution/types.ts", ["ExecutionBridgeInput", "ExecutionBridgeResult"]);
export const EXECUTION_BRIDGE_IMMUTABLE_RULE: AuditRule = executionBridgeRule("AUDIT-331", "architecture", "Execution Bridge contracts are immutable and default denied", "Execution Bridge must preserve denied execution flags.", "src/bridge/execution/types.ts", ["executionAllowed: false", "executionStarted: false"]);
export const EXECUTION_BRIDGE_REQUEST_RULE: AuditRule = executionBridgeRule("AUDIT-332", "architecture", "Execution Bridge requires valid Bridge Request", "Execution Bridge must require constructible Bridge Request evidence.", "src/bridge/execution/validation.ts", ["execution_bridge_request_not_constructible"]);
export const EXECUTION_BRIDGE_NON_OPERATIONAL_RULE: AuditRule = executionBridgeRule("AUDIT-333", "architecture", "Execution Bridge remains non-operational", "Execution Bridge must not authorize execution.", "src/bridge/execution/evaluation.ts", ["Execution Bridge never authorizes execution"]);
export const EXECUTION_BRIDGE_DIAGNOSTICS_RULE: AuditRule = executionBridgeRule("AUDIT-334", "architecture", "Execution Bridge diagnostics are deterministic", "Execution Bridge diagnostics must be stable and safe.", "src/bridge/execution/types.ts", ["ExecutionBridgeErrorCode"]);
export const EXECUTION_BRIDGE_TIME_RULE: AuditRule = executionBridgeRule("AUDIT-335", "architecture", "Execution Bridge uses explicit identifiers and time", "Execution Bridge must use caller-supplied identifiers and time.", "src/bridge/execution/types.ts", ["evaluatedAt: string", "id: string"]);
export const EXECUTION_BRIDGE_DOCUMENT_RULE: AuditRule = executionBridgeRule("AUDIT-336", "docs", "Execution Bridge RFC documents execution boundary semantics", "RFC must state the non-operational execution boundary.", "docs/architecture/execution-bridge-rfc.md", ["not authorization", "not execution", "executionAllowed` remains false"]);
export const EXECUTION_BRIDGE_NO_SURFACE_RULE: AuditRule = executionBridgeRule("AUDIT-337", "architecture", "Execution Bridge exposes no runtime transport or provider implementation", "Execution Bridge must remain implementation-neutral.", "src/bridge/execution/evaluation.ts", ["Execution Bridge never authorizes execution"]);

function runtimeRequestRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.7", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Runtime Request invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const RUNTIME_REQUEST_MODULE_RULE: AuditRule = runtimeRequestRule("AUDIT-338", "architecture", "Runtime Request module exists", "Runtime Request must expose declarative contracts.", "src/runtime/request/types.ts", ["RuntimeRequestInput", "RuntimeRequestResult"]);
export const RUNTIME_REQUEST_IMMUTABLE_RULE: AuditRule = runtimeRequestRule("AUDIT-339", "architecture", "Runtime Request contracts are immutable and default denied", "Runtime Request must preserve denied execution flags.", "src/runtime/request/types.ts", ["executionAllowed: false", "executionStarted: false"]);
export const RUNTIME_REQUEST_BRIDGE_RULE: AuditRule = runtimeRequestRule("AUDIT-340", "architecture", "Runtime Request requires valid Execution Bridge", "Runtime Request must require ready Execution Bridge evidence.", "src/runtime/request/validation.ts", ["runtime_request_bridge_invalid"]);
export const RUNTIME_REQUEST_NON_OPERATIONAL_RULE: AuditRule = runtimeRequestRule("AUDIT-341", "architecture", "Runtime Request remains non-operational", "Runtime Request must not authorize execution.", "src/runtime/request/evaluation.ts", ["Runtime Request never authorizes execution"]);
export const RUNTIME_REQUEST_DIAGNOSTICS_RULE: AuditRule = runtimeRequestRule("AUDIT-342", "architecture", "Runtime Request diagnostics are deterministic", "Runtime Request diagnostics must be stable and safe.", "src/runtime/request/types.ts", ["RuntimeRequestErrorCode"]);
export const RUNTIME_REQUEST_TIME_RULE: AuditRule = runtimeRequestRule("AUDIT-343", "architecture", "Runtime Request uses explicit identifiers and timestamps", "Runtime Request must use caller-supplied identifiers and timestamps.", "src/runtime/request/types.ts", ["createdAt: string", "id: string"]);
export const RUNTIME_REQUEST_DOCUMENT_RULE: AuditRule = runtimeRequestRule("AUDIT-344", "docs", "Runtime Request RFC documents runtime-request semantics", "RFC must state the non-operational runtime-neutral request semantics.", "docs/architecture/runtime-request-rfc.md", ["not runtime execution", "not a runtime adapter", "executionAllowed` remains false"]);
export const RUNTIME_REQUEST_NO_SURFACE_RULE: AuditRule = runtimeRequestRule("AUDIT-345", "architecture", "Runtime Request exposes no runtime implementation", "Runtime Request must remain implementation-neutral.", "src/runtime/request/evaluation.ts", ["Runtime Request never authorizes execution"]);

function runtimeResolutionRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.8", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Runtime Resolution invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const RUNTIME_RESOLUTION_MODULE_RULE: AuditRule = runtimeResolutionRule("AUDIT-346", "architecture", "Runtime Resolution module exists", "Runtime Resolution must expose declarative contracts.", "src/runtime/resolution/types.ts", ["RuntimeResolutionInput", "RuntimeResolutionResult"]);
export const RUNTIME_RESOLUTION_IMMUTABLE_RULE: AuditRule = runtimeResolutionRule("AUDIT-347", "architecture", "Runtime Resolution contracts are immutable and default denied", "Runtime Resolution must preserve denied execution flags.", "src/runtime/resolution/types.ts", ["executionAllowed: false", "executionStarted: false"]);
export const RUNTIME_RESOLUTION_REQUEST_RULE: AuditRule = runtimeResolutionRule("AUDIT-348", "architecture", "Runtime Resolution requires valid Runtime Request", "Runtime Resolution must require constructible Runtime Request evidence.", "src/runtime/resolution/validation.ts", ["runtime_resolution_request_invalid"]);
export const RUNTIME_RESOLUTION_NON_OPERATIONAL_RULE: AuditRule = runtimeResolutionRule("AUDIT-349", "architecture", "Runtime Resolution remains non-operational", "Runtime Resolution must not authorize execution.", "src/runtime/resolution/evaluation.ts", ["Runtime Resolution never authorizes execution"]);
export const RUNTIME_RESOLUTION_DIAGNOSTICS_RULE: AuditRule = runtimeResolutionRule("AUDIT-350", "architecture", "Runtime Resolution diagnostics are deterministic", "Runtime Resolution diagnostics must be stable and safe.", "src/runtime/resolution/types.ts", ["RuntimeResolutionErrorCode"]);
export const RUNTIME_RESOLUTION_TIME_RULE: AuditRule = runtimeResolutionRule("AUDIT-351", "architecture", "Runtime Resolution uses explicit identifiers and timestamps", "Runtime Resolution must use caller-supplied identifiers and timestamps.", "src/runtime/resolution/types.ts", ["resolvedAt: string", "id: string"]);
export const RUNTIME_RESOLUTION_DOCUMENT_RULE: AuditRule = runtimeResolutionRule("AUDIT-352", "docs", "Runtime Resolution RFC documents deterministic resolution semantics", "RFC must state deterministic, non-operational runtime-neutral resolution semantics.", "docs/architecture/runtime-resolution-rfc.md", ["deterministic", "not runtime implementation", "executionAllowed` remains false"]);
export const RUNTIME_RESOLUTION_NO_SURFACE_RULE: AuditRule = runtimeResolutionRule("AUDIT-353", "architecture", "Runtime Resolution exposes no runtime implementation or adapter", "Runtime Resolution must remain implementation-neutral.", "src/runtime/resolution/evaluation.ts", ["Runtime Resolution never authorizes execution"]);

function runtimeDescriptorRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.9", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Runtime Descriptor invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const RUNTIME_DESCRIPTOR_MODULE_RULE: AuditRule = runtimeDescriptorRule("AUDIT-354", "architecture", "Runtime Descriptor module exists", "Runtime Descriptor must expose declarative contracts.", "src/runtime/descriptor/types.ts", ["RuntimeDescriptorInput", "RuntimeDescriptorResult"]);
export const RUNTIME_DESCRIPTOR_IMMUTABLE_RULE: AuditRule = runtimeDescriptorRule("AUDIT-355", "architecture", "Runtime Descriptor contracts are immutable", "Runtime Descriptor must use immutable contracts.", "src/runtime/descriptor/support.ts", ["Object.freeze"]);
export const RUNTIME_DESCRIPTOR_METADATA_RULE: AuditRule = runtimeDescriptorRule("AUDIT-356", "architecture", "Runtime Descriptor exposes metadata only", "Runtime Descriptor must expose metadata-only fields.", "src/runtime/descriptor/types.ts", ["capabilityReferences", "compatibilityReferences", "supportedExecutionClasses"]);
export const RUNTIME_DESCRIPTOR_NON_OPERATIONAL_RULE: AuditRule = runtimeDescriptorRule("AUDIT-357", "architecture", "Runtime Descriptor remains non-operational", "Runtime Descriptor must not execute.", "src/runtime/descriptor/evaluation.ts", ["Runtime Descriptor is metadata only and never executes"]);
export const RUNTIME_DESCRIPTOR_DETERMINISM_RULE: AuditRule = runtimeDescriptorRule("AUDIT-358", "architecture", "Runtime Descriptor is deterministic", "Runtime Descriptor metadata ordering must be stable.", "src/runtime/descriptor/evaluation.ts", ["sort()"]);
export const RUNTIME_DESCRIPTOR_IDENTIFIERS_RULE: AuditRule = runtimeDescriptorRule("AUDIT-359", "architecture", "Runtime Descriptor uses explicit identifiers and versions", "Runtime Descriptor must require explicit id and version.", "src/runtime/descriptor/types.ts", ["id: string", "version: string"]);
export const RUNTIME_DESCRIPTOR_DOCUMENT_RULE: AuditRule = runtimeDescriptorRule("AUDIT-360", "docs", "Runtime Descriptor RFC documents metadata semantics", "RFC must state metadata-only non-operational semantics.", "docs/architecture/runtime-descriptor-rfc.md", ["metadata only", "not a runtime implementation"]);
export const RUNTIME_DESCRIPTOR_NO_SURFACE_RULE: AuditRule = runtimeDescriptorRule("AUDIT-361", "architecture", "Runtime Descriptor exposes no executable runtime implementation", "Runtime Descriptor must not expose execution primitives.", "src/runtime/descriptor/evaluation.ts", ["Runtime Descriptor is metadata only and never executes"]);

function runtimeRegistryRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.10", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Runtime Registry invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const RUNTIME_REGISTRY_MODULE_RULE: AuditRule = runtimeRegistryRule("AUDIT-362", "architecture", "Runtime Registry module exists", "Runtime Registry must expose declarative contracts.", "src/runtime/registry/types.ts", ["RuntimeRegistryInput", "RuntimeRegistryResult"]);
export const RUNTIME_REGISTRY_IMMUTABLE_RULE: AuditRule = runtimeRegistryRule("AUDIT-363", "architecture", "Runtime Registry is immutable", "Runtime Registry must freeze its collections.", "src/runtime/registry/support.ts", ["Object.freeze"]);
export const RUNTIME_REGISTRY_DESCRIPTOR_RULE: AuditRule = runtimeRegistryRule("AUDIT-364", "architecture", "Runtime Registry stores Runtime Descriptor metadata only", "Runtime Registry must store descriptor metadata only.", "src/runtime/registry/types.ts", ["RuntimeRegistryDescriptor", "capabilityReferences"]);
export const RUNTIME_REGISTRY_NON_OPERATIONAL_RULE: AuditRule = runtimeRegistryRule("AUDIT-365", "architecture", "Runtime Registry remains non-operational", "Runtime Registry must not execute.", "src/runtime/registry/evaluation.ts", ["Runtime Registry stores metadata only and never executes"]);
export const RUNTIME_REGISTRY_DETERMINISM_RULE: AuditRule = runtimeRegistryRule("AUDIT-366", "architecture", "Runtime Registry indexing is deterministic", "Runtime Registry indexing must use stable ordering.", "src/runtime/registry/evaluation.ts", ["sort((left, right) => left.id.localeCompare(right.id))"]);
export const RUNTIME_REGISTRY_IDENTIFIERS_RULE: AuditRule = runtimeRegistryRule("AUDIT-367", "architecture", "Runtime Registry uses explicit identifiers and versions", "Runtime Registry must require explicit id and version.", "src/runtime/registry/types.ts", ["id: string", "version: string"]);
export const RUNTIME_REGISTRY_DOCUMENT_RULE: AuditRule = runtimeRegistryRule("AUDIT-368", "docs", "Runtime Registry RFC documents registry semantics", "RFC must state metadata-only registry semantics.", "docs/architecture/runtime-registry-rfc.md", ["metadata only", "not runtime implementation"]);
export const RUNTIME_REGISTRY_NO_SURFACE_RULE: AuditRule = runtimeRegistryRule("AUDIT-369", "architecture", "Runtime Registry exposes no runtime implementation or adapter", "Runtime Registry must not expose runtime implementations.", "src/runtime/registry/evaluation.ts", ["Runtime Registry stores metadata only and never executes"]);

function runtimeCapabilityRule(id: string, category: AuditRule["category"], title: string, description: string, file: string, tokens: readonly string[]): AuditRule { const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.11", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(file) ? readFileSync(file, "utf8") : ""; const missing = tokens.filter((token) => !source.includes(token)); return missing.length ? fail(rule, title + ".", missing, "Restore the required Runtime Capability invariant.") : pass(rule, title + ".", tokens); } }; return rule; }
export const RUNTIME_CAPABILITY_MODULE_RULE: AuditRule = runtimeCapabilityRule("AUDIT-370", "architecture", "Runtime Capability module exists", "Runtime Capability must expose declarative contracts.", "src/runtime/capability/types.ts", ["RuntimeCapabilityInput", "RuntimeCapabilityResult"]);
export const RUNTIME_CAPABILITY_IMMUTABLE_RULE: AuditRule = runtimeCapabilityRule("AUDIT-371", "architecture", "Runtime Capability contracts are immutable", "Runtime Capability must freeze metadata.", "src/runtime/capability/support.ts", ["Object.freeze"]);
export const RUNTIME_CAPABILITY_METADATA_RULE: AuditRule = runtimeCapabilityRule("AUDIT-372", "architecture", "Runtime Capability contains metadata only", "Runtime Capability must expose metadata-only fields.", "src/runtime/capability/types.ts", ["supportedFeatures", "declaredConstraints", "compatibilityReferences"]);
export const RUNTIME_CAPABILITY_NON_OPERATIONAL_RULE: AuditRule = runtimeCapabilityRule("AUDIT-373", "architecture", "Runtime Capability remains non-operational", "Runtime Capability must not execute.", "src/runtime/capability/evaluation.ts", ["Runtime Capability is metadata only and never executes"]);
export const RUNTIME_CAPABILITY_DETERMINISM_RULE: AuditRule = runtimeCapabilityRule("AUDIT-374", "architecture", "Runtime Capability is deterministic", "Runtime Capability metadata ordering must be stable.", "src/runtime/capability/evaluation.ts", ["sort()"]);
export const RUNTIME_CAPABILITY_IDENTIFIERS_RULE: AuditRule = runtimeCapabilityRule("AUDIT-375", "architecture", "Runtime Capability uses explicit identifiers and versions", "Runtime Capability must require explicit id and version.", "src/runtime/capability/types.ts", ["id: string", "version: string"]);
export const RUNTIME_CAPABILITY_DOCUMENT_RULE: AuditRule = runtimeCapabilityRule("AUDIT-376", "docs", "Runtime Capability RFC documents capability semantics", "RFC must state metadata-only capability semantics.", "docs/architecture/runtime-capability-rfc.md", ["metadata only", "not runtime implementation"]);
export const RUNTIME_CAPABILITY_NO_SURFACE_RULE: AuditRule = runtimeCapabilityRule("AUDIT-377", "architecture", "Runtime Capability exposes no runtime implementation or adapter", "Runtime Capability must not expose runtime implementations.", "src/runtime/capability/evaluation.ts", ["Runtime Capability is metadata only and never executes"]);

export type RuntimeCapabilityReconciliationInvariant = Readonly<{ file: string; requiredTokens: readonly string[]; forbiddenTokens: readonly string[] }>;
export const RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS = {
  contracts: { file: "src/runtime/capability/types.ts", requiredTokens: ["RuntimeCapabilityInput", "RuntimeCapabilityRequirementInput", "RuntimeCapabilityCompatibilityResult"], forbiddenTokens: [] },
  evaluation: { file: "src/runtime/capability/evaluation.ts", requiredTokens: ["evaluateRuntimeCapabilityCompatibility", "missingFeatures", "unacceptedConstraints"], forbiddenTokens: ["Date.now", "Math.random", "randomUUID", "node:"] },
  selection: { file: "src/runtime/resolution/selection.ts", requiredTokens: ["selectRuntimeByCapabilities", "executionAllowed: false", "executionStarted: false"], forbiddenTokens: ["executeRuntime(", "from \"../types.js\"", "../providers/", "node:"] },
  coreExports: { file: "src/core/index.ts", requiredTokens: ["createRuntimeCapability", "evaluateRuntimeCapabilityCompatibility", "selectRuntimeByCapabilities", "createDeclarativeRuntimeRequest", "createDeclarativeRuntimeRegistry"], forbiddenTokens: [] },
  documentation: { file: "docs/architecture/runtime-capability-rfc.md", requiredTokens: ["Capability declaration", "Capability requirement", "Runtime selection", "AgentCapability"], forbiddenTokens: [] },
} as const satisfies Record<string, RuntimeCapabilityReconciliationInvariant>;

export function inspectRuntimeCapabilityReconciliationInvariant(source: string, invariant: RuntimeCapabilityReconciliationInvariant): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return { missing: invariant.requiredTokens.filter((token) => !sourceIncludesToken(source, token)), forbidden: invariant.forbiddenTokens.filter((token) => sourceIncludesToken(source, token)) };
}

function runtimeCapabilityReconciliationRule(id: string, category: AuditRule["category"], title: string, description: string, invariant: RuntimeCapabilityReconciliationInvariant): AuditRule {
  const rule: AuditRule = { id, category, severity: "error", title, description, metadata: { introducedIn: "V13.13", tags: ["architecture", "documentation", "contract"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] }, check: () => { const source = existsSync(invariant.file) ? readFileSync(invariant.file, "utf8") : ""; const result = inspectRuntimeCapabilityReconciliationInvariant(source, invariant); const details = [...result.missing.map((token) => `missing: ${token}`), ...result.forbidden.map((token) => `forbidden: ${token}`)]; return details.length ? fail(rule, `${title}.`, details, "Restore the Runtime Capability reconciliation boundary.") : pass(rule, `${title}.`, [invariant.file]); } };
  return rule;
}

export const RUNTIME_CAPABILITY_CONTRACT_SEPARATION_RULE: AuditRule = runtimeCapabilityReconciliationRule("AUDIT-378", "architecture", "Runtime Capability declarations and requirements are distinct", "Runtime Capability offers, requirements, and compatibility results must use explicit contracts.", RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.contracts);
export const RUNTIME_CAPABILITY_PURE_EVALUATION_RULE: AuditRule = runtimeCapabilityReconciliationRule("AUDIT-379", "architecture", "Runtime Capability compatibility evaluation is deterministic", "Compatibility evaluation must remain pure and free of implicit time, randomness, and platform APIs.", RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.evaluation);
export const RUNTIME_CAPABILITY_SELECTION_BOUNDARY_RULE: AuditRule = runtimeCapabilityReconciliationRule("AUDIT-380", "architecture", "Runtime Capability selection remains non-operational", "Capability-based runtime selection must not depend on adapters, providers, or execution.", RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.selection);
export const RUNTIME_CAPABILITY_CORE_EXPORT_RULE: AuditRule = runtimeCapabilityReconciliationRule("AUDIT-381", "architecture", "Core exports reconciled Runtime Capability contracts", "The Core facade must expose the reconciled capability and selection APIs.", RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.coreExports);
export const RUNTIME_CAPABILITY_RECONCILIATION_DOCUMENT_RULE: AuditRule = runtimeCapabilityReconciliationRule("AUDIT-382", "docs", "Runtime Capability RFC documents reconciled responsibilities", "The RFC must distinguish declarations, requirements, selection, execution, and agent capabilities.", RUNTIME_CAPABILITY_RECONCILIATION_INVARIANTS.documentation);

const STANDARD_TEST_DISCOVERY_GLOBS = [
  "tests/**/*.test.ts",
  "src/execution/*.test.ts",
  "src/execution/**/*.test.ts",
] as const;

export function inspectStandardTestDiscoveryScript(
  script: string,
): Readonly<{ missing: readonly string[]; duplicate: readonly string[] }> {
  const tokens = script.split(/\s+/).filter(Boolean);
  return {
    missing: STANDARD_TEST_DISCOVERY_GLOBS.filter(
      (glob) => !tokens.includes(glob),
    ),
    duplicate: STANDARD_TEST_DISCOVERY_GLOBS.filter(
      (glob) => tokens.filter((token) => token === glob).length > 1,
    ),
  };
}

function standardTestDiscoveryRule(id: string): AuditRule {
  const rule: AuditRule = {
    id,
    category: "architecture",
    severity: "error",
    title: "Standard test discovery includes execution suites",
    description:
      "The canonical pnpm test script must include both repository tests and src/execution suites exactly once.",
    metadata: {
      introducedIn: "V13.14",
      tags: ["architecture", "ci", "execution"],
      stability: "stable",
      dependsOn: ["AUDIT-382"],
    },
    check: () => {
      const packagePath = "package.json";

      if (!existsSync(packagePath)) {
        return fail(
          rule,
          "package.json is missing.",
          [packagePath],
          "Restore package.json so standard test discovery can be verified.",
        );
      }

      const content = readFileSync(packagePath, "utf8");
      let parsed: { readonly scripts?: { readonly test?: unknown } };
      try {
        parsed = JSON.parse(content) as {
          readonly scripts?: { readonly test?: unknown };
        };
      } catch {
        return fail(
          rule,
          "package.json cannot be parsed.",
          [packagePath],
          "Restore valid package.json so standard test discovery can be verified.",
        );
      }

      const script = parsed.scripts?.test;

      if (typeof script !== "string") {
        return fail(
          rule,
          "The standard test script is missing.",
          ["scripts.test"],
          "Restore scripts.test with the canonical test discovery globs.",
        );
      }

      const result = inspectStandardTestDiscoveryScript(script);
      const details = [
        ...result.missing.map((glob) => `missing: ${glob}`),
        ...result.duplicate.map((glob) => `duplicate: ${glob}`),
      ];

      return details.length === 0
        ? pass(
            rule,
            "Standard test discovery includes repository and execution suites.",
            STANDARD_TEST_DISCOVERY_GLOBS,
          )
        : fail(
            rule,
            "Standard test discovery is incomplete.",
            details,
            "Keep scripts.test as the single canonical test-discovery entry point for both tests/ and src/execution/.",
          );
    },
  };
  return rule;
}

export const STANDARD_TEST_DISCOVERY_INCLUDES_EXECUTION_RULE: AuditRule =
  standardTestDiscoveryRule("AUDIT-383");

export type DeclarativeRuntimeExecutionBridgeInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS = {
  module: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "resolveDeclarativeRuntimeExecution",
      "executeDeclarativeRuntime",
      "DeclarativeRuntimeExecutionBridgeInput",
      "DeclarativeRuntimeExecutionBridgeErrorCode",
    ],
    forbiddenTokens: [],
  },
  pureBoundary: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "selectRuntimeByCapabilities",
      "createRuntimeRequest",
      "resolveRuntime",
      "executeRuntime",
    ],
    forbiddenTokens: [
      "evaluateRuntimeCapabilityCompatibility",
      "adapter.execute",
      "from \"node:fs\"",
      "from \"node:child_process\"",
      "fetch(",
      "Date.now",
      "new Date",
      "Math.random",
      "process.env",
    ],
  },
  mapping: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "DeclarativeRuntimeExecutionMapping",
      "runtimeMapping",
      "descriptorId",
      "declarative_runtime_v10_mapping_missing",
    ],
    forbiddenTokens: ["instanceof", "constructor.name", "import("],
  },
  coreExports: {
    file: "src/core/index.ts",
    requiredTokens: ["./runtime-execution-bridge.js"],
    forbiddenTokens: [],
  },
  documentation: {
    file: "docs/architecture/runtime-abstraction.md",
    requiredTokens: [
      "V13.15",
      "resolveDeclarativeRuntimeExecution",
      "executeDeclarativeRuntime",
      "descriptorId -> RuntimeId",
      "opt-in",
    ],
    forbiddenTokens: [],
  },
} as const satisfies Record<
  string,
  DeclarativeRuntimeExecutionBridgeInvariant
>;

export function inspectDeclarativeRuntimeExecutionBridgeInvariant(
  source: string,
  invariant: DeclarativeRuntimeExecutionBridgeInvariant,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return {
    missing: invariant.requiredTokens.filter(
      (token) => !sourceIncludesToken(source, token),
    ),
    forbidden: invariant.forbiddenTokens.filter((token) =>
      sourceIncludesToken(source, token),
    ),
  };
}

function declarativeRuntimeExecutionBridgeRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  invariant: DeclarativeRuntimeExecutionBridgeInvariant,
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: {
      introducedIn: "V13.15",
      tags: ["architecture", "contract", "execution"],
      stability: "stable",
      dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`],
    },
    check: () => {
      const source = existsSync(invariant.file)
        ? readFileSync(invariant.file, "utf8")
        : "";
      const result = inspectDeclarativeRuntimeExecutionBridgeInvariant(
        source,
        invariant,
      );
      const details = [
        ...result.missing.map((token) => `missing: ${token}`),
        ...result.forbidden.map((token) => `forbidden: ${token}`),
      ];

      return details.length
        ? fail(
            rule,
            `${title}.`,
            details,
            "Restore the declarative runtime execution bridge boundary.",
          )
        : pass(rule, `${title}.`, [invariant.file]);
    },
  };
  return rule;
}

export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_MODULE_RULE: AuditRule =
  declarativeRuntimeExecutionBridgeRule(
    "AUDIT-384",
    "architecture",
    "Declarative Runtime execution bridge module exists",
    "V13.15 must expose a minimal Core bridge between declarative resolution and V10 execution.",
    DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.module,
  );
export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_BOUNDARY_RULE: AuditRule =
  declarativeRuntimeExecutionBridgeRule(
    "AUDIT-385",
    "architecture",
    "Declarative Runtime execution bridge composes public V13 and V10 APIs",
    "The bridge must use existing V13 selection and V10 runtime APIs without duplicating compatibility or adapter execution logic.",
    DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.pureBoundary,
  );
export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_MAPPING_RULE: AuditRule =
  declarativeRuntimeExecutionBridgeRule(
    "AUDIT-386",
    "architecture",
    "Declarative Runtime execution bridge uses explicit V10 mapping",
    "Descriptor to V10 runtime association must be explicit, deterministic, and testable.",
    DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.mapping,
  );
export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_CORE_EXPORT_RULE: AuditRule =
  declarativeRuntimeExecutionBridgeRule(
    "AUDIT-387",
    "architecture",
    "Core exports Declarative Runtime execution bridge",
    "The Core facade must expose the opt-in V13 to V10 bridge without changing existing V10 APIs.",
    DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.coreExports,
  );
export const DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_DOCUMENT_RULE: AuditRule =
  declarativeRuntimeExecutionBridgeRule(
    "AUDIT-388",
    "docs",
    "Runtime abstraction documents Declarative Runtime execution bridge",
    "Runtime abstraction documentation must distinguish V13 declarative selection, the opt-in bridge, and V10 execution.",
    DECLARATIVE_RUNTIME_EXECUTION_BRIDGE_INVARIANTS.documentation,
  );

export type RuntimeExecutionPolicyAdmissionInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS = {
  admission: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "evaluateRuntimeExecutionAdmission",
      "RuntimeExecutionAdmissionInput",
      "RuntimeExecutionAdmissionResult",
      "RuntimeExecutionAdmissionErrorCode",
      "RUNTIME_EXECUTION_ADMISSION_CHECKS",
    ],
    forbiddenTokens: [
      "from \"node:fs\"",
      "from \"node:child_process\"",
      "fetch(",
      "Date.now",
      "new Date",
      "Math.random",
      "process.env",
      "import(",
      "require(",
    ],
  },
  policyAwareBridge: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "resolvePolicyAwareDeclarativeRuntimeExecution",
      "executePolicyAwareDeclarativeRuntime",
      "evaluateRuntimeExecutionAdmission",
      "outcome: \"admission_denied\"",
      "runtimeRequest: null",
      "v10Resolution: null",
    ],
    forbiddenTokens: [],
  },
  policyReuse: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "AgentPolicyResolution",
      "compareAgentEffort",
      "mergeBudgetsRestrictively",
      "toBudget",
      "policy.requirements.allowedRuntimes",
      "policy.requirements.allowedProviders",
      "policy.requirements.executionBudget",
    ],
    forbiddenTokens: ["DEFAULT_AGENT_POLICY", "resolvePolicy("],
  },
  publicCompatibility: {
    file: "src/core/index.ts",
    requiredTokens: ["./runtime-execution-bridge.js"],
    forbiddenTokens: [],
  },
  documentation: {
    file: "docs/architecture/runtime-abstraction.md",
    requiredTokens: [
      "V13.16",
      "Execution policy admission",
      "policy explicitly supplied",
      "provider non vérifiable",
      "permissions",
      "opt-in",
    ],
    forbiddenTokens: [],
  },
} as const satisfies Record<
  string,
  RuntimeExecutionPolicyAdmissionInvariant
>;

export function inspectRuntimeExecutionPolicyAdmissionInvariant(
  source: string,
  invariant: RuntimeExecutionPolicyAdmissionInvariant,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return {
    missing: invariant.requiredTokens.filter(
      (token) => !sourceIncludesToken(source, token),
    ),
    forbidden: invariant.forbiddenTokens.filter((token) =>
      sourceIncludesToken(source, token),
    ),
  };
}

function runtimeExecutionPolicyAdmissionRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  invariant: RuntimeExecutionPolicyAdmissionInvariant,
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: {
      introducedIn: "V13.16",
      tags: ["architecture", "contract", "execution", "policy"],
      stability: "stable",
      dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`],
    },
    check: () => {
      const source = existsSync(invariant.file)
        ? readFileSync(invariant.file, "utf8")
        : "";
      const result = inspectRuntimeExecutionPolicyAdmissionInvariant(
        source,
        invariant,
      );
      const details = [
        ...result.missing.map((token) => `missing: ${token}`),
        ...result.forbidden.map((token) => `forbidden: ${token}`),
      ];

      return details.length
        ? fail(
            rule,
            `${title}.`,
            details,
            "Restore the V13.16 runtime execution policy admission boundary.",
          )
        : pass(rule, `${title}.`, [invariant.file]);
    },
  };
  return rule;
}

export const RUNTIME_EXECUTION_POLICY_ADMISSION_MODULE_RULE: AuditRule =
  runtimeExecutionPolicyAdmissionRule(
    "AUDIT-389",
    "architecture",
    "Runtime execution policy admission module exists",
    "V13.16 must expose a pure admission contract before V10 runtime resolution.",
    RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.admission,
  );
export const RUNTIME_EXECUTION_POLICY_ADMISSION_GATE_RULE: AuditRule =
  runtimeExecutionPolicyAdmissionRule(
    "AUDIT-390",
    "architecture",
    "Runtime execution policy admission gates the V10 bridge",
    "Policy-aware execution must stop before V10 request construction, resolution, or execution when admission is denied.",
    RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.policyAwareBridge,
  );
export const RUNTIME_EXECUTION_POLICY_ADMISSION_POLICY_REUSE_RULE: AuditRule =
  runtimeExecutionPolicyAdmissionRule(
    "AUDIT-391",
    "architecture",
    "Runtime execution policy admission reuses Policy contracts",
    "Admission must consume an explicit AgentPolicyResolution and existing Policy helpers instead of resolving defaults or duplicating restrictions.",
    RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.policyReuse,
  );
export const RUNTIME_EXECUTION_POLICY_ADMISSION_COMPAT_RULE: AuditRule =
  runtimeExecutionPolicyAdmissionRule(
    "AUDIT-392",
    "architecture",
    "Runtime execution policy admission preserves historical Core exports",
    "The policy-aware bridge must be additive and preserve V13.15 and V10 historical APIs.",
    RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.publicCompatibility,
  );
export const RUNTIME_EXECUTION_POLICY_ADMISSION_DOCUMENT_RULE: AuditRule =
  runtimeExecutionPolicyAdmissionRule(
    "AUDIT-393",
    "docs",
    "Runtime abstraction documents execution policy admission",
    "Runtime abstraction documentation must distinguish capability compatibility, policy admission, and V10 execution.",
    RUNTIME_EXECUTION_POLICY_ADMISSION_INVARIANTS.documentation,
  );

export type RuntimeExecutionPlanInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_EXECUTION_PLAN_INVARIANTS = {
  contract: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "RUNTIME_EXECUTION_PLAN_SCHEMA_VERSION",
      "RuntimeExecutionPlan",
      "schemaVersion: RuntimeExecutionPlanSchemaVersion",
      "createRuntimeExecutionPlan",
      "RuntimeExecutionPlanDryRunResult",
    ],
    forbiddenTokens: [],
  },
  pureData: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "findNonSerializableRuntimeExecutionPlanValue",
      "localProcessConfigured",
      "Map",
      "Set",
      "Promise",
      "undefined",
    ],
    forbiddenTokens: [
      "from \"node:fs\"",
      "from \"node:child_process\"",
      "fetch(",
      "Date.now",
      "new Date",
      "Math.random",
      "crypto.randomUUID",
      "process.env",
      "import(",
      "require(",
      "console.",
    ],
  },
  dryRun: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "dryRunPolicyAwareDeclarativeRuntimeExecution",
      "resolvePolicyAwareDeclarativeRuntimeExecution(input)",
      "createRuntimeExecutionPlan",
      "outcome: \"planned\"",
      "runtime_execution_plan_unserializable",
    ],
    forbiddenTokens: [],
  },
  adapterBoundary: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "v10Resolution: {",
      "runtimeId: v10Selection.adapter.runtimeId",
      "localProcessConfigured",
      "runtimeRequest.localProcess !== undefined",
    ],
    forbiddenTokens: [],
  },
  compatibility: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "resolveDeclarativeRuntimeExecution",
      "executeDeclarativeRuntime",
      "resolvePolicyAwareDeclarativeRuntimeExecution",
      "executePolicyAwareDeclarativeRuntime",
      "dryRunPolicyAwareDeclarativeRuntimeExecution",
    ],
    forbiddenTokens: [],
  },
  documentation: {
    file: "docs/architecture/runtime-abstraction.md",
    requiredTokens: [
      "V13.17",
      "Runtime Execution Plan",
      "dry-run",
      "schemaVersion: 1",
      "plan Runtime",
      "plan `LoopRunner`",
      "forgé",
      "n8n",
    ],
    forbiddenTokens: [],
  },
} as const satisfies Record<string, RuntimeExecutionPlanInvariant>;

export function inspectRuntimeExecutionPlanInvariant(
  source: string,
  invariant: RuntimeExecutionPlanInvariant,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return {
    missing: invariant.requiredTokens.filter(
      (token) => !sourceIncludesToken(source, token),
    ),
    forbidden: invariant.forbiddenTokens.filter((token) =>
      sourceIncludesToken(source, token),
    ),
  };
}

function runtimeExecutionPlanRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  invariant: RuntimeExecutionPlanInvariant,
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: {
      introducedIn: "V13.17",
      tags: ["architecture", "contract", "execution", "policy"],
      stability: "stable",
      dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`],
    },
    check: () => {
      const source = existsSync(invariant.file)
        ? readFileSync(invariant.file, "utf8")
        : "";
      const result = inspectRuntimeExecutionPlanInvariant(source, invariant);
      const details = [
        ...result.missing.map((token) => `missing: ${token}`),
        ...result.forbidden.map((token) => `forbidden: ${token}`),
      ];

      return details.length
        ? fail(
            rule,
            `${title}.`,
            details,
            "Restore the V13.17 runtime execution plan and dry-run boundary.",
          )
        : pass(rule, `${title}.`, [invariant.file]);
    },
  };
  return rule;
}

export const RUNTIME_EXECUTION_PLAN_CONTRACT_RULE: AuditRule =
  runtimeExecutionPlanRule(
    "AUDIT-394",
    "architecture",
    "Runtime Execution Plan exposes a versioned contract",
    "V13.17 must expose a schema-versioned Runtime Execution Plan and dry-run result.",
    RUNTIME_EXECUTION_PLAN_INVARIANTS.contract,
  );
export const RUNTIME_EXECUTION_PLAN_SERIALIZABLE_RULE: AuditRule =
  runtimeExecutionPlanRule(
    "AUDIT-395",
    "architecture",
    "Runtime Execution Plan remains serializable pure data",
    "Runtime Execution Plan construction must exclude platform effects and non-JSON values.",
    RUNTIME_EXECUTION_PLAN_INVARIANTS.pureData,
  );
export const RUNTIME_EXECUTION_PLAN_DRY_RUN_RULE: AuditRule =
  runtimeExecutionPlanRule(
    "AUDIT-396",
    "architecture",
    "Runtime Execution Plan dry-run is explicit and non-executing",
    "Dry-run must reuse policy-aware resolution and return a plan without adapter execution.",
    RUNTIME_EXECUTION_PLAN_INVARIANTS.dryRun,
  );
export const RUNTIME_EXECUTION_PLAN_ADAPTER_BOUNDARY_RULE: AuditRule =
  runtimeExecutionPlanRule(
    "AUDIT-397",
    "architecture",
    "Runtime Execution Plan exposes no adapter instance",
    "The public plan may describe selected runtime data but must not expose an adapter, command, cwd, environment, or callback.",
    RUNTIME_EXECUTION_PLAN_INVARIANTS.adapterBoundary,
  );
export const RUNTIME_EXECUTION_PLAN_COMPAT_RULE: AuditRule =
  runtimeExecutionPlanRule(
    "AUDIT-398",
    "architecture",
    "Runtime Execution Plan preserves historical bridge APIs",
    "The plan and dry-run APIs must be additive and preserve V13.15, V13.16, and V10 execution surfaces.",
    RUNTIME_EXECUTION_PLAN_INVARIANTS.compatibility,
  );
export const RUNTIME_EXECUTION_PLAN_DOCUMENT_RULE: AuditRule =
  runtimeExecutionPlanRule(
    "AUDIT-399",
    "docs",
    "Runtime abstraction documents Runtime Execution Plan",
    "Runtime abstraction documentation must distinguish Runtime plans, LoopRunner plans, dry-run, schema evolution, and serialized-plan limits.",
    RUNTIME_EXECUTION_PLAN_INVARIANTS.documentation,
  );

export type SimulatedRuntimeAdapterInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const SIMULATED_RUNTIME_ADAPTER_INVARIANTS = {
  contract: {
    file: "src/runtime/simulated.ts",
    requiredTokens: [
      "createSimulatedRuntimeAdapter",
      "SimulatedRuntimeAdapterOptions",
      "outcome: \"success\" | \"failure\"",
      "SimulatedRuntime",
    ],
    forbiddenTokens: [],
  },
  deterministic: {
    file: "src/runtime/simulated.ts",
    requiredTokens: ["cloneOutput", "requestedAt", "runtime_disabled"],
    forbiddenTokens: [
      "from \"node:fs\"",
      "from \"node:child_process\"",
      "fetch(",
      "Date.now",
      "new Date",
      "setTimeout",
      "setInterval",
      "Math.random",
      "crypto.randomUUID",
      "process.env",
      "import(",
      "require(",
      "console.",
    ],
  },
  registry: {
    file: "src/runtime/registry.ts",
    requiredTokens: ["SimulatedRuntime", "createRuntimeRegistry"],
    forbiddenTokens: [],
  },
  publicApi: {
    file: "src/runtime/index.ts",
    requiredTokens: ["createSimulatedRuntimeAdapter", "SimulatedRuntime"],
    forbiddenTokens: [],
  },
  planBoundary: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: [
      "dryRunPolicyAwareDeclarativeRuntimeExecution",
      "resolvePolicyAwareDeclarativeRuntimeExecution(input)",
      "executePolicyAwareDeclarativeRuntime",
      "executeRuntime(resolution.runtimeRequest)",
    ],
    forbiddenTokens: ["JSON.parse(JSON.stringify(plan))"],
  },
  documentation: {
    file: "docs/architecture/runtime-abstraction.md",
    requiredTokens: [
      "V13.18",
      "Simulated Runtime Adapter",
      "déterministe",
      "non fournisseur",
      "dry-run",
    ],
    forbiddenTokens: [],
  },
} as const satisfies Record<string, SimulatedRuntimeAdapterInvariant>;

export function inspectSimulatedRuntimeAdapterInvariant(
  source: string,
  invariant: SimulatedRuntimeAdapterInvariant,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return {
    missing: invariant.requiredTokens.filter(
      (token) => !sourceIncludesToken(source, token),
    ),
    forbidden: invariant.forbiddenTokens.filter((token) =>
      sourceIncludesToken(source, token),
    ),
  };
}

function simulatedRuntimeAdapterRule(
  id: string,
  category: AuditRule["category"],
  title: string,
  description: string,
  invariant: SimulatedRuntimeAdapterInvariant,
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: {
      introducedIn: "V13.18",
      tags: ["architecture", "contract", "execution"],
      stability: "stable",
      dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`],
    },
    check: () => {
      const source = existsSync(invariant.file)
        ? readFileSync(invariant.file, "utf8")
        : "";
      const result = inspectSimulatedRuntimeAdapterInvariant(source, invariant);
      const details = [
        ...result.missing.map((token) => `missing: ${token}`),
        ...result.forbidden.map((token) => `forbidden: ${token}`),
      ];

      return details.length
        ? fail(
            rule,
            `${title}.`,
            details,
            "Restore the deterministic simulated RuntimeAdapter boundary.",
          )
        : pass(rule, `${title}.`, [invariant.file]);
    },
  };
  return rule;
}

export const SIMULATED_RUNTIME_ADAPTER_CONTRACT_RULE: AuditRule =
  simulatedRuntimeAdapterRule(
    "AUDIT-400",
    "architecture",
    "Simulated RuntimeAdapter exposes a minimal explicit contract",
    "V13.18 must construct a deterministic simulated adapter without a scenario framework.",
    SIMULATED_RUNTIME_ADAPTER_INVARIANTS.contract,
  );
export const SIMULATED_RUNTIME_ADAPTER_DETERMINISM_RULE: AuditRule =
  simulatedRuntimeAdapterRule(
    "AUDIT-401",
    "architecture",
    "Simulated RuntimeAdapter remains effect-free and deterministic",
    "The simulated adapter must not read platform state or create external effects.",
    SIMULATED_RUNTIME_ADAPTER_INVARIANTS.deterministic,
  );
export const SIMULATED_RUNTIME_ADAPTER_REGISTRY_RULE: AuditRule =
  simulatedRuntimeAdapterRule(
    "AUDIT-402",
    "architecture",
    "Simulated RuntimeAdapter is declared in the static V10 registry",
    "The V13 to V10 bridge must resolve the simulated adapter through the existing static registry.",
    SIMULATED_RUNTIME_ADAPTER_INVARIANTS.registry,
  );
export const SIMULATED_RUNTIME_ADAPTER_PUBLIC_API_RULE: AuditRule =
  simulatedRuntimeAdapterRule(
    "AUDIT-403",
    "architecture",
    "Simulated RuntimeAdapter exports only construction surfaces",
    "The Runtime public API exposes the adapter factory and static instance without a metrics API.",
    SIMULATED_RUNTIME_ADAPTER_INVARIANTS.publicApi,
  );
export const SIMULATED_RUNTIME_ADAPTER_PLAN_BOUNDARY_RULE: AuditRule =
  simulatedRuntimeAdapterRule(
    "AUDIT-404",
    "architecture",
    "Runtime plans remain descriptive before simulated execution",
    "Dry-run and execution must preserve the V13.17 plan boundary and execute only from admitted original inputs.",
    SIMULATED_RUNTIME_ADAPTER_INVARIANTS.planBoundary,
  );
export const SIMULATED_RUNTIME_ADAPTER_DOCUMENT_RULE: AuditRule =
  simulatedRuntimeAdapterRule(
    "AUDIT-405",
    "docs",
    "Runtime abstraction documents the simulated adapter",
    "Documentation must distinguish the deterministic simulated adapter from a provider and a test mock.",
    SIMULATED_RUNTIME_ADAPTER_INVARIANTS.documentation,
  );

export type RuntimeExecutionReceiptInvariant = Readonly<{
  file: string;
  requiredTokens: readonly string[];
  forbiddenTokens: readonly string[];
}>;

export const RUNTIME_EXECUTION_RECEIPT_INVARIANTS = {
  contract: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: ["RUNTIME_EXECUTION_RECEIPT_SCHEMA_VERSION", "RuntimeExecutionReceipt", "createRuntimeExecutionReceipt", "schemaVersion: RuntimeExecutionReceiptSchemaVersion"],
    forbiddenTokens: [],
  },
  serialization: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: ["cloneRuntimeExecutionReceiptValue", "non-JSON instance", "thenable", "deepFreeze"],
    forbiddenTokens: ["from \"node:fs\"", "from \"node:child_process\"", "fetch(", "Date.now", "new Date", "performance.now", "setTimeout", "setInterval", "Math.random", "crypto.randomUUID", "process.env", "import(", "require(", "console."],
  },
  execution: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: ["executePolicyAwareDeclarativeRuntimeWithReceipt", "const runtimeResult = await executeRuntime(resolution.runtimeRequest)", "receipt: null", "outcome: \"executed\"", "createRuntimeExecutionReceipt({"],
    forbiddenTokens: ["JSON.parse(JSON.stringify(plan))"],
  },
  compatibility: {
    file: "src/core/runtime-execution-bridge.ts",
    requiredTokens: ["executePolicyAwareDeclarativeRuntime(", "executePolicyAwareDeclarativeRuntimeWithReceipt(", "RuntimeExecutionPlan", "RuntimeResult"],
    forbiddenTokens: [],
  },
  executionReportBoundary: {
    file: "src/execution/report.ts",
    requiredTokens: [],
    forbiddenTokens: ["RuntimeExecutionReceipt"],
  },
  documentation: {
    file: "docs/architecture/runtime-abstraction.md",
    requiredTokens: ["V13.19", "Runtime Execution Receipt", "refus policy", "refus adapter", "ExecutionReport", "LoopRunResult"],
    forbiddenTokens: [],
  },
} as const satisfies Record<string, RuntimeExecutionReceiptInvariant>;

export function inspectRuntimeExecutionReceiptInvariant(source: string, invariant: RuntimeExecutionReceiptInvariant): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  return {
    missing: invariant.requiredTokens.filter((token) => !sourceIncludesToken(source, token)),
    forbidden: invariant.forbiddenTokens.filter((token) => sourceIncludesToken(source, token)),
  };
}

function runtimeExecutionReceiptRule(id: string, category: AuditRule["category"], title: string, description: string, invariant: RuntimeExecutionReceiptInvariant): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description,
    metadata: {
      introducedIn: "V13.19",
      tags: ["architecture", "contract", "execution"],
      stability: "stable",
      dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`],
    },
    check: () => {
      const source = existsSync(invariant.file) ? readFileSync(invariant.file, "utf8") : "";
      const result = inspectRuntimeExecutionReceiptInvariant(source, invariant);
      const details = [...result.missing.map((token) => `missing: ${token}`), ...result.forbidden.map((token) => `forbidden: ${token}`)];
      return details.length
        ? fail(rule, `${title}.`, details, "Restore the deterministic Runtime Execution Receipt boundary.")
        : pass(rule, `${title}.`, [invariant.file]);
    },
  };
  return rule;
}

export const RUNTIME_EXECUTION_RECEIPT_CONTRACT_RULE: AuditRule = runtimeExecutionReceiptRule("AUDIT-406", "architecture", "Runtime Execution Receipt exposes a versioned post-execution contract", "V13.19 must expose a schema-versioned receipt distinct from the Runtime Execution Plan and RuntimeResult.", RUNTIME_EXECUTION_RECEIPT_INVARIANTS.contract);
export const RUNTIME_EXECUTION_RECEIPT_SERIALIZATION_RULE: AuditRule = runtimeExecutionReceiptRule("AUDIT-407", "architecture", "Runtime Execution Receipt is immutable JSON-safe data", "Receipt construction must clone public data and reject non-JSON values without platform effects.", RUNTIME_EXECUTION_RECEIPT_INVARIANTS.serialization);
export const RUNTIME_EXECUTION_RECEIPT_EXECUTION_RULE: AuditRule = runtimeExecutionReceiptRule("AUDIT-408", "architecture", "Runtime Execution Receipt is created only after adapter execution", "Pre-execution failures must have no receipt, while adapter-returned denied outcomes remain receipts of actual execution.", RUNTIME_EXECUTION_RECEIPT_INVARIANTS.execution);
export const RUNTIME_EXECUTION_RECEIPT_COMPAT_RULE: AuditRule = runtimeExecutionReceiptRule("AUDIT-409", "architecture", "Runtime Execution Receipt preserves historical execution contracts", "The receipt API must be additive and leave V10 and V13.15–V13.18 execution APIs unchanged.", RUNTIME_EXECUTION_RECEIPT_INVARIANTS.compatibility);
export const RUNTIME_EXECUTION_RECEIPT_REPORTING_BOUNDARY_RULE: AuditRule = runtimeExecutionReceiptRule("AUDIT-410", "architecture", "Runtime Execution Receipt does not alter execution reporting", "V13.19 must not add receipts to the historical src/execution reporting layer.", RUNTIME_EXECUTION_RECEIPT_INVARIANTS.executionReportBoundary);
export const RUNTIME_EXECUTION_RECEIPT_DOCUMENT_RULE: AuditRule = runtimeExecutionReceiptRule("AUDIT-411", "docs", "Runtime abstraction documents Runtime Execution Receipt boundaries", "Documentation must distinguish plan, V10 result, receipt, ExecutionReport, LoopRunResult, and the two denial levels.", RUNTIME_EXECUTION_RECEIPT_INVARIANTS.documentation);

const POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS = [
  ["AUDIT-412", "Policy-bound local process bridge is explicit", ["LocalProcessExecutionBinding", "resolvePolicyBoundLocalProcessExecution", "runtime_execution_local_process_binding_required"]],
  ["AUDIT-413", "Policy-bound local process dry-run remains inert", ["dryRunPolicyBoundLocalProcessExecution", "localProcessConfigured"]],
  ["AUDIT-414", "Local process receipts redact adapter output", ["LOCAL_PROCESS_RUNTIME_ID", "? null", "createRuntimeExecutionReceipt"]],
  ["AUDIT-415", "Runtime abstraction documents the policy-bound bridge", ["Policy-bound Local Process Bridge V13.21", "LocalProcessExecutionBinding", "output: null"]],
] as const;

function policyBoundLocalProcessBridgeRule(
  id: string,
  title: string,
  requiredTokens: readonly string[],
  file: string,
  category: AuditRule["category"],
): AuditRule {
  const rule: AuditRule = {
    id,
    category,
    severity: "error",
    title,
    description: "V13.21 must keep local process authority explicit, inert in dry-run, and redacted in public receipts.",
    metadata: { introducedIn: "V13.21", tags: ["architecture", "execution", "policy"], stability: "stable", dependsOn: [`AUDIT-${Number(id.slice(6)) - 1}`] },
    check: () => {
      const source = existsSync(file) ? readFileSync(file, "utf8") : "";
      const missing = requiredTokens.filter((token) => !sourceIncludesToken(source, token));
      return missing.length > 0
        ? fail(rule, `${title}.`, missing.map((token) => `missing: ${token}`), "Restore the V13.21 local process boundary.")
        : pass(rule, `${title}.`, [file]);
    },
  };
  return rule;
}

export const POLICY_BOUND_LOCAL_PROCESS_BRIDGE_CONTRACT_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-412", POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[0][1], POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[0][2], "src/core/runtime-execution-bridge.ts", "architecture");
export const POLICY_BOUND_LOCAL_PROCESS_BRIDGE_DRY_RUN_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-413", POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[1][1], POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[1][2], "src/core/runtime-execution-bridge.ts", "architecture");
export const POLICY_BOUND_LOCAL_PROCESS_BRIDGE_RECEIPT_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-414", POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[2][1], POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[2][2], "src/core/runtime-execution-bridge.ts", "architecture");
export const POLICY_BOUND_LOCAL_PROCESS_BRIDGE_DOCUMENT_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-415", POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[3][1], POLICY_BOUND_LOCAL_PROCESS_BRIDGE_INVARIANTS[3][2], "docs/architecture/runtime-abstraction.md", "docs");

export const LOCAL_PROCESS_TERMINATION_CONTRACT_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-416", "Local process termination policy is closed and bounded", ["LocalProcessTerminationPolicy", "DEFAULT_LOCAL_PROCESS_TERMINATION_POLICY", "gracePeriodMs"], "src/runtime/types.ts", "architecture");
export const LOCAL_PROCESS_TERMINATION_ORDER_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-417", "Local process requests SIGTERM before SIGKILL", ["requestSignal(\"SIGTERM\")", "requestSignal(\"SIGKILL\")", "graceTimer"], "src/runtime/local-process.ts", "architecture");
export const LOCAL_PROCESS_TERMINATION_RECEIPT_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-418", "Local process receipt keeps output redacted with safe termination metadata", ["runtimeResult.termination", "output:", "? null"], "src/core/runtime-execution-bridge.ts", "architecture");
export const LOCAL_PROCESS_TERMINATION_DOCUMENT_RULE: AuditRule = policyBoundLocalProcessBridgeRule("AUDIT-419", "Runtime abstraction documents direct-child termination limits", ["Termination Contract V13.22", "descendants n'est pas garanti", "POSIX"], "docs/architecture/runtime-abstraction.md", "docs");

function collectLoopExecutionBoundarySources(directory: string): readonly string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = readdirSync(directory, { withFileTypes: true });
  const files = entries.flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory()
      ? collectLoopExecutionBoundarySources(entryPath)
      : entry.isFile()
        ? [entryPath]
        : [];
  });

  return Object.freeze([...files].sort((left, right) => left.localeCompare(right)));
}

function readLoopExecutionBoundarySource(directory: string): string {
  return collectLoopExecutionBoundarySources(directory)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n\n");
}

export const LOOP_EXECUTION_BOUNDARY_INVARIANTS = Object.freeze({
  sourceRoot: "src/loop",
  forbiddenTokens: Object.freeze([
    "from \"../runtime/",
    "from '../runtime/",
    "runtime-execution-bridge",
    "prepareLoopPolicyBoundLocalProcessExecution",
    "executeLoopPolicyBoundLocalProcessWithReceipt",
    "dryRunPolicyBoundLocalProcessExecution",
    "executePolicyBoundLocalProcessWithReceipt",
  ]),
});

export function inspectLoopExecutionBoundaryInvariant(source: string): readonly string[] {
  return LOOP_EXECUTION_BOUNDARY_INVARIANTS.forbiddenTokens.filter((token) =>
    sourceIncludesToken(source, token),
  );
}

const LOOP_EXECUTION_BOUNDARY_RULE_ID = "AUDIT-420" as const;

export const LOOP_EXECUTION_BOUNDARY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: LOOP_EXECUTION_BOUNDARY_RULE_ID,
    category: "architecture",
    severity: "error",
    title: "Loop execution boundary keeps LoopRunner plan-only",
    description:
      "src/loop/** must stay isolated from runtime execution and Core local-process handoffs.",
    metadata: {
      introducedIn: "V13.28",
      tags: ["architecture", "documentation", "contract"],
      stability: "stable",
      dependsOn: ["AUDIT-419"],
    },
    check: () => {
      const source = readLoopExecutionBoundarySource(
        LOOP_EXECUTION_BOUNDARY_INVARIANTS.sourceRoot,
      );
      const forbidden = inspectLoopExecutionBoundaryInvariant(source);

      return forbidden.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            forbidden.map((token) => `forbidden: ${token}`),
            "Keep LoopRunner plan-only and route local-process execution through Core.",
          )
        : pass(rule, `${rule.title}.`, [
            LOOP_EXECUTION_BOUNDARY_INVARIANTS.sourceRoot,
          ]);
    },
  };

  return rule;
})();
