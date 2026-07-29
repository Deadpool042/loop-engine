import {
  generateExecutionReport,
  LOOP_RUN_MODES,
  runLoopExecute,
  runLoopPlan,
  type LoopRunMode,
  type LoopRunResult,
  type ProjectConfig,
} from "../core/index.js";
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

  terminal.section("Cycle steps");
  if (result.steps.length === 0) {
    terminal.warning("No cycle step recorded.");
  } else {
    for (const step of result.steps) {
      terminal.info(`${step.name}: ${step.status}`);
      for (const detail of step.details) terminal.info(`  ${detail}`);
    }
  }

  terminal.section(
    result.mode === "plan" ? "Agent policy (forecast)" : "Agent policy",
  );
  if (result.agentPolicy) {
    terminal.info(`Status: ${result.agentPolicy.status}`);
    if (result.agentPolicy.selection?.outcome === "selected") {
      terminal.info(
        `${result.mode === "plan" ? "Would select" : "Selected"}: ${result.agentPolicy.selection.profile.id} (effort ${result.agentPolicy.selection.profile.effort})`,
      );
    }
    if (result.mode === "plan") terminal.info("No agent was called.");
  } else {
    terminal.warning("No agent policy resolution available for this cycle.");
  }

  terminal.section(
    result.mode === "plan" ? "Context package (forecast)" : "Context package",
  );
  if (result.contextPackage) {
    const { files, omitted, totalCharacters, estimatedTokens, truncated } =
      result.contextPackage;

    terminal.info(
      `Files included: ${files.length} (${totalCharacters} chars, ~${estimatedTokens} tokens)`,
    );
    terminal.info(`Omitted: ${omitted.length}`);

    if (truncated) {
      terminal.warning("Context was truncated to fit the budget.");
    }
  } else {
    terminal.warning("No context package available for this cycle.");
  }

  terminal.section("Validation");
  if (result.validation) {
    terminal.info(`Status: ${result.validation.status}`);
    terminal.info(`Attempts: ${result.validation.attempts}`);
    terminal.info(`Repair attempts: ${result.validation.repairAttempts}`);
    if (result.validation.failedCommand) {
      terminal.error(`Failed command: ${result.validation.failedCommand}`);
    }
  } else {
    terminal.info("No validation executed.");
  }

  terminal.section("Worktree");
  if (result.modifiedFiles.length === 0) {
    terminal.success(
      result.mode === "plan"
        ? "No modification performed."
        : "No modified file reported by the execution ports.",
    );
  } else {
    for (const file of result.modifiedFiles) terminal.info(file);
  }
  terminal.info("Commit: not performed.");
  terminal.info("Publication: not performed.");

  if (result.failure) {
    terminal.section("Failure");
    terminal.error(`${result.failure.code}: ${result.failure.message}`);
  }
}

function printLoopRunResultJson(result: LoopRunResult): void {
  console.log(JSON.stringify(generateExecutionReport(result)));
}

export type RunLoopRunCommandOptions = Readonly<{
  maxRepairs?: number;
}>;

export async function runLoopRunCommand(
  project: ProjectConfig,
  mode: LoopRunMode,
  json: boolean,
  options: RunLoopRunCommandOptions = {},
): Promise<number> {
  if (mode === "commit" || mode === "publish") {
    const message = `Loop run mode not implemented: ${mode}`;

    if (json) {
      printJsonError("mode_not_implemented", message);
    } else {
      terminal.error(message);
    }

    return 1;
  }

  const result =
    mode === "plan"
      ? runLoopPlan(project.name)
      : await runLoopExecute(project.name, {
          maxRepairs: options.maxRepairs ?? 0,
        });

  if (json) {
    printLoopRunResultJson(result);
  } else {
    printLoopRunResult(result);
  }

  return result.status === "failed" ? 1 : 0;
}
