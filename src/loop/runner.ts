import { randomUUID } from "node:crypto";

import { defaultAgentRegistry } from "../agents/registry.js";
import type { AgentRegistry } from "../agents/registry.js";
import { buildMinimalContext } from "../context/builder.js";
import { createExecutionPlan } from "../executor/index.js";
import type { MinimalContextPackage } from "../context/types.js";
import { loadConfig, type Config, type ProjectConfig } from "../core/config.js";
import { findProject } from "../core/project.js";
import { DEFAULT_AGENT_POLICY } from "../policy/defaults.js";
import { resolvePolicy } from "../policy/resolver.js";
import type { AgentPolicy, AgentPolicyResolution } from "../policy/types.js";
import { planLoopCycle, type LoopPlan } from "./planner.js";
import { canTransition } from "./state-machine.js";
import { executePlan } from "../execution/pipeline.js";
import type {
  LoopRunFailure,
  LoopRunMode,
  LoopRunResult,
  LoopRunStatus,
  LoopRunStep,
  LoopRunStepStatus,
} from "./types.js";

export type LoopRunPlanOptions = Readonly<{
  now?: () => string;
  generateRunId?: () => string;
  loadConfig?: () => Config;
  planLoopCycle?: (project: ProjectConfig) => LoopPlan;
  agentPolicy?: AgentPolicy;
  agentRegistry?: AgentRegistry;
  resolvePolicy?: typeof resolvePolicy;
  buildMinimalContext?: typeof buildMinimalContext;
}>;

export function runLoopPlan(
  projectName: string,
  options: LoopRunPlanOptions = {},
): LoopRunResult {
  const now = options.now ?? (() => new Date().toISOString());
  const generateRunId = options.generateRunId ?? (() => randomUUID());
  const resolveConfig = options.loadConfig ?? loadConfig;
  const plan = options.planLoopCycle ?? planLoopCycle;
  const policy = options.agentPolicy ?? DEFAULT_AGENT_POLICY;
  const registry = options.agentRegistry ?? defaultAgentRegistry;
  const resolveAgentPolicy = options.resolvePolicy ?? resolvePolicy;
  const buildContextPackage =
    options.buildMinimalContext ?? buildMinimalContext;

  const mode: LoopRunMode = "plan";
  const runId = generateRunId();
  const startedAt = now();
  const executionPlan = createExecutionPlan({
    sessionId: runId,
    createdAt: startedAt,
  });

  const executionResult = executePlan(executionPlan, now);

  void executionResult;
  const steps: LoopRunStep[] = [];
  let status: LoopRunStatus = "idle";

  // `to` is the target LoopRunStatus, checked against the current `status`
  // via canTransition before the mutation. `stepName` is only a label for the
  // recorded LoopRunStep and happens to reuse the status name at most call
  // sites below — it is not a second status and does not represent the
  // transition's source state (that source is always the closure's `status`).
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
    const timestamp = now();
    steps.push({
      name: stepName,
      status: stepStatus,
      startedAt: timestamp,
      completedAt: timestamp,
      details,
    });
  }

  function finalize(
    candidate: LoopRunResult["candidate"],
    failure: LoopRunFailure | null,
    agentPolicy: AgentPolicyResolution | null = null,
    contextPackage: MinimalContextPackage | null = null,
  ): LoopRunResult {
    return {
      schemaVersion: 1,
      runId: executionPlan.session.sessionId,
      project: projectName,
      mode,
      status,
      startedAt: executionPlan.session.createdAt,
      completedAt: now(),
      candidate,
      steps,
      validation: null,
      modifiedFiles: [],
      commit: null,
      publication: null,
      failure,
      agentPolicy,
      contextPackage,
    };
  }

  const config = resolveConfig();
  const project = findProject(config, projectName);

  transition("planning", "planning", "completed", [
    `Resolving project: ${projectName}`,
  ]);

  if (!project) {
    transition("failed", "failed", "failed", [
      `Unknown project: ${projectName}`,
    ]);

    return finalize(null, {
      code: "unknown_project",
      message: `Unknown project: ${projectName}`,
      details: [projectName],
    });
  }

  const cycle = plan(project);

  if (cycle.outcome === "blocked") {
    transition("blocked", "blocked", "blocked", [cycle.reason]);

    return finalize(cycle.candidate, {
      code: "no_safe_candidate",
      message: cycle.reason,
      details: cycle.candidate ? [cycle.candidate.text] : [],
    });
  }

  // "ready" and "completed" below are step names equal to the target status
  // (stepName mirrors `to`, by design — see the step-name/status naming note
  // on the `transition` helper above), each driving one real, distinct,
  // canTransition-checked state change: planning -> ready, then ready ->
  // completed. There is no ready -> ready or completed -> completed self
  // transition; `status` only ever holds the previous value at the time
  // canTransition is checked.
  transition("ready", "ready", "completed", [
    `Selected candidate: ${cycle.candidate.text}`,
  ]);

  // Mode "plan" never executes: ready -> completed is a first-class transition
  // (see state-machine.ts) that reports the cycle as done without ever going
  // through executing/validating.
  transition("completed", "completed", "completed", cycle.plannedSteps);

  // Forecast-only: resolves which agent profile *would* be selected for this
  // candidate, without ever calling it. Pure lookup against a local
  // registry — no network, no process, no side effect. See
  // docs/architecture/agent-policy-engine.md.
  const agentPolicy = resolveAgentPolicy({
    policy,
    registry,
    candidate: cycle.candidate,
    mode: "plan",
  });

  // Bounded, deterministic, local: builds the Minimal Context Package (V7.5)
  // from the same snapshot the planner already computed, using the context
  // budget the policy forecast just derived. No file read outside the
  // project, no network, no agent call. See
  // docs/architecture/minimal-context-builder.md.
  const contextPackage = buildContextPackage(
    cycle.snapshot,
    agentPolicy.requirements.contextBudget,
  );

  return finalize(cycle.candidate, null, agentPolicy, contextPackage);
}
