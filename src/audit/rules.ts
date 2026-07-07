import { existsSync, readFileSync } from "node:fs";
import type { AuditFinding, AuditRule } from "./types.js";

function pass(rule: AuditRule, message: string, details?: readonly string[]): AuditFinding {
  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    status: "pass",
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
    const files = [
      "src/commands/summary.ts",
      "src/commands/context.ts",
      "src/commands/next.ts",
      "src/commands/prompt.ts",
      "src/commands/review.ts",
      "src/commands/handoff.ts",
      "src/commands/rag-search.ts",
    ];

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
    const expectedCommands = [
      "audit",
      "summary",
      "context",
      "next",
      "prompt",
      "review",
      "handoff",
      "rag-search",
    ];

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

    const expectedCommands = [
      "audit",
      "summary",
      "context",
      "next",
      "prompt",
      "review",
      "handoff",
      "rag-search",
    ];

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

export const AUDIT_RULES: readonly AuditRule[] = [
  JSON_SCHEMA_VERSION_RULE,
  JSON_CHECK_COVERAGE_RULE,
  CLI_COMMAND_COVERAGE_RULE,
  AUDIT_DOCUMENTATION_COVERAGE_RULE,
];
