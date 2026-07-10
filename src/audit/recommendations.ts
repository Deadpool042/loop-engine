import type { AuditFinding, AuditRecommendation } from "./types.js";

export function buildAuditRecommendations(
  findings: readonly AuditFinding[],
): readonly AuditRecommendation[] {
  return findings
    .filter((finding) => finding.recommendation)
    .map((finding) => ({
      ruleId: finding.ruleId,
      priority: finding.priority,
      message: finding.recommendation!,
    }));
}
