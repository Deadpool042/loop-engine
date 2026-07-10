import type { AuditProfile, AuditReport } from "./types.js";
import { AUDIT_RULES } from "./rules.js";
import { selectAuditRulesForProfile } from "./profiles.js";

export type AuditRunOptions = {
  readonly profile?: AuditProfile;
};

export function runAudit(options: AuditRunOptions = {}): AuditReport {
  const rules = options.profile === undefined
    ? AUDIT_RULES
    : selectAuditRulesForProfile(options.profile, AUDIT_RULES);
  const findings = rules.map((rule) => rule.check());

  const total = findings.length;
  const pass = findings.filter((finding) => finding.status === "pass").length;
  const warning = findings.filter((finding) => finding.status === "warning").length;
  const fail = findings.filter((finding) => finding.status === "fail").length;
  const skipped = findings.filter((finding) => finding.status === "skipped").length;
  const status = fail > 0 ? "fail" : warning > 0 ? "warning" : "pass";
  const score = total === 0 ? 100 : Math.round((pass / total) * 100);
  const byCategory = findings.reduce<Partial<Record<AuditReport["findings"][number]["category"], number>>>(
    (summary, finding) => {
      summary[finding.category] = (summary[finding.category] ?? 0) + 1;
      return summary;
    },
    {},
  );
  const byPriority = findings.reduce<Partial<Record<AuditReport["findings"][number]["priority"], number>>>(
    (summary, finding) => {
      summary[finding.priority] = (summary[finding.priority] ?? 0) + 1;
      return summary;
    },
    {},
  );
  const recommendations = findings
    .filter((finding) => finding.recommendation)
    .map((finding) => ({
      ruleId: finding.ruleId,
      priority: finding.priority,
      message: finding.recommendation!,
    }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      status,
      total,
      pass,
      warning,
      fail,
      skipped,
      score,
      byCategory,
      byPriority,
    },
    findings,
    recommendations,
  };
}
