import type { AutomationOrchestratorPipelineProgression } from "./pipeline-types.js";

/** Closed structural status of a compact pipeline summary. */
export type AutomationOrchestratorPipelineSummaryStatus = "valid" | "invalid";

/** Compact, identifier-only description of one reached declarative stage. */
export type AutomationOrchestratorPipelineSummaryStage = Readonly<{
  status:
    | "eligible"
    | "denied"
    | "indeterminate"
    | "selected"
    | "rejected"
    | "prepared";
  requestId: string;
  delegationId: string;
  candidateId: string | null;
  targetId: string | null;
  evidenceCount: number;
  findingCount: number;
  failureCount: number;
}>;

/** Deterministic aggregate counts derived from public result arrays only. */
export type AutomationOrchestratorPipelineSummaryCounts = Readonly<{
  diagnostics: number;
  findings: number;
  failures: number;
  evidence: number;
}>;

/**
 * Immutable descriptive projection of an already composed and validated
 * pipeline. It never represents delivery, delegation, invocation, or runtime
 * execution.
 */
export type AutomationOrchestratorPipelineSummary = Readonly<{
  status: AutomationOrchestratorPipelineSummaryStatus;
  valid: boolean;
  progression: AutomationOrchestratorPipelineProgression | null;
  validationSubjectStatus: "complete" | "incomplete" | null;
  evaluation: AutomationOrchestratorPipelineSummaryStage | null;
  selection: AutomationOrchestratorPipelineSummaryStage | null;
  dispatch: AutomationOrchestratorPipelineSummaryStage | null;
  requestId: string | null;
  delegationId: string | null;
  candidateId: string | null;
  targetId: string | null;
  counts: AutomationOrchestratorPipelineSummaryCounts;
  dispatchOccurred: false;
  delegationOccurred: false;
  providerInvoked: false;
  forgeInvoked: false;
  executionStarted: false;
}>;
