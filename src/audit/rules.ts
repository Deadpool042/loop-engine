import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "./findings.js";
import { AUDIT_PRIORITY_EXPOSURE_RULE, AUDIT_SCORE_EXPOSURE_RULE } from "./rules/audit.js";
import { CLI_COMMAND_COVERAGE_RULE } from "./rules/cli.js";
import { AUDIT_DOCUMENTATION_COVERAGE_RULE } from "./rules/docs.js";
import { JSON_CHECK_COVERAGE_RULE, JSON_SCHEMA_VERSION_RULE } from "./rules/json.js";
import type { AuditRule } from "./types.js";


export const AUDIT_RULES: readonly AuditRule[] = [
  JSON_SCHEMA_VERSION_RULE,
  JSON_CHECK_COVERAGE_RULE,
  CLI_COMMAND_COVERAGE_RULE,
  AUDIT_DOCUMENTATION_COVERAGE_RULE,
  AUDIT_SCORE_EXPOSURE_RULE,
  AUDIT_PRIORITY_EXPOSURE_RULE,
];
