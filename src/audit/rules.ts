import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "./findings.js";
import { PUBLIC_COMMANDS } from "./public-commands.js";
import { JSON_CHECK_COVERAGE_RULE, JSON_SCHEMA_VERSION_RULE } from "./rules/json.js";
import type { AuditRule } from "./types.js";


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
