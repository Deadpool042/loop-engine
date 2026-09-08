import { randomUUID } from "node:crypto";

import { defaultAgentRegistry } from "../agents/registry.js";
import type { AgentRegistry } from "../agents/registry.js";
import { buildMinimalContext } from "../context/builder.js";
import type { MinimalContextPackage } from "../context/types.js";
import { loadConfig, type Config, type ProjectConfig } from "../core/config.js";
import { findProject } from "../core/project.js";
import { DEFAULT_AGENT_POLICY } from "../policy/defaults.js";
import { resolvePolicy } from "../policy/resolver.js";
import type { AgentPolicy, AgentPolicyResolution } from "../policy/types.js";
import { createLoopExecutionPlan } from "./execution-plan.js";
import { inspectWorktreeContentPolicy } from "./content-policy.js";
import { findOutOfScopeFiles } from "./file-scope.js";
import {
  createModelEscalationEvidence,
  resolveIntraProviderModelEscalation,
  resolveModelAttemptBudget,
  type LoopModelEscalationAttemptEvidence,
} from "./model-escalation.js";
import { readModifiedWorktreeFiles } from "./worktree-status.js";
import { planLoopCycle, type LoopPlan } from "./planner.js";
import { canTransition } from "./state-machine.js";
import {
  unavailableLoopExecutor,
  validateLoopExecution,
  type LoopExecutor,
  type LoopRepairer,
  type LoopValidator,
  type LoopValidatorResult,
} from "./execution.js";
import type { LoopRunPlanOptions } from "./runner.js";
import type { AutoMicroLotDecomposition } from "./micro-lot-decomposition.js";
import type {
  LoopRunFailure,
  LoopRunResult,
  LoopRunStatus,
  LoopRunStep,
  LoopRunStepStatus,
  LoopRunValidation,
} from "./types.js";

export type LoopRunExecuteOptions = LoopRunPlanOptions &
  Readonly<{
    executor?: LoopExecutor;
    validator?: LoopValidator;
    repairer?: LoopRepairer;
    maxRepairs?: number;
    /** Composition-only ceiling; AUTO sets this to one without changing global policy. */
    maxModelAttempts?: number;
    /** AUTO-only deterministic narrowing of manifestly oversized governed candidates. */
    decomposeOversizedCandidate?: boolean;
    /** Internal composition override for an already allocated isolated workspace. */
    executionProjectPath?: string;
    /** Explicit composition-only destination for a validated isolated patch. */
    exportPatchPath?: string;
    /** Test-only seam; production always uses the local Git worktree inventory. */
    readModifiedWorktreeFiles?: typeof readModifiedWorktreeFiles;
    /**
     * Composition-only reset for an already isolated execution workspace.
     * When provided, model escalation restarts from the immutable source HEAD
     * instead of inheriting an unvalidated delta from the previous model.
     */
    resetExecutionWorkspace?: (executionProjectPath: string) => Promise<void>;
    /** Optional, public-safe observation hook for real runner transitions. */
    onProgress?: (event: LoopRunExecuteProgressEvent) => void;
  }>;

export type LoopRunExecuteProgressEvent = Readonly<{
  status: LoopRunStatus;
  at: string;
  runId: string;
  step: string;
  details: readonly string[];
  executor: Readonly<{
    profileId: string;
    provider: string;
    runtime: string;
    model: string;
    effort: string;
    fundingMode: string | null;
    attempt: number;
    maxAttempts: number;
  }> | null;
}>;

type ExecuteDependencies = Readonly<{
  now: () => string;
  generateRunId: () => string;
  loadConfig: () => Config;
  planLoopCycle: (
    project: ProjectConfig,
    options?: {
      candidateId?: string;
      executionDecisionProjectPath?: string;
      decomposeOversizedCandidate?: boolean;
    },
  ) => LoopPlan;
  agentPolicy: AgentPolicy;
  agentRegistry: AgentRegistry;
  resolvePolicy: typeof resolvePolicy;
  buildMinimalContext: typeof buildMinimalContext;
  executor: LoopExecutor;
  validator: LoopValidator;
  repairer: LoopRepairer | null;
  maxRepairs: number;
  readModifiedWorktreeFiles: typeof readModifiedWorktreeFiles;
  resetExecutionWorkspace:
    ((executionProjectPath: string) => Promise<void>) | null;
}>;

function resolveDependencies(
  options: LoopRunExecuteOptions,
): ExecuteDependencies {
  return {
    now: options.now ?? (() => new Date().toISOString()),
    generateRunId: options.generateRunId ?? (() => randomUUID()),
    loadConfig: options.loadConfig ?? loadConfig,
    planLoopCycle: options.planLoopCycle ?? planLoopCycle,
    agentPolicy: options.agentPolicy ?? DEFAULT_AGENT_POLICY,
    agentRegistry: options.agentRegistry ?? defaultAgentRegistry,
    resolvePolicy: options.resolvePolicy ?? resolvePolicy,
    buildMinimalContext: options.buildMinimalContext ?? buildMinimalContext,
    executor: options.executor ?? unavailableLoopExecutor,
    validator: options.validator ?? validateLoopExecution,
    repairer: options.repairer ?? null,
    maxRepairs: options.maxRepairs ?? 0,
    readModifiedWorktreeFiles:
      options.readModifiedWorktreeFiles ?? readModifiedWorktreeFiles,
    resetExecutionWorkspace: options.resetExecutionWorkspace ?? null,
  };
}

function isValidRepairBudget(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function addModifiedFiles(target: Set<string>, files: readonly string[]): void {
  for (const file of files) {
    const normalized = file.trim();
    if (normalized.length > 0) target.add(normalized);
  }
}

function createValidationResult(
  project: ProjectConfig,
  result: LoopValidatorResult,
  attempts: number,
  repairAttempts: number,
): LoopRunValidation {
  return Object.freeze({
    status: result.status,
    attempts,
    repairAttempts,
    commands: Object.freeze([...project.validation]),
    failedCommand: result.failedCommand,
    exitCode: result.exitCode,
  });
}

function internalFailure(
  code: string,
  message: string,
  detail: string,
): LoopRunFailure {
  return Object.freeze({
    code,
    message,
    details: Object.freeze([detail]),
  });
}

/**
 * Runs one execute-mode LoopRunner cycle through injected executor and repair
 * ports. The runner never commits or publishes and all validation failures fail
 * closed once the finite repair budget is exhausted.
 */
export async function runLoopExecute(
  projectName: string,
  options: LoopRunExecuteOptions = {},
): Promise<LoopRunResult> {
  const dependencies = resolveDependencies(options);
  const runId = dependencies.generateRunId();
  const startedAt = dependencies.now();
  const steps: LoopRunStep[] = [];
  const modifiedFiles = new Set<string>();
  let status: LoopRunStatus = "idle";
  let validation: LoopRunValidation | null = null;
  let agentPolicy: AgentPolicyResolution | null = null;
  let contextPackage: MinimalContextPackage | null = null;
  let writableFileScope: readonly string[] | null = null;
  let brief: NonNullable<LoopRunResult["brief"]> | null = null;
  const modelEscalationAttempts: LoopModelEscalationAttemptEvidence[] = [];
  let modelAttemptBudget = 1;
  let decomposition: AutoMicroLotDecomposition | null = null;

  function transition(
    to: LoopRunStatus,
    stepName: string,
    stepStatus: LoopRunStepStatus,
    details: readonly string[],
  ): void {
    if (!canTransition(status, to)) {
      throw new Error(`Invalid loop run transition: ${status} -> ${to}`);
    }

    status = to;
    const timestamp = dependencies.now();
    steps.push(
      Object.freeze({
        name: stepName,
        status: stepStatus,
        startedAt: timestamp,
        completedAt: timestamp,
        details: Object.freeze([...details]),
      }),
    );
    try {
      const selected =
        agentPolicy?.selection?.outcome === "selected"
          ? agentPolicy.selection.profile
          : null;
      options.onProgress?.(
        Object.freeze({
          status: to,
          at: timestamp,
          runId,
          step: stepName,
          details: Object.freeze([...details]),
          executor:
            selected === null
              ? null
              : Object.freeze({
                  profileId: selected.id,
                  provider: selected.provider,
                  runtime: selected.runtime,
                  model: selected.model,
                  effort: selected.effort,
                  fundingMode: selected.fundingMode ?? null,
                  attempt: modelEscalationAttempts.length + 1,
                  maxAttempts: modelAttemptBudget,
                }),
        }),
      );
    } catch {
      // Observation is auxiliary and must never alter the governed run.
    }
  }

  function finalize(
    candidate: LoopRunResult["candidate"],
    failure: LoopRunFailure | null,
  ): LoopRunResult {
    return Object.freeze({
      schemaVersion: 1,
      runId,
      project: projectName,
      mode: "execute",
      status,
      startedAt,
      completedAt: dependencies.now(),
      candidate,
      steps: Object.freeze([...steps]),
      validation,
      modifiedFiles: Object.freeze([...modifiedFiles].sort()),
      commit: null,
      publication: null,
      failure,
      agentPolicy,
      contextPackage,
      writableFileScope,
      brief,
      modelAttemptBudget,
      decomposition,
      modelEscalationEvidence:
        modelEscalationAttempts.length === 0
          ? null
          : createModelEscalationEvidence(
              modelAttemptBudget,
              modelEscalationAttempts,
            ),
    });
  }

  transition("planning", "planning", "completed", [
    `Resolving project: ${projectName}`,
  ]);

  if (
    options.maxModelAttempts !== undefined &&
    (!Number.isInteger(options.maxModelAttempts) ||
      options.maxModelAttempts < 1)
  ) {
    transition("failed", "failed", "failed", ["Invalid model attempt budget."]);
    return finalize(
      null,
      internalFailure(
        "invalid_model_attempt_budget",
        "maxModelAttempts must be a positive integer.",
        String(options.maxModelAttempts),
      ),
    );
  }

  if (!isValidRepairBudget(dependencies.maxRepairs)) {
    transition("failed", "failed", "failed", ["Invalid repair budget."]);
    return finalize(
      null,
      internalFailure(
        "invalid_repair_budget",
        "maxRepairs must be a non-negative integer.",
        String(dependencies.maxRepairs),
      ),
    );
  }

  const config = dependencies.loadConfig();
  const project = findProject(config, projectName);
  if (!project) {
    transition("failed", "failed", "failed", [
      `Unknown project: ${projectName}`,
    ]);
    return finalize(
      null,
      internalFailure(
        "unknown_project",
        `Unknown project: ${projectName}`,
        projectName,
      ),
    );
  }

  const executionProject =
    options.executionProjectPath === undefined
      ? project
      : Object.freeze({ ...project, path: options.executionProjectPath });

  const cycle = dependencies.planLoopCycle(
    executionProject,
    Object.freeze({
      ...(options.candidateId === undefined
        ? {}
        : { candidateId: options.candidateId }),
      ...(options.executionProjectPath === undefined
        ? {}
        : { executionDecisionProjectPath: project.path }),
      ...(options.decomposeOversizedCandidate === true
        ? { decomposeOversizedCandidate: true }
        : {}),
    }),
  );
  if (cycle.outcome === "blocked") {
    transition("blocked", "blocked", "blocked", [cycle.reason]);
    return finalize(
      cycle.candidate,
      Object.freeze({
        code: cycle.code ?? "no_safe_candidate",
        message: cycle.reason,
        details: Object.freeze(cycle.candidate ? [cycle.candidate.text] : []),
      }),
    );
  }

  const governedExecution = cycle.authorizedBy === "execution_decision";
  decomposition = cycle.decomposition ?? null;

  agentPolicy = dependencies.resolvePolicy({
    policy: dependencies.agentPolicy,
    registry: dependencies.agentRegistry,
    candidate: cycle.candidate,
    mode: "execute",
  });

  if (
    agentPolicy.status !== "resolved" ||
    agentPolicy.selection?.outcome !== "selected"
  ) {
    transition("failed", "failed", "failed", [
      `Agent policy rejected execute mode: ${agentPolicy.status}`,
    ]);
    return finalize(
      cycle.candidate,
      Object.freeze({
        code: "agent_policy_rejected",
        message: "Agent policy did not admit execute mode.",
        details: Object.freeze([...agentPolicy.reasons]),
      }),
    );
  }

  modelAttemptBudget = resolveModelAttemptBudget(
    agentPolicy,
    dependencies.agentPolicy.allowEscalation,
  );
  if (options.maxModelAttempts !== undefined) {
    modelAttemptBudget = Math.min(
      modelAttemptBudget,
      options.maxModelAttempts,
    );
  }

  const policyRepairCeiling =
    agentPolicy.selectionRequest.budgetCeiling?.maxRepairs;
  const admittedMaxRepairs =
    typeof policyRepairCeiling === "number"
      ? Math.min(dependencies.maxRepairs, policyRepairCeiling)
      : dependencies.maxRepairs;
  const effectiveMaxRepairs = admittedMaxRepairs;

  brief =
    cycle.brief === undefined
      ? null
      : Object.freeze({
          objective: cycle.brief.objective,
          deliverables: Object.freeze([...cycle.brief.deliverables]),
          outOfScope: Object.freeze([...cycle.brief.outOfScope]),
        });
  contextPackage = dependencies.buildMinimalContext(
    cycle.snapshot,
    agentPolicy.requirements.contextBudget,
  );
  const buildExecutionPlan = (resolution: AgentPolicyResolution) =>
    createLoopExecutionPlan(
      Object.freeze({
        runId,
        project: Object.freeze({ name: executionProject.name }),
        candidate: cycle.candidate,
        agentPolicy: resolution,
        contextPackage,
        ...(cycle.allowedPaths === undefined
          ? {}
          : { allowedPaths: cycle.allowedPaths }),
        ...(cycle.brief === undefined ? {} : { brief: cycle.brief }),
        ...(cycle.decomposition === undefined
          ? {}
          : { microLot: cycle.decomposition }),
      }),
    );
  let executionPlan = buildExecutionPlan(agentPolicy);
  writableFileScope = executionPlan.allowedPaths ?? null;

  transition("ready", "ready", "completed", [
    `Selected candidate: ${cycle.candidate.text}`,
    `Selected executor profile: ${executionPlan.profileId}`,
    `Execution plan: ${executionPlan.provider}/${executionPlan.runtime}/${executionPlan.model}`,
    `Repair budget: requested=${dependencies.maxRepairs}, effective=${effectiveMaxRepairs}`,
    `Model attempt budget: ${modelAttemptBudget}`,
  ]);
  transition("executing", "executing", "completed", [
    "Calling the injected LoopExecutor once with the immutable execution plan.",
  ]);

  let completedModelAttempts = 1;
  let executionResult;
  try {
    executionResult = await dependencies.executor(
      executionPlan,
      executionProject.path,
    );
  } catch {
    transition("failed", "failed", "failed", [
      "The injected LoopExecutor threw an error.",
    ]);
    return finalize(
      cycle.candidate,
      internalFailure(
        "executor_failed",
        "The injected LoopExecutor failed.",
        "Executor errors are redacted from the public result.",
      ),
    );
  }

  function detectScopeViolation(): LoopRunFailure | null {
    if (writableFileScope === null) return null;
    const rejected = findOutOfScopeFiles([...modifiedFiles], writableFileScope);
    if (rejected.length === 0) return null;
    return Object.freeze({
      code: "scope_violation",
      message:
        "Modified files fall outside the authorized writable file scope.",
      details: Object.freeze(rejected.map((path) => `Out of scope: ${path}`)),
    });
  }

  function failForScopeViolation(): LoopRunResult | null {
    const failure = detectScopeViolation();
    if (failure === null) return null;
    transition("failed", "failed", "failed", [failure.message]);
    return finalize(cycle.candidate, failure);
  }

  function failForMissingGovernedDelta(): LoopRunResult | null {
    if (!governedExecution || modifiedFiles.size > 0) {
      return null;
    }

    transition("failed", "failed", "failed", [
      "Governed execution produced no worktree change.",
    ]);
    return finalize(
      cycle.candidate,
      Object.freeze({
        code: "no_effective_change",
        message: "Governed execution produced no worktree change.",
        details: Object.freeze([
          "A READY execution decision requires a non-empty worktree delta before validation.",
        ]),
      }),
    );
  }

  async function failForContentPolicyViolation(): Promise<LoopRunResult | null> {
    const inspection = await inspectWorktreeContentPolicy(
      executionPlan,
      executionProject.path,
      [...modifiedFiles],
    );
    if (inspection.outcome === "compliant") return null;

    const code =
      inspection.outcome === "violation"
        ? "content_policy_violation"
        : "content_policy_inspection_failed";
    const message =
      inspection.outcome === "violation"
        ? "Generated content violates the governed mission constraints."
        : "Generated content could not be verified against the governed mission constraints.";
    transition("failed", "failed", "failed", [message]);
    return finalize(
      cycle.candidate,
      Object.freeze({
        code,
        message,
        details: Object.freeze(["Content-policy diagnostics are redacted."]),
      }),
    );
  }

  async function refreshModifiedFilesFromWorktree(): Promise<LoopRunResult | null> {
    const actualModifiedFiles = await dependencies.readModifiedWorktreeFiles(
      executionProject.path,
    );
    if (actualModifiedFiles !== null) {
      modifiedFiles.clear();
      addModifiedFiles(modifiedFiles, actualModifiedFiles);
      return null;
    }

    transition("failed", "failed", "failed", [
      "Unable to determine the provider worktree state.",
    ]);
    return finalize(
      cycle.candidate,
      internalFailure(
        "worktree_status_failed",
        "Unable to determine the provider worktree state.",
        "Worktree inspection diagnostics are redacted from the public result.",
      ),
    );
  }

  async function resetWorkspaceForModelEscalation(): Promise<LoopRunResult | null> {
    if (dependencies.resetExecutionWorkspace === null) return null;

    try {
      await dependencies.resetExecutionWorkspace(executionProject.path);
    } catch {
      transition("failed", "failed", "failed", [
        "Unable to restore the isolated worktree before model escalation.",
      ]);
      return finalize(
        cycle.candidate,
        internalFailure(
          "model_escalation_workspace_reset_failed",
          "Unable to restore the isolated worktree before model escalation.",
          "Workspace reset diagnostics are redacted from the public result.",
        ),
      );
    }

    const resetModifiedFiles = await dependencies.readModifiedWorktreeFiles(
      executionProject.path,
    );
    if (resetModifiedFiles === null || resetModifiedFiles.length > 0) {
      transition("failed", "failed", "failed", [
        "The isolated worktree is not clean after model escalation reset.",
      ]);
      return finalize(
        cycle.candidate,
        internalFailure(
          "model_escalation_workspace_reset_failed",
          "The isolated worktree is not clean after model escalation reset.",
          "Model escalation never starts from an unverified worktree delta.",
        ),
      );
    }

    modifiedFiles.clear();
    return null;
  }

  const initialWorktreeFailure = await refreshModifiedFilesFromWorktree();
  if (initialWorktreeFailure !== null) return initialWorktreeFailure;

  const initialScopeViolation = detectScopeViolation();
  if (initialScopeViolation !== null) {
    if (dependencies.resetExecutionWorkspace === null) {
      transition("failed", "failed", "failed", [initialScopeViolation.message]);
      return finalize(cycle.candidate, initialScopeViolation);
    }

    executionResult = Object.freeze({
      status: "failed" as const,
      modifiedFiles: Object.freeze([...modifiedFiles].sort()),
      failure: initialScopeViolation,
    });
  }

  if (executionResult.status === "failed") {
    const escalation = resolveIntraProviderModelEscalation({
      registry: dependencies.agentRegistry,
      resolution: agentPolicy,
      currentPlan: executionPlan,
      allowEscalation: dependencies.agentPolicy.allowEscalation,
      completedAttempts: completedModelAttempts,
      maxAttempts: modelAttemptBudget,
      failureCode: executionResult.failure.code,
    });

    if (escalation.outcome === "escalated") {
      agentPolicy = escalation.resolution;
      executionPlan = buildExecutionPlan(agentPolicy);
      modelEscalationAttempts.push(escalation.evidence);
      completedModelAttempts += 1;
      transition("executing", "model_escalation", "completed", [
        `Escalating model after ${escalation.evidence.trigger}: ${escalation.evidence.fromProfileId} -> ${escalation.evidence.toProfileId}`,
        `Attempt ${completedModelAttempts}/${modelAttemptBudget}`,
      ]);

      const escalationResetFailure = await resetWorkspaceForModelEscalation();
      if (escalationResetFailure !== null) return escalationResetFailure;

      try {
        executionResult = await dependencies.executor(
          executionPlan,
          executionProject.path,
        );
      } catch {
        transition("failed", "failed", "failed", [
          "The escalated LoopExecutor threw an error.",
        ]);
        return finalize(
          cycle.candidate,
          internalFailure(
            "executor_failed",
            "The escalated LoopExecutor failed.",
            "Executor errors are redacted from the public result.",
          ),
        );
      }

      const escalatedWorktreeFailure = await refreshModifiedFilesFromWorktree();
      if (escalatedWorktreeFailure !== null) return escalatedWorktreeFailure;
      const escalatedScopeFailure = failForScopeViolation();
      if (escalatedScopeFailure !== null) return escalatedScopeFailure;
    }

    if (executionResult.status === "failed") {
      transition("failed", "failed", "failed", [
        executionResult.failure.message,
      ]);
      return finalize(cycle.candidate, executionResult.failure);
    }
  }

  const initialCompletionFailure = failForMissingGovernedDelta();
  if (initialCompletionFailure !== null) return initialCompletionFailure;

  const initialContentPolicyFailure = await failForContentPolicyViolation();
  if (initialContentPolicyFailure !== null) return initialContentPolicyFailure;

  transition("validating", "validating", "completed", executionResult.details);

  let validationAttempts = 0;
  let repairAttempts = 0;

  while (true) {
    validationAttempts += 1;
    let validationAttempt: LoopValidatorResult;

    try {
      validationAttempt = await dependencies.validator(
        Object.freeze({
          runId,
          project: executionProject,
          candidate: cycle.candidate,
          modifiedFiles: Object.freeze([...modifiedFiles].sort()),
          attempt: validationAttempts,
        }),
      );
    } catch {
      validation = Object.freeze({
        status: "failed",
        attempts: validationAttempts,
        repairAttempts,
        commands: Object.freeze([...project.validation]),
        failedCommand: null,
        exitCode: 1,
      });
      transition("failed", "failed", "failed", [
        "The injected LoopValidator threw an error.",
      ]);
      return finalize(
        cycle.candidate,
        internalFailure(
          "validation_error",
          "The injected LoopValidator failed.",
          "Validator errors are redacted from the public result.",
        ),
      );
    }

    validation = createValidationResult(
      project,
      validationAttempt,
      validationAttempts,
      repairAttempts,
    );

    if (validationAttempt.status === "passed") {
      transition(
        "completed",
        "completed",
        "completed",
        validationAttempt.details,
      );
      return finalize(cycle.candidate, null);
    }

    if (repairAttempts >= effectiveMaxRepairs) {
      const escalation = resolveIntraProviderModelEscalation({
        registry: dependencies.agentRegistry,
        resolution: agentPolicy,
        currentPlan: executionPlan,
        allowEscalation: dependencies.agentPolicy.allowEscalation,
        completedAttempts: completedModelAttempts,
        maxAttempts: modelAttemptBudget,
        failureCode: "validation_failed",
      });

      if (escalation.outcome === "escalated") {
        agentPolicy = escalation.resolution;
        executionPlan = buildExecutionPlan(agentPolicy);
        modelEscalationAttempts.push(escalation.evidence);
        completedModelAttempts += 1;
        transition("executing", "model_escalation", "completed", [
          `Escalating model after validation_failed: ${escalation.evidence.fromProfileId} -> ${escalation.evidence.toProfileId}`,
          `Attempt ${completedModelAttempts}/${modelAttemptBudget}`,
        ]);

        const escalationResetFailure = await resetWorkspaceForModelEscalation();
        if (escalationResetFailure !== null) return escalationResetFailure;

        try {
          executionResult = await dependencies.executor(
            executionPlan,
            executionProject.path,
          );
        } catch {
          transition("failed", "failed", "failed", [
            "The escalated LoopExecutor threw an error.",
          ]);
          return finalize(
            cycle.candidate,
            internalFailure(
              "executor_failed",
              "The escalated LoopExecutor failed.",
              "Executor errors are redacted from the public result.",
            ),
          );
        }

        const escalatedWorktreeFailure =
          await refreshModifiedFilesFromWorktree();
        if (escalatedWorktreeFailure !== null) return escalatedWorktreeFailure;
        const escalatedScopeFailure = failForScopeViolation();
        if (escalatedScopeFailure !== null) return escalatedScopeFailure;

        if (executionResult.status === "failed") {
          transition("failed", "failed", "failed", [
            executionResult.failure.message,
          ]);
          return finalize(cycle.candidate, executionResult.failure);
        }

        const escalatedCompletionFailure = failForMissingGovernedDelta();
        if (escalatedCompletionFailure !== null)
          return escalatedCompletionFailure;

        const escalatedContentPolicyFailure =
          await failForContentPolicyViolation();
        if (escalatedContentPolicyFailure !== null)
          return escalatedContentPolicyFailure;

        transition(
          "validating",
          "validating",
          "completed",
          executionResult.details,
        );
        continue;
      }

      transition("failed", "failed", "failed", [
        "Validation failed and the repair/model attempt budget is exhausted.",
      ]);
      return finalize(
        cycle.candidate,
        Object.freeze({
          code: "validation_failed",
          message:
            "Validation failed after the bounded repair and model escalation cycle.",
          details: Object.freeze([...validationAttempt.details]),
        }),
      );
    }

    transition(
      "repairing",
      "repairing",
      "completed",
      validationAttempt.details,
    );

    repairAttempts += 1;
    validation = createValidationResult(
      project,
      validationAttempt,
      validationAttempts,
      repairAttempts,
    );

    let repairResult;
    try {
      if (dependencies.repairer !== null) {
        repairResult = await dependencies.repairer(
          Object.freeze({
            runId,
            project: executionProject,
            candidate: cycle.candidate,
            agentPolicy,
            contextPackage,
            modifiedFiles: Object.freeze([...modifiedFiles].sort()),
            validation: validationAttempt,
            attempt: repairAttempts,
            maxRepairs: effectiveMaxRepairs,
          }),
        );
      } else {
        const repairPlan = Object.freeze({
          ...executionPlan,
          worktreeMode: "repair_existing" as const,
          policy: Object.freeze({
            ...executionPlan.policy,
            requiredCapabilities: Object.freeze([
              ...executionPlan.policy.requiredCapabilities,
            ]),
            requiredPermissions: Object.freeze([
              ...executionPlan.policy.requiredPermissions,
            ]),
            ...(executionPlan.policy.allowedFundingModes === undefined
              ? {}
              : {
                  allowedFundingModes: Object.freeze([
                    ...executionPlan.policy.allowedFundingModes,
                  ]),
                }),
            rationale: Object.freeze([
              ...executionPlan.policy.rationale,
              `Validation repair attempt ${repairAttempts}/${effectiveMaxRepairs}.`,
              `Failed command: ${validationAttempt.failedCommand ?? "unknown"}.`,
              ...(validationAttempt.repairDiagnostics ?? []).map(
                (line) => `Validation diagnostic: ${line}`,
              ),
            ]),
          }),
        });
        repairResult = await dependencies.executor(
          repairPlan,
          executionProject.path,
        );
      }
    } catch {
      transition("failed", "failed", "failed", [
        "The bounded repair execution threw an error.",
      ]);
      return finalize(
        cycle.candidate,
        internalFailure(
          "repair_failed",
          "The bounded validation repair failed.",
          "Repair diagnostics are redacted from the public result.",
        ),
      );
    }

    const repairWorktreeFailure = await refreshModifiedFilesFromWorktree();
    if (repairWorktreeFailure !== null) return repairWorktreeFailure;
    const repairScopeFailure = failForScopeViolation();
    if (repairScopeFailure !== null) return repairScopeFailure;

    if (repairResult.status === "failed") {
      transition("failed", "failed", "failed", [repairResult.failure.message]);
      return finalize(cycle.candidate, repairResult.failure);
    }

    const repairCompletionFailure = failForMissingGovernedDelta();
    if (repairCompletionFailure !== null) return repairCompletionFailure;

    const repairContentPolicyFailure = await failForContentPolicyViolation();
    if (repairContentPolicyFailure !== null) return repairContentPolicyFailure;

    transition("validating", "validating", "completed", repairResult.details);
  }
}
