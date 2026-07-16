import { randomUUID } from "node:crypto";

import { loadConfig, type Config, type ProjectConfig } from "../core/config.js";
import { findProject } from "../core/project.js";
import { planLoopCycle, type LoopPlan } from "./planner.js";
import { canTransition } from "./state-machine.js";
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
}>;

export function runLoopPlan(projectName: string, options: LoopRunPlanOptions = {}): LoopRunResult {
  const now = options.now ?? (() => new Date().toISOString());
  const generateRunId = options.generateRunId ?? (() => randomUUID());
  const resolveConfig = options.loadConfig ?? loadConfig;
  const plan = options.planLoopCycle ?? planLoopCycle;

  const mode: LoopRunMode = "plan";
  const runId = generateRunId();
  const startedAt = now();
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
    steps.push({ name: stepName, status: stepStatus, startedAt: timestamp, completedAt: timestamp, details });
  }

  function finalize(candidate: LoopRunResult["candidate"], failure: LoopRunFailure | null): LoopRunResult {
    return {
      schemaVersion: 1,
      runId,
      project: projectName,
      mode,
      status,
      startedAt,
      completedAt: now(),
      candidate,
      steps,
      validation: null,
      modifiedFiles: [],
      commit: null,
      publication: null,
      failure,
    };
  }

  const config = resolveConfig();
  const project = findProject(config, projectName);

  transition("planning", "planning", "completed", [`Resolving project: ${projectName}`]);

  if (!project) {
    transition("failed", "failed", "failed", [`Unknown project: ${projectName}`]);

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
  transition("ready", "ready", "completed", [`Selected candidate: ${cycle.candidate.text}`]);

  // Mode "plan" never executes: ready -> completed is a first-class transition
  // (see state-machine.ts) that reports the cycle as done without ever going
  // through executing/validating.
  transition("completed", "completed", "completed", cycle.plannedSteps);

  return finalize(cycle.candidate, null);
}
