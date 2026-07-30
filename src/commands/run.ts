import {
  generateExecutionReport,
  LOOP_RUN_MODES,
  runLoopCommit,
  runLoopExecute,
  runLoopPlan,
  type LoopRunMode,
  type LoopRunResult,
  type ProjectConfig,
} from "../core/index.js";
import { composeCodexProvider } from "../composition/codex-provider.js";
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

function printCommandError(
  json: boolean,
  code: Parameters<typeof printJsonError>[0],
  message: string,
): number {
  if (json) printJsonError(code, message);
  else terminal.error(message);
  return 1;
}

export async function runLoopRunCommand(
  project: ProjectConfig,
  mode: LoopRunMode,
  json: boolean,
  options: RunLoopRunCommandOptions = {},
): Promise<number> {
  if (mode === "publish") {
    return printCommandError(
      json,
      "mode_not_implemented",
      "Loop run mode not implemented: publish",
    );
  }

  if (options.provider === "codex" && !options.providerExecutable) {
    return printCommandError(
      json,
      "missing_provider_executable",
      "Codex provider requires --provider-executable.",
    );
  }

  let executor;
  if (options.provider === "codex" && options.providerExecutable) {
    try {
      executor = composeCodexProvider({
        executable: options.providerExecutable,
        ...(options.providerModel ? { model: options.providerModel } : {}),
        ...(options.providerTimeoutMs ? { timeoutMs: options.providerTimeoutMs } : {}),
      });
    } catch {
      return printCommandError(
        json,
        "invalid_provider_executable",
        "Codex provider executable must resolve to a command named codex.",
      );
    }
  }

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
      return printCommandError(
        json,
        "missing_commit_message",
        "Commit mode requires --commit-message.",
      );
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
