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

export type AuditFinding = Readonly<{
  ruleId: string;
  category: AuditCategory;
  severity: AuditSeverity;
  status: AuditStatus;
  message: string;
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
    total: number;
    pass: number;
    warning: number;
    fail: number;
    skipped: number;
  };
  findings: readonly AuditFinding[];
}>;
