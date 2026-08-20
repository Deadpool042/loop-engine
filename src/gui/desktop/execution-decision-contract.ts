export type DesktopExecutionDecisionDraft = Readonly<{
  draftId: string; candidateId: string; objective: string; deliverables: readonly string[];
  outOfScope: readonly string[]; allowedPaths: readonly string[]; gitHead: string;
  sourceDocument: string; forbiddenContentTerms?: readonly string[];
}>;
export type DesktopExecutionDecisionResult =
  | Readonly<{ ok: true } & DesktopExecutionDecisionDraft>
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: string; message: string }>;

export const EXECUTION_DECISION_PREPARE_CHANNEL = "loop:execution-decision-prepare" as const;
export const EXECUTION_DECISION_APPROVE_CHANNEL = "loop:execution-decision-approve" as const;
