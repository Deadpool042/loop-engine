import type { AutomationOrchestratorDelegationDispatchResult } from "./delegation-dispatch/index.js";
import type { AutomationOrchestratorDelegationEvaluationResult } from "./delegation-evaluation/index.js";
import type { AutomationOrchestratorDelegationSelectionResult } from "./delegation-selection/index.js";

/** The furthest declarative stage reached by a composed pipeline. */
export type AutomationOrchestratorPipelineProgression =
  "evaluation" | "selection" | "dispatch";

/**
 * Immutable result of pure delegation-pipeline composition. A null later stage
 * explicitly records that the preceding stage short-circuited.
 */
export type AutomationOrchestratorPipelineResult = Readonly<{
  progression: AutomationOrchestratorPipelineProgression;
  delegationEvaluation: AutomationOrchestratorDelegationEvaluationResult;
  delegationSelection: AutomationOrchestratorDelegationSelectionResult | null;
  delegationDispatch: AutomationOrchestratorDelegationDispatchResult | null;
}>;

export type AutomationOrchestratorPipelineValidationStatus =
  "valid" | "invalid";

/** A deterministic diagnostic of composed-pipeline consistency only. */
export type AutomationOrchestratorPipelineValidationDiagnostic = Readonly<{
  code:
    | "pipeline_identity_inconsistent"
    | "pipeline_malformed"
    | "pipeline_nullability_invalid"
    | "pipeline_operational_flag_invalid"
    | "pipeline_progression_invalid"
    | "pipeline_stage_status_invalid";
  message: string;
}>;

/**
 * Deterministic public identity of the pipeline a validation result applies
 * to. An incomplete subject never matches a complete subject.
 */
export type AutomationOrchestratorPipelineValidationSubject =
  | Readonly<{
      status: "complete";
      progression: AutomationOrchestratorPipelineProgression;
      requestId: string;
      delegationId: string;
      candidateId: string | null;
      targetId: string | null;
    }>
  | Readonly<{
      status: "incomplete";
      progression: AutomationOrchestratorPipelineProgression | null;
      requestId: string | null;
      delegationId: string | null;
      candidateId: string | null;
      targetId: string | null;
    }>;

/**
 * Immutable, fail-closed consistency result. Validity remains structural and
 * semantic only; it does not imply any operational action or authorization.
 */
export type AutomationOrchestratorPipelineValidationResult =
  | Readonly<{
      status: "valid";
      valid: true;
      subject: AutomationOrchestratorPipelineValidationSubject;
      diagnostics: readonly AutomationOrchestratorPipelineValidationDiagnostic[];
    }>
  | Readonly<{
      status: "invalid";
      valid: false;
      subject: AutomationOrchestratorPipelineValidationSubject;
      diagnostics: readonly AutomationOrchestratorPipelineValidationDiagnostic[];
    }>;
