import type { ProjectConfig } from "../core/config.js";
import { runLoopPlan } from "../loop/runner.js";
import { LOOP_RUN_MODES, type LoopRunMode, type LoopRunResult } from "../loop/types.js";
import { terminal } from "../ui/terminal.js";
import { printJsonError } from "./json-error.js";

export function isLoopRunMode(value: string): value is LoopRunMode {
  return (LOOP_RUN_MODES as readonly string[]).includes(value);
}

function printLoopRunResult(result: LoopRunResult): void {
  terminal.header(`Run • ${result.project}`);
  terminal.info(`Run id: ${result.runId}`);
  terminal.info(`Mode: ${result.mode}`);
  terminal.info(`Status: ${result.status}`);

  terminal.section("Candidate");
  if (result.candidate) {
    terminal.info(`Kind: ${result.candidate.kind}`);
    terminal.info(result.candidate.text);
  } else {
    terminal.warning("No roadmap candidate selected.");
  }

  terminal.section("Planned steps");
  const plannedSteps = result.steps.at(-1)?.details ?? [];
  if (plannedSteps.length > 0) {
    for (const step of plannedSteps) {
      terminal.info(step);
    }
  } else {
    terminal.warning("No planned steps.");
  }

  if (result.failure) {
    terminal.section("Failure");
    terminal.error(`${result.failure.code}: ${result.failure.message}`);
  }

  terminal.section("Worktree");
  terminal.success("No modification performed.");
}

function printLoopRunResultJson(result: LoopRunResult): void {
  console.log(
    JSON.stringify({
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
    }),
  );
}

export function runLoopRunCommand(project: ProjectConfig, mode: LoopRunMode, json: boolean): number {
  if (mode !== "plan") {
    const message = `Loop run mode not implemented: ${mode}`;

    if (json) {
      printJsonError("mode_not_implemented", message);
    } else {
      terminal.error(message);
    }

    return 1;
  }

  const result = runLoopPlan(project.name);

  if (json) {
    printLoopRunResultJson(result);
  } else {
    printLoopRunResult(result);
  }

  return 0;
}
