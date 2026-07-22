import {
  runLoopPlan as runLoopPlanImplementation,
  type LoopRunPlanOptions,
} from "../loop/runner.js";
import type { LoopRunResult } from "../loop/types.js";
import {
  dryRunPolicyBoundLocalProcessExecution,
  executePolicyBoundLocalProcessWithReceipt,
  type PolicyBoundLocalProcessBridgeInput,
  type PolicyBoundLocalProcessExecutionResult,
  type RuntimeExecutionPlanDryRunResult,
} from "./runtime-execution-bridge.js";
import {
  deliverLoopRuntimeEscalationProjection,
  type LoopRuntimeEscalationProjectionSender,
} from "./loop-runtime-escalation-delivery.js";
import type { AgentEscalationRequest } from "../agents/escalation.js";
import type { AgentRegistry } from "../agents/registry.js";
import type { AgentSelectionRequest } from "../agents/selector.js";
import type { RuntimeResult } from "../runtime/types.js";
import type { LoopRuntimeEscalationPolicy } from "./loop-runtime-outcome.js";
import {
  evaluatePolicyBoundRuntimeExecutionEscalation,
  type LoopRuntimeAgentEscalationResult,
} from "./loop-runtime-escalation.js";

export type LoopPolicyBoundLocalProcessDryRunResult = Readonly<{
  loopRunResult: LoopRunResult;
  runtimeDryRunResult: RuntimeExecutionPlanDryRunResult;
}>;

export type LoopPolicyBoundLocalProcessExecutionResult = Readonly<{
  loopRunResult: LoopRunResult;
  runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult;
}>;

export type LoopPolicyBoundLocalProcessEscalationEvaluationResult =
  Readonly<{
    loopRunResult: LoopRunResult;
    runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult;
    escalationEvaluation: LoopRuntimeAgentEscalationResult;
  }>;

export type PrepareLoopPolicyBoundLocalProcessExecutionResult =
  LoopPolicyBoundLocalProcessDryRunResult;

export type ExecuteLoopPolicyBoundLocalProcessWithReceiptResult =
  LoopPolicyBoundLocalProcessExecutionResult;

export type ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult =
  Readonly<{
    loopRunResult: LoopRunResult;
    runtimeExecutionResult: PolicyBoundLocalProcessExecutionResult;
    escalationEvaluation: LoopRuntimeAgentEscalationResult;
  }>;

export type ExecuteLoopPolicyBoundLocalProcessAndDeliverEscalationProjectionResult =
  Readonly<{
    executionResult: ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult;
    projection: LoopRuntimeEscalationPublicProjection;
  }>;

export type LoopRuntimeEscalationPublicProjection = Readonly<{
  schemaVersion: typeof LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION;
  loopRunResult: LoopRunResult;
  runtime: Readonly<{
    outcome: PolicyBoundLocalProcessExecutionResult["outcome"];
    runtimeStatus: RuntimeResult["status"] | null;
    receipt: PolicyBoundLocalProcessExecutionResult["receipt"];
  }>;
  escalation: Readonly<{
    outcome: LoopRuntimeAgentEscalationResult["outcome"];
    failure: LoopRuntimeAgentEscalationResult["failure"];
    decision: LoopRuntimeAgentEscalationResult["decision"];
    selectedProfileId: string | null;
  }>;
}>;

export const LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION = 1 as const;

export type ExecuteLoopPolicyBoundLocalProcessWithReceiptOptions = LoopRunPlanOptions &
  Readonly<{
    executePolicyBoundLocalProcessWithReceipt?: (
      input: PolicyBoundLocalProcessBridgeInput,
    ) => Promise<PolicyBoundLocalProcessExecutionResult>;
  }>;

export type ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationInput =
  Readonly<{
    policy: LoopRuntimeEscalationPolicy;
    registry: AgentRegistry;
    request: AgentSelectionRequest;
    previousProfileId: string;
    failureReason: AgentEscalationRequest["failureReason"];
  }>;

/** Runs the plan-only LoopRunner through the stable Core boundary. */
export function runLoopPlan(
  projectName: string,
  options: LoopRunPlanOptions = {},
): LoopRunResult {
  return runLoopPlanImplementation(projectName, options);
}

/**
 * Adds an explicit policy-bound local-process dry-run on top of the historical
 * Loop plan result without changing the public LoopRunResult contract.
 */
export function prepareLoopPolicyBoundLocalProcessExecution(
  projectName: string,
  bridgeInput: PolicyBoundLocalProcessBridgeInput,
  options: LoopRunPlanOptions = {},
): LoopPolicyBoundLocalProcessDryRunResult {
  const loopRunResult = runLoopPlanImplementation(projectName, options);
  const runtimeDryRunResult = dryRunPolicyBoundLocalProcessExecution({
    ...bridgeInput,
    loopRunResult,
  });

  return {
    loopRunResult,
    runtimeDryRunResult,
  };
}

/**
 * Runs the historical Loop plan and the explicit policy-bound local-process
 * execution in sequence, without mutating the LoopRunResult contract.
 */
export async function executeLoopPolicyBoundLocalProcessWithReceipt(
  projectName: string,
  bridgeInput: PolicyBoundLocalProcessBridgeInput,
  options: ExecuteLoopPolicyBoundLocalProcessWithReceiptOptions = {},
): Promise<LoopPolicyBoundLocalProcessExecutionResult> {
  const {
    executePolicyBoundLocalProcessWithReceipt: executeRuntime =
      executePolicyBoundLocalProcessWithReceipt,
    ...planOptions
  } = options;
  const loopRunResult = runLoopPlanImplementation(projectName, planOptions);
  const runtimeExecutionResult = await executeRuntime({
    ...bridgeInput,
    loopRunResult,
  });

  return {
    loopRunResult,
    runtimeExecutionResult,
  };
}

/**
 * Adds runtime escalation evaluation on top of the historical Loop and
 * policy-bound local-process execution result without changing the public
 * LoopRunResult contract.
 */
export async function executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
  projectName: string,
  bridgeInput: PolicyBoundLocalProcessBridgeInput,
  escalationInput: ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationInput,
  options: ExecuteLoopPolicyBoundLocalProcessWithReceiptOptions = {},
): Promise<ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult> {
  const runtimeExecutionResult = await executeLoopPolicyBoundLocalProcessWithReceipt(
    projectName,
    bridgeInput,
    options,
  );
  const escalationEvaluation = evaluatePolicyBoundRuntimeExecutionEscalation({
    runtimeExecutionResult: runtimeExecutionResult.runtimeExecutionResult,
    policy: escalationInput.policy,
    registry: escalationInput.registry,
    request: escalationInput.request,
    previousProfileId: escalationInput.previousProfileId,
    failureReason: escalationInput.failureReason,
  });

  return Object.freeze({
    loopRunResult: runtimeExecutionResult.loopRunResult,
    runtimeExecutionResult: runtimeExecutionResult.runtimeExecutionResult,
    escalationEvaluation,
  });
}

/**
 * Adds explicit projection delivery on top of the policy-bound local-process
 * execution and escalation evaluation without changing the internal result.
 */
export async function executeLoopPolicyBoundLocalProcessAndDeliverEscalationProjection(
  projectName: string,
  bridgeInput: PolicyBoundLocalProcessBridgeInput,
  escalationInput: ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationInput,
  sender: LoopRuntimeEscalationProjectionSender,
  options: ExecuteLoopPolicyBoundLocalProcessWithReceiptOptions = {},
): Promise<ExecuteLoopPolicyBoundLocalProcessAndDeliverEscalationProjectionResult> {
  const executionResult = await executeLoopPolicyBoundLocalProcessWithEscalationEvaluation(
    projectName,
    bridgeInput,
    escalationInput,
    options,
  );
  const projection = projectLoopRuntimeEscalationResult(executionResult);

  await deliverLoopRuntimeEscalationProjection(projection, sender);

  return Object.freeze({
    executionResult,
    projection,
  });
}

export function projectLoopRuntimeEscalationResult(
  result: ExecuteLoopPolicyBoundLocalProcessWithEscalationEvaluationResult,
): LoopRuntimeEscalationPublicProjection {
  const runtimeStatus = result.runtimeExecutionResult.runtimeResult?.status ?? null;
  const selectedProfileId =
    result.escalationEvaluation.agentEscalationResult?.outcome === "escalated"
      ? result.escalationEvaluation.agentEscalationResult.profile.id
      : null;

  return Object.freeze({
    schemaVersion: LOOP_RUNTIME_ESCALATION_PUBLIC_SCHEMA_VERSION,
    loopRunResult: result.loopRunResult,
    runtime: Object.freeze({
      outcome: result.runtimeExecutionResult.outcome,
      runtimeStatus,
      receipt: result.runtimeExecutionResult.receipt,
    }),
    escalation: Object.freeze({
      outcome: result.escalationEvaluation.outcome,
      failure: result.escalationEvaluation.failure,
      decision: result.escalationEvaluation.decision,
      selectedProfileId,
    }),
  });
}

/** Preserves the public execution-report JSON shape used by CLI adapters. */
export function generateExecutionReport(result: LoopRunResult): LoopRunResult {
  return {
    schemaVersion: 1,
    runId: result.runId,
    project: result.project,
    mode: result.mode,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    candidate: result.candidate,
    steps: result.steps,
    validation: result.validation,
    modifiedFiles: result.modifiedFiles,
    commit: result.commit,
    publication: result.publication,
    failure: result.failure,
    agentPolicy: result.agentPolicy,
    contextPackage: result.contextPackage,
  };
}
