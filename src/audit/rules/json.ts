import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import { PUBLIC_COMMANDS, PUBLIC_JSON_COMMAND_FILES } from "../public-commands.js";
import type { AuditRule } from "../types.js";

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
        "Add schemaVersion to every public command that supports --json.",
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
        "Restore src/commands/json-check.ts or update the audit rule if the command was intentionally removed.",
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
        "Add the missing public JSON commands to src/commands/json-check.ts.",
      );
    }

    return pass(
      JSON_CHECK_COVERAGE_RULE,
      "All public JSON commands are covered by json-check.",
      expectedCommands,
    );
  },
};

export const AUDIT_JSON_SUMMARY_CONTRACT_RULE: AuditRule = {
  id: "JSON-006",
  category: "json",
  severity: "warning",
  title: "Audit JSON report exposes stable summary fields",
  description: "The audit JSON report should expose the stable summary fields used by downstream tools.",
  check: () => {
    const typesPath = "src/audit/types.ts";

    if (!existsSync(typesPath)) {
      return fail(
        AUDIT_JSON_SUMMARY_CONTRACT_RULE,
        "Audit report type definition is missing.",
        [typesPath],
        "Restore src/audit/types.ts or update the audit rule if the report model moved.",
      );
    }

    const content = readFileSync(typesPath, "utf8");

    const expectedTokens = [
      "total: number;",
      "pass: number;",
      "warning: number;",
      "fail: number;",
      "skipped: number;",
      "score: number;",
      "byCategory: Partial<Record<AuditCategory, number>>;",
    ];

    const missing = expectedTokens.filter(
      (token) => !content.includes(token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_JSON_SUMMARY_CONTRACT_RULE,
        "Audit JSON summary contract is incomplete.",
        missing,
        "Ensure AuditReport.summary exposes all stable summary fields.",
      );
    }

    return pass(
      AUDIT_JSON_SUMMARY_CONTRACT_RULE,
      "Audit JSON summary contract exposes all stable fields.",
      expectedTokens,
    );
  },
};
