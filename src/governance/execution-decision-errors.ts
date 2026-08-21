export class ExecutionDecisionPreparationPassthroughFailure extends Error {
  constructor() { super(); this.name = "ExecutionDecisionPreparationPassthroughFailure"; }
}

export class ExecutionDecisionPreparationStageFailure extends Error {
  constructor(
    readonly stage: "current" | "propose" | "draft",
    readonly code: "execution_decision_current_failed" | "execution_decision_propose_failed" | "execution_decision_draft_failed",
  ) { super(code); this.name = "ExecutionDecisionPreparationStageFailure"; }
}
