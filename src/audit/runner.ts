import type { AuditReport } from "./types.js";
import { AUDIT_RULES } from "./rules.js";

export function runAudit(): AuditReport {
  const findings = AUDIT_RULES.map((rule) => rule.check());

  const total = findings.length;
  const pass = findings.filter((finding) => finding.status === "pass").length;
  const warning = findings.filter((finding) => finding.status === "warning").length;
  const fail = findings.filter((finding) => finding.status === "fail").length;
  const skipped = findings.filter((finding) => finding.status === "skipped").length;
  const score = total === 0 ? 100 : Math.round((pass / total) * 100);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      total,
      pass,
      warning,
      fail,
      skipped,
      score,
    },
    findings,
  };
}
