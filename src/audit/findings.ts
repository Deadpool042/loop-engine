import type { AuditFinding, AuditPriority, AuditRule } from "./types.js";

function normalizeDetails(
  details?: readonly string[],
): readonly string[] | undefined {
  if (!details) {
    return undefined;
  }

  return [...new Set(details)];
}

export function getPriority(
  rule: AuditRule,
  status: AuditFinding["status"],
): AuditPriority {
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
  const normalizedDetails = normalizeDetails(details);

  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    status: "pass",
    priority: getPriority(rule, "pass"),
    message,
    ...(normalizedDetails ? { details: normalizedDetails } : {}),
  };
}

export function fail(
  rule: AuditRule,
  message: string,
  details?: readonly string[],
  recommendation?: string,
): AuditFinding {
  const normalizedDetails = normalizeDetails(details);

  return {
    ruleId: rule.id,
    category: rule.category,
    severity: rule.severity,
    status: "fail",
    priority: getPriority(rule, "fail"),
    message,
    ...(recommendation ? { recommendation } : {}),
    ...(normalizedDetails ? { details: normalizedDetails } : {}),
  };
}
