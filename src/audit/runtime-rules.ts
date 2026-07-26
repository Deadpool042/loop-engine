import { createAuditRuleRegistry } from "./registry.js";
import { RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE } from "./rules/runtime-execution-public-result-facade.js";
import { RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE } from "./rules/runtime-execution-receipt-reporting.js";
import { RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE } from "./rules/runtime-execution-receipt-reporting-serialization.js";
import { registerAuditRulesForIntegrityCheck } from "./rules/audit.js";
import { AUDIT_RULES as BASE_AUDIT_RULES } from "./rules.js";

/**
 * Operational audit inventory.
 *
 * V13.76+ keeps the historical rules module stable while extending the runtime
 * audit inventory with additive Runtime receipt/public-result boundary rules.
 * The composite inventory is normalized again so downstream selectors and
 * manifests always receive complete AuditRule metadata.
 */
export const AUDIT_RULES = createAuditRuleRegistry([
  ...BASE_AUDIT_RULES,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_RULE,
  RUNTIME_EXECUTION_RECEIPT_REPORTING_SERIALIZATION_RULE,
  RUNTIME_EXECUTION_PUBLIC_RESULT_FACADE_RULE,
]);

registerAuditRulesForIntegrityCheck(AUDIT_RULES);
