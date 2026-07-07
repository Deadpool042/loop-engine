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

export const AUDIT_RULES: readonly AuditRule[] = [
  JSON_SCHEMA_VERSION_RULE,
];
