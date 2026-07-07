import type { AuditReport } from "./types.js";
import { AUDIT_RULES } from "./rules.js";

export function runAudit(): AuditReport {
  const findings = AUDIT_RULES.map((rule) => rule.check());

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      total: findings.length,
      pass: findings.filter((finding) => finding.status === "pass").length,
      warning: findings.filter((finding) => finding.status === "warning").length,
      fail: findings.filter((finding) => finding.status === "fail").length,
      skipped: findings.filter((finding) => finding.status === "skipped").length,
    },
    findings,
  };
}
