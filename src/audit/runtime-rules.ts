import { RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE } from "./rules/runtime-execution-receipt-reporting.js";
import { RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE } from "./rules/runtime-execution-receipt-reporting-serialization.js";
import { registerAuditRulesForIntegrityCheck } from "./rules/audit.js";
import { AUDIT_RULES as BASE_AUDIT_RULES } from "./rules.js";
import type { AuditRuleDefinition } from "./types.js";

/**
 * Operational audit inventory.
 *
 * V13.76 keeps the historical rules module stable while extending the runtime
 * audit inventory with additive Runtime receipt reporting boundary rules.
 */
export const AUDIT_RULES = Object.freeze([
  ...BASE_AUDIT_RULES,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE,
]) satisfies readonly AuditRuleDefinition[];

registerAuditRulesForIntegrityCheck(AUDIT_RULES);
