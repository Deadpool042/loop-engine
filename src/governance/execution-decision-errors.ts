export class ExecutionDecisionPreparationPassthroughFailure extends Error {
  constructor() { super(); this.name = "ExecutionDecisionPreparationPassthroughFailure"; }
}

export class ExecutionDecisionPreparationStageFailure extends Error {
  constructor(
    readonly stage: "current" | "propose" | "draft",
    readonly code: "execution_decision_current_failed" | "execution_decision_propose_failed" | "execution_decision_draft_failed",
  ) { super(code); this.name = "ExecutionDecisionPreparationStageFailure"; }
}

export type DraftValidationIssue =
  | "provider_fields_invalid"
  | "allowed_paths_invalid"
  | "protected_path"
  | "forbidden_terms_invalid";

/** A bounded child-process result: it deliberately contains no provider draft. */
export class ExecutionDecisionDraftValidationFailure extends ExecutionDecisionPreparationPassthroughFailure {
  constructor(
    readonly draftValidationIssue: DraftValidationIssue,
    readonly telemetry: Readonly<{
      model: string;
      durationMs: number;
      usage?: Readonly<{ inputTokens: number; outputTokens: number }>;
      actualCalculatedCostUsd?: number;
      pricingEffectiveDate?: string;
    }>,
  ) {
    super();
    this.message = "decision_draft_invalid";
    this.name = "ExecutionDecisionDraftValidationFailure";
  }
}
