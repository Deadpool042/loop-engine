import {
  evaluateAutomationOrchestratorDelegation,
  type AutomationOrchestratorDelegationEvaluationInput,
} from "./delegation-evaluation/index.js";
import {
  evaluateAutomationOrchestratorDelegationSelection,
  type AutomationOrchestratorDelegationSelectionInput,
} from "./delegation-selection/index.js";
import {
  prepareAutomationOrchestratorDelegationDispatch,
  type AutomationOrchestratorDelegationDispatchInput,
} from "./delegation-dispatch/index.js";
import type { AutomationOrchestratorPipelineResult } from "./pipeline-types.js";

type AutomationOrchestratorPipelineInput = Readonly<{
  delegationEvaluation: AutomationOrchestratorDelegationEvaluationInput;
  delegationSelection: AutomationOrchestratorDelegationSelectionInput;
  delegationDispatch: AutomationOrchestratorDelegationDispatchInput;
}>;

/**
 * Pure composition of the three declarative delegation stages. It only wires
 * each preceding result into the next stage and adds no decision rule.
 */
export function evaluateAutomationOrchestratorPipeline(
  input: AutomationOrchestratorPipelineInput,
): AutomationOrchestratorPipelineResult {
  const delegationEvaluation = evaluateAutomationOrchestratorDelegation(
    input.delegationEvaluation,
  );
  if (delegationEvaluation.status !== "eligible") {
    return Object.freeze({
      progression: "evaluation" as const,
      delegationEvaluation,
      delegationSelection: null,
      delegationDispatch: null,
    });
  }

  const delegationSelection = evaluateAutomationOrchestratorDelegationSelection(
    Object.freeze({
      ...input.delegationSelection,
      context: Object.freeze({
        ...input.delegationSelection.context,
        delegationEvaluationResult: delegationEvaluation,
      }),
    }) as AutomationOrchestratorDelegationSelectionInput,
  );
  if (delegationSelection.status !== "selected") {
    return Object.freeze({
      progression: "selection" as const,
      delegationEvaluation,
      delegationSelection,
      delegationDispatch: null,
    });
  }

  const delegationDispatch = prepareAutomationOrchestratorDelegationDispatch(
    Object.freeze({
      ...input.delegationDispatch,
      context: Object.freeze({
        ...input.delegationDispatch.context,
        selectionResult: delegationSelection,
      }),
    }) as AutomationOrchestratorDelegationDispatchInput,
  );
  return Object.freeze({
    progression: "dispatch" as const,
    delegationEvaluation,
    delegationSelection,
    delegationDispatch,
  });
}
