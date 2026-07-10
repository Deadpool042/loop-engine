import type { AuditFinding, AuditPriority, AuditRecommendation } from "./types.js";

export const AUDIT_RECOMMENDATION_PRIORITY_ORDER: Record<AuditPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function buildAuditRecommendations(
  findings: readonly AuditFinding[],
): readonly AuditRecommendation[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => finding.recommendation)
    .sort((left, right) => {
      const priorityDelta =
        AUDIT_RECOMMENDATION_PRIORITY_ORDER[left.finding.priority] -
        AUDIT_RECOMMENDATION_PRIORITY_ORDER[right.finding.priority];

      return priorityDelta === 0 ? left.index - right.index : priorityDelta;
    })
    .map(({ finding }) => ({
      ruleId: finding.ruleId,
      priority: finding.priority,
      message: finding.recommendation!,
    }));
}
