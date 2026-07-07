import { existsSync, readFileSync } from "node:fs";
import type { AuditFinding, AuditPriority, AuditRule } from "./types.js";

const PUBLIC_COMMANDS = [
  "audit",
  "summary",
  "context",
  "next",
  "prompt",
  "review",
  "handoff",
  "rag-search",
] as const;

const PUBLIC_JSON_COMMAND_FILES = [
  "src/commands/summary.ts",
  "src/commands/context.ts",
  "src/commands/next.ts",
  "src/commands/prompt.ts",
  "src/commands/review.ts",
  "src/commands/handoff.ts",
  "src/commands/rag-search.ts",
] as const;

function getPriority(rule: AuditRule, status: AuditFinding["status"]): AuditPriority {
  if (status === "fail" && rule.severity === "error") {
    return "high";
  }

  if (status === "fail" || status === "warning") {
    return "medium";
  }

  return "low";
}

function pass(rule: AuditRule, message: string, details?: readonly string[]): AuditFinding {
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    status: "pass",
    priority: getPriority(rule, "pass"),
    message,
    ...(details ? { details } : {}),
  };
}

function fail(rule: AuditRule, message: string, details?: readonly string[]): AuditFinding {
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    status: "fail",
    priority: getPriority(rule, "fail"),
    message,
    ...(details ? { details } : {}),
  };
}

export const JSON_SCHEMA_VERSION_RULE: AuditRule = {
  id: "JSON-001",
  category: "json",
  severity: "error",
  title: "Public JSON outputs expose schemaVersion",
  description: "Every documented public JSON command should expose schemaVersion.",
  check: () => {
    const files = PUBLIC_JSON_COMMAND_FILES;

    const missing = files.filter((file) => {
      if (!existsSync(file)) {
        return true;
      }

      return !readFileSync(file, "utf8").includes("schemaVersion");
    });

    if (missing.length > 0) {
      return fail(
        JSON_SCHEMA_VERSION_RULE,
        "Some public JSON commands do not expose schemaVersion.",
        missing,
      );
    }

    return pass(
      JSON_SCHEMA_VERSION_RULE,
      "All public JSON command files expose schemaVersion.",
      files,
    );
  },
};


export const JSON_CHECK_COVERAGE_RULE: AuditRule = {
  id: "JSON-005",
  category: "json",
  severity: "warning",
  title: "Public JSON commands are covered by json-check",
  description: "Every public command exposing --json should be listed in json-check.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_CHECK_COVERAGE_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedCommands = PUBLIC_COMMANDS;

    const missing = expectedCommands.filter(
      (command) => !content.includes(`["${command}"`),
    );

    if (missing.length > 0) {
      return fail(
        JSON_CHECK_COVERAGE_RULE,
        "Some public JSON commands are missing from json-check.",
        missing,
      );
    }

    return pass(
      JSON_CHECK_COVERAGE_RULE,
      "All public JSON commands are covered by json-check.",
      expectedCommands,
    );
  },
};



const CLI_COMMAND_COVERAGE_RULE: AuditRule = {
  id: "CLI-001",
  category: "cli",
  severity: "error",
  title: "Public CLI commands are covered by the router",
  description: "Every public command should be reachable from the CLI router.",
  check: () => {
    const content = readFileSync("src/cli.ts", "utf8");

    const expectedCommands = PUBLIC_COMMANDS;

    const missing = expectedCommands.filter(
      (command) => !content.includes(`"${command}"`) && !content.includes(`'${command}'`),
    );

    if (missing.length > 0) {
      return fail(
        CLI_COMMAND_COVERAGE_RULE,
        "Some public CLI commands are missing from the router.",
        missing,
      );
    }

    return pass(
      CLI_COMMAND_COVERAGE_RULE,
      "All public CLI commands are covered by the router.",
      expectedCommands,
    );
  },
};

const AUDIT_DOCUMENTATION_COVERAGE_RULE: AuditRule = {
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
      );
    }

    return pass(
      AUDIT_DOCUMENTATION_COVERAGE_RULE,
      "Audit engine documentation covers human and JSON report outputs.",
      expectedTerms,
    );
  },
};

const AUDIT_SCORE_EXPOSURE_RULE: AuditRule = {
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
      );
    }

    return pass(
      AUDIT_SCORE_EXPOSURE_RULE,
      "Audit score is typed, computed, and displayed.",
      expectations.map(({ file }) => file),
    );
  },
};

const AUDIT_PRIORITY_EXPOSURE_RULE: AuditRule = {
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
        file: "src/audit/rules.ts",
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
      );
    }

    return pass(
      AUDIT_PRIORITY_EXPOSURE_RULE,
      "Audit priority is typed and populated.",
      expectations.map(({ file }) => file),
    );
  },
};

export const AUDIT_RULES: readonly AuditRule[] = [
  JSON_SCHEMA_VERSION_RULE,
  JSON_CHECK_COVERAGE_RULE,
  CLI_COMMAND_COVERAGE_RULE,
  AUDIT_DOCUMENTATION_COVERAGE_RULE,
  AUDIT_SCORE_EXPOSURE_RULE,
  AUDIT_PRIORITY_EXPOSURE_RULE,
];
