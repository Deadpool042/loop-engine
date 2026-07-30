import {
  createCodexCliLoopExecutor,
  generateExecutionReport,
  LOOP_RUN_MODES,
  runLoopCommit,
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
  } else terminal.warning("No roadmap candidate selected.");

  terminal.section("Cycle steps");
  for (const step of result.steps) {
    terminal.info(`${step.name}: ${step.status}`);
    for (const detail of step.details) terminal.info(`  ${detail}`);
  }

  terminal.section(result.mode === "plan" ? "Agent policy (forecast)" : "Agent policy");
  if (result.agentPolicy?.selection?.outcome === "selected") {
    terminal.info(`Selected: ${result.agentPolicy.selection.profile.id} (effort ${result.agentPolicy.selection.profile.effort})`);
  } else if (result.mode === "plan") terminal.info("No agent was called.");

  terminal.section("Validation");
  if (result.validation) {
    terminal.info(`Status: ${result.validation.status}`);
    terminal.info(`Attempts: ${result.validation.attempts}`);
    terminal.info(`Repair attempts: ${result.validation.repairAttempts}`);
  } else terminal.info("No validation executed.");

  terminal.section("Worktree");
  if (result.modifiedFiles.length === 0) terminal.info("No modified file reported.");
  else for (const file of result.modifiedFiles) terminal.info(file);
  terminal.info(result.commit ? `Commit: ${result.commit.sha}` : "Commit: not performed.");
  terminal.info("Publication: not performed.");

  if (result.failure) {
    terminal.section("Failure");
    terminal.error(`${result.failure.code}: ${result.failure.message}`);
  }
}

export type RunLoopRunCommandOptions = Readonly<{
  maxRepairs?: number;
  provider?: "codex";
  providerExecutable?: string;
  providerModel?: string;
  providerTimeoutMs?: number;
  commitMessage?: string;
}>;

export async function runLoopRunCommand(
  project: ProjectConfig,
  mode: LoopRunMode,
  json: boolean,
  options: RunLoopRunCommandOptions = {},
): Promise<number> {
  if (mode === "publish") {
    const message = "Loop run mode not implemented: publish";
    if (json) printJsonError("mode_not_implemented", message);
    else terminal.error(message);
    return 1;
  }

  const executor =
    options.provider === "codex" && options.providerExecutable
      ? createCodexCliLoopExecutor({
          executable: options.providerExecutable,
          ...(options.providerModel ? { model: options.providerModel } : {}),
          ...(options.providerTimeoutMs ? { timeoutMs: options.providerTimeoutMs } : {}),
        })
      : undefined;

  let result: LoopRunResult;
  if (mode === "plan") {
    result = runLoopPlan(project.name);
  } else if (mode === "execute") {
    result = await runLoopExecute(project.name, {
      maxRepairs: options.maxRepairs ?? 0,
      ...(executor ? { executor } : {}),
    });
  } else {
    if (!options.commitMessage) {
      const message = "Commit mode requires --commit-message.";
      if (json) printJsonError("missing_commit_message", message);
      else terminal.error(message);
      return 1;
    }
    result = await runLoopCommit(project.name, {
      maxRepairs: options.maxRepairs ?? 0,
      commitMessage: options.commitMessage,
      ...(executor ? { executor } : {}),
    });
  }

  if (json) console.log(JSON.stringify(generateExecutionReport(result)));
  else printLoopRunResult(result);
  return result.status === "failed" ? 1 : 0;
}
