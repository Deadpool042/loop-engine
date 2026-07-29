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
  }>;

type ExecuteDependencies = Readonly<{
  now: () => string;
  generateRunId: () => string;
  loadConfig: () => Config;
  planLoopCycle: (project: ProjectConfig) => LoopPlan;
  agentPolicy: AgentPolicy;
  agentRegistry: AgentRegistry;
  resolvePolicy: typeof resolvePolicy;
  buildMinimalContext: typeof buildMinimalContext;
  executor: LoopExecutor;
  validator: LoopValidator;
  repairer: LoopRepairer | null;
  maxRepairs: number;
}>;

function resolveDependencies(options: LoopRunExecuteOptions): ExecuteDependencies {
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
    });
  }

  transition("planning", "planning", "completed", [
    `Resolving project: ${projectName}`,
  ]);

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

  const cycle = dependencies.planLoopCycle(project);
  if (cycle.outcome === "blocked") {
    transition("blocked", "blocked", "blocked", [cycle.reason]);
    return finalize(
      cycle.candidate,
      Object.freeze({
        code: "no_safe_candidate",
        message: cycle.reason,
        details: Object.freeze(cycle.candidate ? [cycle.candidate.text] : []),
      }),
    );
  }

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

  contextPackage = dependencies.buildMinimalContext(
    cycle.snapshot,
    agentPolicy.requirements.contextBudget,
  );

  transition("ready", "ready", "completed", [
    `Selected candidate: ${cycle.candidate.text}`,
    `Selected executor profile: ${agentPolicy.selection.profile.id}`,
  ]);
  transition("executing", "executing", "completed", [
    "Calling the injected LoopExecutor once.",
  ]);

  let executionResult;
  try {
    executionResult = await dependencies.executor(
      Object.freeze({
        runId,
        project,
        candidate: cycle.candidate,
        agentPolicy,
        contextPackage,
      }),
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

  addModifiedFiles(modifiedFiles, executionResult.modifiedFiles);
  if (executionResult.status === "failed") {
    transition("failed", "failed", "failed", [executionResult.failure.message]);
    return finalize(cycle.candidate, executionResult.failure);
  }

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
          project,
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
      transition("completed", "completed", "completed", validationAttempt.details);
      return finalize(cycle.candidate, null);
    }

    if (repairAttempts >= dependencies.maxRepairs) {
      transition("failed", "failed", "failed", [
        "Validation failed and the repair budget is exhausted.",
      ]);
      return finalize(
        cycle.candidate,
        Object.freeze({
          code: "validation_failed",
          message: "Validation failed after the bounded repair cycle.",
          details: Object.freeze([...validationAttempt.details]),
        }),
      );
    }

    transition("repairing", "repairing", "completed", validationAttempt.details);

    if (!dependencies.repairer) {
      transition("failed", "failed", "failed", [
        "No LoopRepairer is configured.",
      ]);
      return finalize(
        cycle.candidate,
        internalFailure(
          "repairer_unavailable",
          "Validation failed but no LoopRepairer is configured.",
          `Repair budget: ${dependencies.maxRepairs}`,
        ),
      );
    }

    repairAttempts += 1;
    validation = createValidationResult(
      project,
      validationAttempt,
      validationAttempts,
      repairAttempts,
    );

    let repairResult;
    try {
      repairResult = await dependencies.repairer(
        Object.freeze({
          runId,
          project,
          candidate: cycle.candidate,
          agentPolicy,
          contextPackage,
          modifiedFiles: Object.freeze([...modifiedFiles].sort()),
          validation: validationAttempt,
          attempt: repairAttempts,
          maxRepairs: dependencies.maxRepairs,
        }),
      );
    } catch {
      transition("failed", "failed", "failed", [
        "The injected LoopRepairer threw an error.",
      ]);
      return finalize(
        cycle.candidate,
        internalFailure(
          "repair_failed",
          "The injected LoopRepairer failed.",
          "Repairer errors are redacted from the public result.",
        ),
      );
    }

    addModifiedFiles(modifiedFiles, repairResult.modifiedFiles);
    if (repairResult.status === "failed") {
      transition("failed", "failed", "failed", [repairResult.failure.message]);
      return finalize(cycle.candidate, repairResult.failure);
    }

    transition("validating", "validating", "completed", repairResult.details);
  }
}
