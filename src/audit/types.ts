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

export type AuditRule = Readonly<{
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  title: string;
  description: string;
  check: () => AuditFinding;
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
  };
  findings: readonly AuditFinding[];
  recommendations: readonly AuditRecommendation[];
}>;
