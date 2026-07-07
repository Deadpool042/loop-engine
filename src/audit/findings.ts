import type { AuditFinding, AuditPriority, AuditRule } from "./types.js";

export function getPriority(rule: AuditRule, status: AuditFinding["status"]): AuditPriority {
  if (status === "fail" && rule.severity === "error") {
    return "high";
  }

  if (status === "fail" || status === "warning") {
    return "medium";
  }

  return "low";
}

export function pass(
  rule: AuditRule,
  message: string,
  details?: readonly string[],
): AuditFinding {
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

export function fail(
  rule: AuditRule,
  message: string,
  details?: readonly string[],
): AuditFinding {
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
