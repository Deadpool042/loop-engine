export const AUDIT_PROFILES = [
  "quick",
  "strict",
  "release",
  "docs",
  "json",
  "architecture",
] as const;

export type AuditProfile = (typeof AUDIT_PROFILES)[number];

export type AuditCategory =
  | "architecture"
  | "duplication"
  | "json"
  | "cli"
  | "tests"
  | "docs"
  | "rag"
  | "handoff";

export type AuditSeverity = "info" | "warning" | "error";
export type AuditStatus = "pass" | "warning" | "fail" | "skipped";
export type AuditSummaryStatus = "pass" | "warning" | "fail";
export type AuditPriority = "low" | "medium" | "high";

export const AUDIT_RULE_TAGS = [
  "contract",
  "self-audit",
  "documentation",
  "ci",
  "json",
  "architecture",
  "cli",
  "execution",
  "policy",
  "context",
] as const;

export type AuditRuleTag = (typeof AUDIT_RULE_TAGS)[number];

export const AUDIT_RULE_STABILITIES = [
  "stable",
  "experimental",
  "deprecated",
] as const;

export type AuditRuleStability = (typeof AUDIT_RULE_STABILITIES)[number];

export type AuditRuleMetadata = Readonly<{
  introducedIn: string | null;
  tags: readonly AuditRuleTag[];
  stability: AuditRuleStability;
  // Declarative only in V8.0: dependencies are validated but never used to
  // change rule execution order or to skip checks.
  dependsOn: readonly string[];
}>;

export type AuditRecommendation = Readonly<{
  ruleId: string;
  priority: AuditPriority;
  message: string;
}>;

export type AuditFinding = Readonly<{
  ruleId: string;
  category: AuditCategory;
  severity: AuditSeverity;
  status: AuditStatus;
  priority: AuditPriority;
  message: string;
  recommendation?: string;
  details?: readonly string[];
}>;

export type AuditRuleDefinition = Readonly<{
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  check: () => AuditFinding;
  metadata?: Partial<AuditRuleMetadata>;
}>;

export type AuditRule = Readonly<{
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  check: () => AuditFinding;
  metadata: AuditRuleMetadata;
}>;

export type AuditReport = Readonly<{
  schemaVersion: 1;
  generatedAt: string;
  summary: {
    status: AuditSummaryStatus;
    total: number;
    pass: number;
    warning: number;
    fail: number;
    skipped: number;
    score: number;
    byCategory: Partial<Record<AuditCategory, number>>;
    byPriority: Partial<Record<AuditPriority, number>>;
    /**
     * @deprecated Use recommendations.byPriority.
     */
    recommendationsByPriority: Partial<Record<AuditPriority, number>>;
    recommendations: {
      total: number;
      byPriority: Partial<Record<AuditPriority, number>>;
    };
  };
  findings: readonly AuditFinding[];
  recommendations: readonly AuditRecommendation[];
}>;
